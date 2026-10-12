"use server";

// Passkey actions for the login page, the second-step page and
// /account/security. The WebAuthn work is in lib/auth/passkeys.ts; the
// steps that start a session go through Better Auth (lib/auth/mfa-plugin.ts)
// so its session cookie is set the usual way.
//
// Called from client components (the browser has to talk to the
// authenticator between "options" and "verify"), so each takes the CSRF
// token as an argument.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { postLoginRedirectUrl } from "@/lib/auth/post-login";
import {
  PASSKEY_FRESH_SESSION_MS,
  registerPasskey,
  registrationOptions,
  relyingPartyForRequest,
} from "@/lib/auth/passkeys";
import { accountStanding, mfaLocked } from "@/lib/auth/requirements";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { DEMO_LOCKED_MESSAGE, isDemoMode } from "@/lib/demo/mode";

type Fail = { ok: false; error: string };

const UNAVAILABLE: Fail = { ok: false, error: "Passkeys don't work on this address." };
const TOO_MANY: Fail = { ok: false, error: "Too many attempts. Try again in a minute." };
const FAILED: Fail = { ok: false, error: "That passkey didn't work. Try again, or sign in another way." };

// Asking for sign-in options is cheap and happens on most visits to
// /login (the email field's passkey autofill), so it has its own, larger
// budget; anything that checks a passkey shares the smaller one.
async function checkRequest(csrf: string, bucket: "passkey" | "passkey-options" = "passkey"): Promise<Fail | null> {
  if (!(await verifyOrigin())) return { ok: false, error: "Bad origin." };
  if (!(await verifyCsrf(csrf))) return { ok: false, error: "Bad CSRF token. Reload the page." };
  const ip = clientIp(await headers()) ?? "unknown";
  const limit = bucket === "passkey" ? 30 : 120;
  if (!(await rateLimit(`auth:${bucket}:${ip}`, limit, 60_000)).ok) return TOO_MANY;
  return null;
}

function errorCode(e: unknown): string | null {
  if (!isAPIError(e)) return null;
  return (e.body as { code?: string } | undefined)?.code ?? null;
}

// ---- sign in with a passkey (/login) ----

export async function passkeySignInOptions(
  csrf: string,
): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | Fail> {
  const fail = await checkRequest(csrf, "passkey-options");
  if (fail) return fail;
  try {
    const { options } = await auth.api.compassPasskeySignInOptions({ headers: await headers() });
    return { ok: true, options };
  } catch (e) {
    if (errorCode(e) === "PASSKEY_UNAVAILABLE") return UNAVAILABLE;
    throw e;
  }
}

export async function passkeySignIn(
  csrf: string,
  response: AuthenticationResponseJSON,
  next: string,
): Promise<Fail> {
  const fail = await checkRequest(csrf);
  if (fail) return fail;
  let userId: string;
  try {
    ({ userId } = await auth.api.signInCompassPasskey({
      body: { response: response as unknown as Record<string, unknown> },
      headers: await headers(),
    }));
  } catch (e) {
    if (errorCode(e)) return FAILED;
    throw e;
  }
  redirect(await postLoginRedirectUrl(userId, next));
}

// ---- passkey as the second step (/login/mfa) ----

export async function mfaPasskeyOptions(
  csrf: string,
): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | Fail> {
  const fail = await checkRequest(csrf);
  if (fail) return fail;
  try {
    const { options } = await auth.api.compassMfaPasskeyOptions({ headers: await headers() });
    return { ok: true, options };
  } catch (e) {
    const code = errorCode(e);
    if (code === "PASSKEY_UNAVAILABLE") return UNAVAILABLE;
    if (code) return { ok: false, error: "Sign-in expired. Start again." };
    throw e;
  }
}

export async function mfaPasskeyVerify(
  csrf: string,
  response: AuthenticationResponseJSON,
  next: string,
): Promise<Fail> {
  const fail = await checkRequest(csrf);
  if (fail) return fail;
  let userId: string;
  try {
    ({ userId } = await auth.api.verifyCompassMfaPasskey({
      body: { response: response as unknown as Record<string, unknown> },
      headers: await headers(),
    }));
  } catch (e) {
    const code = errorCode(e);
    if (code === "PASSKEY_FAILED") return FAILED;
    if (code) return { ok: false, error: "Sign-in expired. Start again." };
    throw e;
  }
  redirect(await postLoginRedirectUrl(userId, next));
}

// ---- adding and removing passkeys (/account/security) ----

async function freshSessionUser() {
  const { user, session } = await getSession();
  if (!user || !session) return { error: "Not signed in." } as const;
  const row = await prisma.session.findUnique({ where: { id: session.id }, select: { createdAt: true } });
  if (!row || Date.now() - row.createdAt.getTime() > PASSKEY_FRESH_SESSION_MS) {
    return { error: "For your security, sign out and sign back in, then add the passkey." } as const;
  }
  return { user } as const;
}

export async function passkeyRegistrationOptions(
  csrf: string,
): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | Fail> {
  const fail = await checkRequest(csrf);
  if (fail) return fail;
  if (isDemoMode()) return { ok: false, error: DEMO_LOCKED_MESSAGE };
  const s = await freshSessionUser();
  if ("error" in s) return { ok: false, error: s.error! };
  const rp = await relyingPartyForRequest(await headers());
  if (!rp) return UNAVAILABLE;
  const options = await registrationOptions(s.user, rp);
  return { ok: true, options };
}

export async function passkeyRegister(
  csrf: string,
  response: RegistrationResponseJSON,
  name: string,
): Promise<{ ok: true } | Fail> {
  const fail = await checkRequest(csrf);
  if (fail) return fail;
  if (isDemoMode()) return { ok: false, error: DEMO_LOCKED_MESSAGE };
  const s = await freshSessionUser();
  if ("error" in s) return { ok: false, error: s.error! };
  const { user } = s;
  const rp = await relyingPartyForRequest(await headers());
  if (!rp) return UNAVAILABLE;
  const result = await registerPasskey(user.id, rp, response, name);
  if (!result.ok) {
    if (result.error === "too_many") return { ok: false, error: "You already have 10 passkeys. Remove one first." };
    if (result.error === "challenge_expired") return { ok: false, error: "That took too long. Try again." };
    return { ok: false, error: "Your device didn't confirm the passkey. Try again." };
  }
  audit({
    action: "passkey.add",
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    userDisplay: user.displayName,
    summary: "Added a passkey",
  });
  await sendMail({
    to: user.email,
    toName: user.displayName,
    subject: "A passkey was added to your Compass account",
    html: `<p>A passkey was just added to your Compass account. If this wasn't you, sign in, remove it from your account's Security page, and change your password.</p>`,
  }).catch(() => {});
  return { ok: true };
}

export async function removePasskey(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  if (isDemoMode()) throw new Error(DEMO_LOCKED_MESSAGE);
  const { user } = await getSession();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const row = await prisma.passkey.findUnique({ where: { id }, select: { userId: true } });
  if (!row || row.userId !== user.id) throw new Error("Not found.");
  if (mfaLocked(await accountStanding(user.id), "passkey")) {
    redirect("/account/security?passkey=locked");
  }
  await prisma.passkey.delete({ where: { id } });
  audit({
    action: "passkey.remove",
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    userDisplay: user.displayName,
    summary: "Removed a passkey",
  });
  redirect("/account/security?passkey=removed");
}
