// Better Auth plugin that puts Compass's own MFA (./mfa.ts, ./mfa-verify.ts)
// in front of every new session, and enforces the admin SSO policy.
//
// After a password, Google or Apple sign-in creates a session, the hook
// below checks the user:
//   - an admin signing in with a password where policy.ts forbids it:
//     the session is deleted and the sign-in is refused;
//   - a user with MFA enrolled: the session is deleted and replaced by a
//     signed, single-use challenge cookie (10 minutes). POST /mfa/verify
//     (auth.api.verifyCompassMfa) checks the code and only then creates
//     the session.
//
// Same shape as Better Auth's two-factor plugin, which Compass can't use
// directly (see ./auth.ts).

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie, expireCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyMfaCodeForUser } from "./mfa-verify";
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

const CHALLENGE_PREFIX = "mfa-";
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

            if (viaPassword) {
              const privileged = await isPrivilegedUser(data.user.id);
              if (!passwordLoginAllowedForRole({ privileged })) {
                await dropSession();
                throw new APIError("FORBIDDEN", {
                  code: "ADMIN_SSO_REQUIRED",
                  message: "Admins must sign in with Google or Apple.",
                });
              }
            }

            const row = await prisma.user.findUnique({
              where: { id: data.user.id },
              select: { totpEnrolledAt: true },
            });
            if (!row?.totpEnrolledAt) return;

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
            // code page. Password sign-in is called from a server action,
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

          const consumed = await ctx.context.internalAdapter.consumeVerificationValue(id);
          if (!consumed || consumed.value !== challenge.value) throw expired();

          const user = await ctx.context.internalAdapter.findUserById(consumed.value);
          if (!user) throw expired();
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          expireCookie(ctx, cookie);
          return ctx.json({ userId: user.id });
        },
      ),
      // Lets the code page check there's a live challenge before showing
      // the form. Never reveals who the challenge is for.
      compassMfaPending: createAuthEndpoint("/mfa/pending", { method: "GET" }, async (ctx) => {
        const cookie = ctx.context.createAuthCookie(MFA_COOKIE);
        const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        if (!id || !id.startsWith(CHALLENGE_PREFIX)) return ctx.json({ pending: false });
        const challenge = await ctx.context.internalAdapter.findVerificationValue(id);
        return ctx.json({ pending: !!challenge && challenge.expiresAt > new Date() });
      }),
    },
  }) satisfies BetterAuthPlugin;
