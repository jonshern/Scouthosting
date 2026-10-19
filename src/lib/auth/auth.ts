// Better Auth instance. Owns sessions, email + password sign-in, Google
// and Apple sign-in, email verification and auth rate limits. Replaced
// Lucia v3 (deprecated) and the hand-rolled arctic OAuth flow.
//
// Pieces Compass keeps for itself:
//   - Password hashing: argon2id with the same params as before
//     (./password.ts), so hashes migrated from User.passwordHash verify.
//   - MFA: Compass's TOTP + backup codes (./mfa.ts), wired into the
//     sign-in flow by ./mfa-plugin.ts. Better Auth's two-factor plugin
//     can't import the existing authenticator secrets and has no
//     same-window replay protection.
//   - Mobile API tokens (./api-token.ts), unchanged.
//
// Server code calls `auth.api.*` directly; the HTTP routes are mounted at
// /api/auth/* (src/app/api/auth/[...all]/route.ts) for OAuth callbacks and
// the email-verification link.

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { captureError } from "@/lib/ops/error-tracker";
import { hashPassword, verifyPassword } from "./password";
import { claimOrgsForVerifiedEmail } from "./claim-orgs";
import { compassMfa } from "./mfa-plugin";
import { appleConfig, googleConfig } from "./providers";
import { clientIpConfig } from "@/lib/security/client-ip";
import { recordAction } from "@/lib/usage/collect";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function baseURL() {
  const apex = env.APEX_HOST;
  const scheme = isProd() ? "https" : "http";
  const port = !isProd() && process.env.PORT ? `:${process.env.PORT}` : !isProd() ? ":3000" : "";
  return {
    // Tenant sites are subdomains of the apex; OAuth always returns to the
    // apex redirect URI registered with Google/Apple.
    allowedHosts: [apex, `*.${apex}`, `${apex}${port}`, `*.${apex}${port}`],
    fallback: `${scheme}://${apex}${port}`,
  };
}

const google = googleConfig();
const apple = appleConfig();

export const auth = betterAuth({
  appName: "Compass",
  secret: env.AUTH_SECRET,
  baseURL: baseURL(),
  basePath: "/api/auth",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  telemetry: { enabled: false },

  // Compass's own forms call these through server actions, which add the
  // CSRF, honeypot and rate-limit checks. Don't also expose them as raw
  // JSON endpoints. (Only affects HTTP; `auth.api.*` still works.)
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/email",
    "/update-user",
    "/change-password",
    "/change-email",
    "/delete-user",
    "/mfa/verify",
    "/mfa/passkey/options",
    "/mfa/passkey/verify",
    "/passkey/sign-in/options",
    "/passkey/sign-in",
    "/send-verification-email",
  ],

  onAPIError: { errorURL: "/login" },

  user: {
    fields: { name: "displayName" },
    additionalFields: {
      isSuperAdmin: { type: "boolean", defaultValue: false, input: false },
      totpEnrolledAt: { type: "date", required: false, input: false },
      disabledAt: { type: "date", required: false, input: false },
    },
    // A new address is applied only after the link sent to it is
    // clicked (server-actions/account.ts#updateProfile).
    changeEmail: { enabled: true },
  },

  session: {
    // Same lifetime Lucia used: 30 days, slid forward on use.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // No cookie cache: every request checks the Session row, so signing
    // out or revoking a session takes effect immediately.
    cookieCache: { enabled: false },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 200,
    autoSignIn: true,
    requireEmailVerification: false,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(hash, password),
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60 * 24,
    async sendVerificationEmail({ user, url }) {
      const sent = await sendMail({
        to: user.email,
        toName: user.name,
        subject: "Confirm your email for Compass",
        html:
          `<p>Hi ${escapeHtml(user.name || "there")},</p>` +
          `<p>Confirm this is your email address so Compass can connect you to your unit:</p>` +
          `<p><a href="${escapeHtml(url)}">Confirm my email</a></p>` +
          `<p>The link works for 24 hours. If you didn't create a Compass account, ignore this email.</p>`,
      });
      // Sign-up still succeeds (they can resend from their account page),
      // but a failed send must show up where an operator looks.
      if (!sent.ok) await captureError(new Error(`verification email failed: ${sent.error}`));
    },
    async afterEmailVerification(user) {
      await claimOrgsForVerifiedEmail(user.id, user.email);
    },
  },

  socialProviders: {
    ...(google ? { google } : {}),
    ...(apple ? { apple } : {}),
  },

  account: {
    accountLinking: {
      enabled: true,
      // Link a Google/Apple sign-in to an existing account only when the
      // provider says the email is verified and the local account's email
      // is verified too. Without the second check, someone who signed up
      // with a victim's address could have the victim's Google identity
      // attached to their account.
      trustedProviders: [],
      requireLocalEmailVerified: true,
    },
  },

  databaseHooks: {
    // An account turned off from the owner console gets no new session,
    // whichever way it signs in (password, Google/Apple, passkey, the
    // two-step code).
    session: {
      create: {
        async before(session) {
          const row = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { disabledAt: true },
          });
          if (row?.disabledAt) {
            throw new APIError("FORBIDDEN", { message: "account_disabled", code: "ACCOUNT_DISABLED" });
          }
        },
      },
    },
    user: {
      create: {
        async after(user) {
          recordAction("account_created", { product: "compass", userId: user.id });
          // Google/Apple sign-ups arrive verified; password sign-ups claim
          // their unit only after confirming the email (above).
          if (user.emailVerified) await claimOrgsForVerifiedEmail(user.id, user.email);
        },
      },
    },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/sign-up/*": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
      "/mfa/verify": { window: 60, max: 10 },
    },
  },

  advanced: {
    useSecureCookies: isProd(),
    cookiePrefix: "compass",
    cookies: {
      session_token: { name: "compass_session" },
    },
    ...(env.COOKIE_DOMAIN
      ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
      : {}),
    // Same trusted header as the rest of the app (lib/security/client-ip.ts).
    ipAddress: { ipAddressHeaders: [clientIpConfig().header ?? "x-forwarded-for"] },
    database: { generateId: false },
  },

  // nextCookies must be last: it copies Set-Cookie from auth.api calls
  // made inside server actions onto the Next response.
  plugins: [compassMfa(), nextCookies()],
});

export type Auth = typeof auth;
