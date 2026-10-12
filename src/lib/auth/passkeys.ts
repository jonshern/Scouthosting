// Passkeys (WebAuthn) for Compass sign-in, built on @simplewebauthn.
//
// A passkey can be used three ways:
//   1. Sign in on its own from /login (./mfa-plugin.ts). It counts as
//      both steps: the device checks a fingerprint, face or PIN.
//   2. As the second step after a password or Google/Apple sign-in, on
//      /login/mfa, in place of an authenticator code.
//   3. Added and removed from /account/security.
//
// Relying party (which site a passkey belongs to) follows the host the
// browser is on:
//   - the apex and every <slug>.<apex> subdomain share one rpId, the apex,
//     so a passkey made on any of them works on all of them;
//   - an org's custom domain is its own rpId;
//   - outside production, localhost (and *.localhost) is "localhost";
//   - PASSKEY_EXTRA_HOSTS (comma-separated) adds hosts that are their own
//     rpId, e.g. the Mac's name or its Tailscale host for local testing.
// Any other host gets no passkeys.

import crypto from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const PASSKEY_CHALLENGE_SECONDS = 300;
// Adding a passkey needs a sign-in from the last hour, so a stolen
// session cookie alone can't plant a long-lived way back in.
export const PASSKEY_FRESH_SESSION_MS = 60 * 60 * 1000;
export const MAX_PASSKEYS_PER_USER = 10;

export type RelyingParty = { rpID: string; origins: string[] };

function hostOnly(raw: string): string {
  return raw.trim().toLowerCase().replace(/:\d+$/, "");
}

function extraHosts(): string[] {
  return (process.env.PASSKEY_EXTRA_HOSTS ?? "")
    .split(",")
    .map((h) => hostOnly(h))
    .filter(Boolean);
}

/**
 * The relying party for a request's Host header, or null when passkeys
 * aren't offered on that host. `isCustomDomain` says whether the host is
 * a known Org.customDomain (looked up by the caller).
 */
export function relyingPartyForHost(
  rawHost: string | null | undefined,
  opts: {
    apexHost: string;
    production: boolean;
    extraHosts?: string[];
    isCustomDomain?: boolean;
  },
): RelyingParty | null {
  if (!rawHost) return null;
  const withPort = rawHost.trim().toLowerCase();
  const host = hostOnly(withPort);
  const apex = hostOnly(opts.apexHost);
  // Browsers only allow WebAuthn over https, except on localhost, which
  // the Mac and the e2e server run on with NODE_ENV=production.
  const local = host === "localhost" || host.endsWith(".localhost");
  const origins = opts.production && !local
    ? [`https://${withPort}`]
    : [`https://${withPort}`, `http://${withPort}`];

  if (host === apex || host.endsWith(`.${apex}`)) return { rpID: apex, origins };
  if (opts.isCustomDomain) return { rpID: host, origins };
  if ((opts.extraHosts ?? []).includes(host)) return { rpID: host, origins };
  if (!opts.production && local) {
    return { rpID: "localhost", origins };
  }
  return null;
}

export async function relyingPartyFor(rawHost: string | null | undefined): Promise<RelyingParty | null> {
  const base = { apexHost: env.APEX_HOST, production: process.env.NODE_ENV === "production", extraHosts: extraHosts() };
  const rp = relyingPartyForHost(rawHost, base);
  if (rp || !rawHost) return rp;
  const org = await prisma.org.findUnique({
    where: { customDomain: hostOnly(rawHost) },
    select: { id: true },
  });
  return org ? relyingPartyForHost(rawHost, { ...base, isCustomDomain: true }) : null;
}

/**
 * The relying party for the site the browser is on. The Host header only
 * picks which site's passkeys apply, and the browser signs the origin it
 * really used, which verification checks against this.
 */
export async function relyingPartyForRequest(headers: Headers | null | undefined): Promise<RelyingParty | null> {
  return relyingPartyFor(headers?.get("host"));
}

// ---- challenges (Verification rows, single use) ----

