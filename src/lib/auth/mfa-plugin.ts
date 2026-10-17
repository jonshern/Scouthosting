// Better Auth plugin that puts Compass's own MFA (./mfa.ts, ./mfa-verify.ts)
// in front of every new session, and enforces the admin SSO policy.
//
// After a password, Google or Apple sign-in creates a session, the hook
// below checks the user:
//   - an admin signing in with a password where policy.ts forbids it:
//     the session is deleted and the sign-in is refused;
//   - a user who needs a second step: the session is deleted and replaced
//     by a signed, single-use challenge cookie (10 minutes). The second
//     step is an authenticator code (POST /mfa/verify,
//     auth.api.verifyCompassMfa) or, for a user with a passkey, the
//     passkey (/mfa/passkey/*). Only then is the session created.
//     A second step is needed with an authenticator app set up, or for an
//     organizer (lib/auth/requirements.ts) who has a passkey.
//
// It also holds the passkey endpoints (lib/auth/passkeys.ts): passkey
// sign-in, which needs no second step because the device checks a
// fingerprint, face or PIN, and the passkey second step.
//
// Clicking an email link (/verify-email) never signs anyone in: a
// session that link would create is deleted again, so the link can't
// stand in for the password, SSO or MFA steps. A browser that was
// already signed in keeps its session.
//
// Same shape as Better Auth's two-factor plugin, which Compass can't use
// directly (see ./auth.ts).

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie, expireCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { verifyMfaCodeForUser } from "./mfa-verify";
import {
  authenticationOptions,
  PASSKEY_CHALLENGE_SECONDS,
  randomId,
  relyingPartyForRequest,
  verifyPasskeyAssertion,
} from "./passkeys";
import { accountStanding } from "./requirements";
import { passwordLoginAllowedForRole } from "./policy";
import { isPrivilegedUser } from "./role";

export const MFA_COOKIE = "mfa_pending";
export const MFA_CHALLENGE_SECONDS = 600;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_PAGE = "/login/mfa";
// Account-wide cap across challenges, so starting fresh sign-ins doesn't
// buy more guesses: 10 wrong codes locks MFA for 15 minutes.
export const MFA_ACCOUNT_MAX_FAILURES = 10;
export const MFA_ACCOUNT_LOCK_SECONDS = 900;

export const PASSKEY_COOKIE = "passkey_challenge";

const CHALLENGE_PREFIX = "mfa-";
const mfaPasskeyKey = (id: string) => `mfa-passkey-${id}`;
const signInPasskeyKey = (id: string) => `passkey-auth-${id}`;



const PasskeyBody = z.object({ response: z.record(z.unknown()) });

// Better Auth's endpoint context, as its own helpers take it.
type AuthCtx = Parameters<typeof setSessionCookie>[0];

function challengeExpired(ctx: AuthCtx) {
  return () => {
    expireCookie(ctx, ctx.context.createAuthCookie(MFA_COOKIE));
    return new APIError("UNAUTHORIZED", {
      code: "MFA_CHALLENGE_EXPIRED",
      message: "Sign-in expired. Start again.",
    });
  };
}

// The second-step challenge this browser holds, or throws "expired".
async function liveChallenge(ctx: AuthCtx) {
  const expired = challengeExpired(ctx);
  const cookie = ctx.context.createAuthCookie(MFA_COOKIE);
  const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!id || !id.startsWith(CHALLENGE_PREFIX)) throw expired();
  const challenge = await ctx.context.internalAdapter.findVerificationValue(id);
  if (!challenge || challenge.expiresAt < new Date()) throw expired();
  return { id, challenge, expired };
}

// Second step passed: use up the challenge and start the session.
async function finishChallenge(
  ctx: AuthCtx,
  id: string,
  userId: string,
  expired: () => APIError,
): Promise<string> {
  const consumed = await ctx.context.internalAdapter.consumeVerificationValue(id);
  if (!consumed || consumed.value !== userId) throw expired();
  await ctx.context.internalAdapter.deleteVerificationByIdentifier(mfaPasskeyKey(id));
  const user = await ctx.context.internalAdapter.findUserById(userId);
  if (!user) throw expired();
  const session = await ctx.context.internalAdapter.createSession(user.id);
  await setSessionCookie(ctx, { session, user });
  expireCookie(ctx, ctx.context.createAuthCookie(MFA_COOKIE));
  return user.id;
}
const attemptsKey = (id: string) => `mfa-attempts-${id}`;
const accountFailuresKey = (userId: string) => `mfa-failures-${userId}`;

function isOAuthCallback(path: string | undefined): boolean {
  return !!path && path.startsWith("/callback/");
}

