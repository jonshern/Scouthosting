"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { LoginSchema, SignupSchema } from "@/lib/validation/schemas";
import { postLoginRedirectUrl } from "@/lib/auth/post-login";
import { MFA_PAGE } from "@/lib/auth/mfa-plugin";
import { endSession } from "@/lib/auth/sessions";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { checkHoneypot, honeypotField, honeypotTimingField } from "@/lib/security/honeypot";

export type ActionState = { error?: string; ok?: true } | null;

const TOO_MANY = { error: "Too many attempts. Try again in a minute." };

function clientKey(suffix: string) {
  return `auth:${suffix}`;
}

async function preFlight(formData: FormData): Promise<{ error: string } | null> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF token." };
  const hp = checkHoneypot({
    [honeypotField]: String(formData.get(honeypotField) ?? ""),
    [honeypotTimingField]: String(formData.get(honeypotTimingField) ?? ""),
  });
  if (!hp.ok) return { error: "Submission rejected." };
  return null;
}

function errorCode(e: unknown): string | null {
  if (!isAPIError(e)) return null;
  const body = e.body as { code?: string } | undefined;
  return body?.code ?? null;
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fail = await preFlight(formData);
  if (fail) return fail;
  const h = await headers();
  const ip = clientIp(h) ?? "unknown";
  if (!(await rateLimit(clientKey(`signup:${ip}`), 30, 60_000)).ok) return TOO_MANY;

  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { email, password, displayName } = parsed.data;
  // Accounts are for adults only (lib/auth/requirements.ts).
  if (formData.get("adult") !== "yes") {
    return { error: "Confirm you are 18 or older. Scouts join through a parent's account." };
  }

  let userId: string;
  try {
    // Creates the user + credential account, signs them in, and emails a
    // confirmation link. The unit whose scoutmasterEmail matches is
    // claimed only once that link is followed (lib/auth/claim-orgs.ts).
    const res = await auth.api.signUpEmail({
      body: { email, password, name: displayName, callbackURL: "/account/profile?verified=1" },
      headers: h,
    });
    userId = res.user.id;
    await prisma.user.update({ where: { id: userId }, data: { adultAttestedAt: new Date() } });
  } catch (e) {
    const code = errorCode(e);
    if (code && code.startsWith("USER_ALREADY_EXISTS")) {
      return { error: "An account with that email already exists." };
    }
    if (code === "PASSWORD_TOO_SHORT") return { error: "Password must be at least 12 characters." };
    if (code === "PASSWORD_TOO_LONG") return { error: "Password is too long." };
    throw e;
  }

  redirect(await postLoginRedirectUrl(userId, String(formData.get("next") ?? "")));
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fail = await preFlight(formData);
  if (fail) return fail;
  const h = await headers();
  const ip = clientIp(h) ?? "unknown";
  if (!(await rateLimit(clientKey(`login:${ip}`), 30, 60_000)).ok) return TOO_MANY;

  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid email or password." };
  const { email, password } = parsed.data;
  // Per-account limit too, so rotating IPs doesn't buy unlimited guesses
  // against one person's password.
  const emailKey = clientKey(`login-email:${email.toLowerCase()}`);
  if (!(await rateLimit(emailKey, 10, 5 * 60_000)).ok) return TOO_MANY;

  let res: Awaited<ReturnType<typeof auth.api.signInEmail>> | { mfaRequired: true };
  try {
    res = await auth.api.signInEmail({ body: { email, password }, headers: h });
  } catch (e) {
    const code = errorCode(e);
    if (code === "ADMIN_SSO_REQUIRED") {
      return { error: "Admins must sign in with Google or Apple in production." };
    }
    if (code) return { error: "Invalid email or password." };
    throw e;
  }

  // Right password: stop counting against this account.
  await resetRateLimit(emailKey);
  if ("mfaRequired" in res && res.mfaRequired) redirect(MFA_PAGE);
  const userId = (res as { user: { id: string } }).user.id;
  redirect(await postLoginRedirectUrl(userId, String(formData.get("next") ?? "")));
}

/** True when this browser holds a live MFA sign-in challenge. */
export async function hasPendingMfaChallenge(): Promise<boolean> {
  const res = await auth.api.compassMfaPending({ headers: await headers() });
  return res.pending;
}

export async function completeMfaLoginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    return { error: "Bad CSRF token." };
  }
  const h = await headers();
  const ip = clientIp(h) ?? "unknown";
  if (!(await rateLimit(clientKey(`mfa:${ip}`), 30, 60_000)).ok) return TOO_MANY;

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter your 6-digit code or a backup code." };

  let userId: string;
  try {
    const res = await auth.api.verifyCompassMfa({ body: { code }, headers: h });
    userId = res.userId;
  } catch (e) {
    const c = errorCode(e);
    if (c === "MFA_CODE_INVALID") return { error: "That code is invalid." };
    if (c === "MFA_LOCKED") return { error: "Too many wrong codes. Wait 15 minutes and try again." };
    if (c) return { error: "Sign-in expired. Start again." };
    throw e;
  }

  redirect(await postLoginRedirectUrl(userId, String(formData.get("next") ?? "")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