export async function saveChallenge(identifier: string, challenge: string): Promise<void> {
  // Sign-in challenges are keyed per browser and most are never answered
  // (autofill starts one on every visit to /login), so clear out expired
  // ones as new ones are made.
  await prisma.verification.deleteMany({
    where: {
      OR: [
        { identifier },
        { identifier: { startsWith: "passkey-" }, expiresAt: { lt: new Date() } },
        { identifier: { startsWith: "mfa-passkey-" }, expiresAt: { lt: new Date() } },
      ],
    },
  });
  await prisma.verification.create({
    data: {
      identifier,
      value: challenge,
      expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_SECONDS * 1000),
    },
  });
}

/** Returns the stored challenge and deletes it, or null if missing/expired. */
export async function takeChallenge(identifier: string): Promise<string | null> {
  const rows = await prisma.verification.findMany({ where: { identifier } });
  if (rows.length === 0) return null;
  const { count } = await prisma.verification.deleteMany({ where: { identifier } });
  const row = rows[0]!;
  if (count === 0 || row.expiresAt < new Date()) return null;
  return row.value;
}

export function randomId(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// ---- registration ----

const regKey = (userId: string) => `passkey-reg-${userId}`;

export async function registrationOptions(
  user: { id: string; email: string; displayName: string },
  rp: RelyingParty,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await prisma.passkey.findMany({
    where: { userId: user.id, rpId: rp.rpID },
    select: { credentialId: true, transports: true },
  });
  const options = await generateRegistrationOptions({
    rpName: "Compass",
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.displayName || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await saveChallenge(regKey(user.id), options.challenge);
  return options;
}

export type PasskeyError =
  | "challenge_expired"
  | "not_verified"
  | "too_many"
  | "unknown_passkey"
  | "wrong_site"
  | "wrong_user";

export async function registerPasskey(
  userId: string,
  rp: RelyingParty,
  response: RegistrationResponseJSON,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: PasskeyError }> {
  const expectedChallenge = await takeChallenge(regKey(userId));
  if (!expectedChallenge) return { ok: false, error: "challenge_expired" };
  if ((await prisma.passkey.count({ where: { userId } })) >= MAX_PASSKEYS_PER_USER) {
    return { ok: false, error: "too_many" };
  }
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    return { ok: false, error: "not_verified" };
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false, error: "not_verified" };
  const info = verification.registrationInfo;
  const row = await prisma.passkey.create({
    data: {
      userId,
      name: name.trim().slice(0, 60) || "Passkey",
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: BigInt(info.credential.counter),
      transports: info.credential.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      rpId: rp.rpID,
    },
  });
  return { ok: true, id: row.id };
}

// ---- authentication ----

/**
 * Options for a passkey sign-in. With `userId`, only that user's passkeys
 * for this site are offered (the second step); without it, the browser
 * shows whichever passkeys it holds for the site.
 */
export async function authenticationOptions(
  key: string,
  rp: RelyingParty,
  userId?: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const allow = userId
    ? await prisma.passkey.findMany({
        where: { userId, rpId: rp.rpID },
        select: { credentialId: true, transports: true },
      })
    : [];
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: allow.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
  });
  await saveChallenge(key, options.challenge);
  return options;
}

/**
 * Checks a passkey assertion against the challenge stored under `key`.
 * Returns the passkey's user. With `expectUserId`, the passkey must
 * belong to that user.
 */
export async function verifyPasskeyAssertion(
  key: string,
  rp: RelyingParty,
  response: AuthenticationResponseJSON,
  expectUserId?: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: PasskeyError }> {
  const expectedChallenge = await takeChallenge(key);
  if (!expectedChallenge) return { ok: false, error: "challenge_expired" };
  const passkey = await prisma.passkey.findUnique({ where: { credentialId: String(response?.id ?? "") } });
  if (!passkey) return { ok: false, error: "unknown_passkey" };
  if (passkey.rpId !== rp.rpID) return { ok: false, error: "wrong_site" };
  if (expectUserId && passkey.userId !== expectUserId) return { ok: false, error: "wrong_user" };
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    return { ok: false, error: "not_verified" };
  }
  if (!verification.verified) return { ok: false, error: "not_verified" };
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return { ok: true, userId: passkey.userId };
}

export async function userHasPasskey(userId: string): Promise<boolean> {
  return (await prisma.passkey.count({ where: { userId } })) > 0;
}