export const compassMfa = () =>
  ({
    id: "compass-mfa",
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/verify-email",
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession;
            if (!data) return;
            const existing = await ctx.getSignedCookie(
              ctx.context.authCookies.sessionToken.name,
              ctx.context.secret,
            );
            if (existing && existing === data.session.token) return;
            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(data.session.token);
            ctx.context.setNewSession(null);
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/sign-in/email" || isOAuthCallback(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession;
            if (!data) return;
            const viaPassword = ctx.path === "/sign-in/email";

            const dropSession = async () => {
              deleteSessionCookie(ctx, true);
              await ctx.context.internalAdapter.deleteSession(data.session.token);
              ctx.context.setNewSession(null);
            };

            const standing = await accountStanding(data.user.id);
            const hasSecondStep = standing.totpEnrolled || (standing.organizer && standing.passkeys > 0);

            if (viaPassword) {
              const privileged = await isPrivilegedUser(data.user.id);
              if (!passwordLoginAllowedForRole({ privileged, hasSecondStep })) {
                await dropSession();
                throw new APIError("FORBIDDEN", {
                  code: "ADMIN_SSO_REQUIRED",
                  message: "Admins must sign in with Google or Apple, or set up two-step sign-in.",
                });
              }
            }

            if (!hasSecondStep) return;

            await dropSession();
            const id = `${CHALLENGE_PREFIX}${generateRandomString(32)}`;
            const expiresAt = new Date(Date.now() + MFA_CHALLENGE_SECONDS * 1000);
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: id,
              value: data.user.id,
              expiresAt,
            });
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: attemptsKey(id),
              value: "0",
              expiresAt,
            });
            const cookie = ctx.context.createAuthCookie(MFA_COOKIE, { maxAge: MFA_CHALLENGE_SECONDS });
            await ctx.setSignedCookie(cookie.name, id, ctx.context.secret, cookie.attributes);

            // OAuth callbacks are browser redirects; send the browser to the
            // second-step page. Password sign-in is called from a server action,
            // which reads this flag and redirects itself.
            if (isOAuthCallback(ctx.path)) throw ctx.redirect(MFA_PAGE);
            return ctx.json({ mfaRequired: true });
          }),
        },
      ],
    },
    endpoints: {
      verifyCompassMfa: createAuthEndpoint(
        "/mfa/verify",
        { method: "POST", body: z.object({ code: z.string().min(1).max(32) }) },
        async (ctx) => {
          const cookie = ctx.context.createAuthCookie(MFA_COOKIE);
          const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
          const expired = () => {
            expireCookie(ctx, cookie);
            return new APIError("UNAUTHORIZED", {
              code: "MFA_CHALLENGE_EXPIRED",
              message: "Sign-in expired. Start again.",
            });
          };
          if (!id || !id.startsWith(CHALLENGE_PREFIX)) throw expired();

          const challenge = await ctx.context.internalAdapter.findVerificationValue(id);
          if (!challenge || challenge.expiresAt < new Date()) throw expired();

          // Per-challenge attempt budget. Consume-then-rearm so two
          // concurrent guesses can't both read the same count.
          const attempts = await ctx.context.internalAdapter.consumeVerificationValue(attemptsKey(id));
          const used = attempts ? Number(attempts.value) || 0 : MFA_MAX_ATTEMPTS;
          if (used >= MFA_MAX_ATTEMPTS) {
            await ctx.context.internalAdapter.consumeVerificationValue(id);
            throw expired();
          }

          const failures = await ctx.context.internalAdapter.findVerificationValue(
            accountFailuresKey(challenge.value),
          );
          const failCount = failures && failures.expiresAt > new Date() ? Number(failures.value) || 0 : 0;
          if (failCount >= MFA_ACCOUNT_MAX_FAILURES) {
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: attemptsKey(id),
              value: String(used),
              expiresAt: challenge.expiresAt,
            });
            throw new APIError("TOO_MANY_REQUESTS", {
              code: "MFA_LOCKED",
              message: "Too many wrong codes. Wait 15 minutes and try again.",
            });
          }

          const ok = await verifyMfaCodeForUser(challenge.value, ctx.body.code);
          if (!ok) {
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: attemptsKey(id),
              value: String(used + 1),
              expiresAt: challenge.expiresAt,
            });
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(accountFailuresKey(challenge.value));
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: accountFailuresKey(challenge.value),
              value: String(failCount + 1),
              expiresAt: new Date(Date.now() + MFA_ACCOUNT_LOCK_SECONDS * 1000),
            });
            throw new APIError("UNAUTHORIZED", { code: "MFA_CODE_INVALID", message: "That code is invalid." });
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(accountFailuresKey(challenge.value));

          return ctx.json({ userId: await finishChallenge(ctx, id, challenge.value, expired) });
        },
      ),
      // The passkey second step: options for this user's passkeys on this
      // site, then the browser's answer.
      compassMfaPasskeyOptions: createAuthEndpoint("/mfa/passkey/options", { method: "POST" }, async (ctx) => {
        const { id, challenge, expired } = await liveChallenge(ctx);
        const rp = await relyingPartyForRequest(ctx.headers);
        if (!rp) throw new APIError("BAD_REQUEST", { code: "PASSKEY_UNAVAILABLE", message: "Passkeys don't work on this address." });
        const options = await authenticationOptions(mfaPasskeyKey(id), rp, challenge.value);
        if (options.allowCredentials?.length === 0) throw expired();
        return ctx.json({ options });
      }),
      verifyCompassMfaPasskey: createAuthEndpoint(
        "/mfa/passkey/verify",
        { method: "POST", body: PasskeyBody },
        async (ctx) => {
          const { id, challenge, expired } = await liveChallenge(ctx);
          const rp = await relyingPartyForRequest(ctx.headers);
          if (!rp) throw expired();
          const result = await verifyPasskeyAssertion(
            mfaPasskeyKey(id),
            rp,
            ctx.body.response as unknown as AuthenticationResponseJSON,
            challenge.value,
          );
          if (!result.ok) {
            throw new APIError("UNAUTHORIZED", { code: "PASSKEY_FAILED", message: "That passkey didn't work. Try again." });
          }
          return ctx.json({ userId: await finishChallenge(ctx, id, challenge.value, expired) });
        },
      ),
      // Passkey sign-in from /login: options for whichever passkeys the
      // browser holds for this site, then the browser's answer. The
      // challenge id rides in a signed cookie so it's tied to this browser.
      compassPasskeySignInOptions: createAuthEndpoint("/passkey/sign-in/options", { method: "POST" }, async (ctx) => {
        const rp = await relyingPartyForRequest(ctx.headers);
        if (!rp) throw new APIError("BAD_REQUEST", { code: "PASSKEY_UNAVAILABLE", message: "Passkeys don't work on this address." });
        const id = randomId();
        const options = await authenticationOptions(signInPasskeyKey(id), rp);
        const cookie = ctx.context.createAuthCookie(PASSKEY_COOKIE, { maxAge: PASSKEY_CHALLENGE_SECONDS });
        await ctx.setSignedCookie(cookie.name, id, ctx.context.secret, cookie.attributes);
        return ctx.json({ options });
      }),
      signInCompassPasskey: createAuthEndpoint(
        "/passkey/sign-in",
        { method: "POST", body: PasskeyBody },
        async (ctx) => {
          const cookie = ctx.context.createAuthCookie(PASSKEY_COOKIE);
          const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
          expireCookie(ctx, cookie);
          const rp = await relyingPartyForRequest(ctx.headers);
          const failed = () =>
            new APIError("UNAUTHORIZED", { code: "PASSKEY_FAILED", message: "That passkey didn't work. Try again." });
          if (!id || !rp) throw failed();
          const result = await verifyPasskeyAssertion(
            signInPasskeyKey(id),
            rp,
            ctx.body.response as unknown as AuthenticationResponseJSON,
          );
          if (!result.ok) throw failed();
          const user = await ctx.context.internalAdapter.findUserById(result.userId);
          if (!user) throw failed();
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ userId: user.id });
        },
      ),
      // Lets the code page check there's a live challenge before showing
      // the form. Never reveals who the challenge is for.
      // Also says which second steps the user can use: an authenticator
      // code, a passkey on this site, or both.
      compassMfaPending: createAuthEndpoint("/mfa/pending", { method: "GET" }, async (ctx) => {
        const none = { pending: false, totp: false, passkey: false };
        const cookie = ctx.context.createAuthCookie(MFA_COOKIE);
        const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        if (!id || !id.startsWith(CHALLENGE_PREFIX)) return ctx.json(none);
        const challenge = await ctx.context.internalAdapter.findVerificationValue(id);
        if (!challenge || challenge.expiresAt <= new Date()) return ctx.json(none);
        const rp = await relyingPartyForRequest(ctx.headers);
        const [user, passkeys] = await Promise.all([
          prisma.user.findUnique({ where: { id: challenge.value }, select: { totpEnrolledAt: true } }),
          rp ? prisma.passkey.count({ where: { userId: challenge.value, rpId: rp.rpID } }) : 0,
        ]);
        return ctx.json({ pending: true, totp: !!user?.totpEnrolledAt, passkey: passkeys > 0 });
      }),
    },
  }) satisfies BetterAuthPlugin;
