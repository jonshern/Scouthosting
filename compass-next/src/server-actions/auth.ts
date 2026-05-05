"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { LoginSchema, SignupSchema } from "@/lib/validation/schemas";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordLoginAllowedForRole } from "@/lib/auth/policy";
import { isPrivilegedUser } from "@/lib/auth/role";
import { createSession, endSession } from "@/lib/auth/sessions";
import { consume } from "@/lib/security/rate-limit";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { checkHoneypot, honeypotField, honeypotTimingField } from "@/lib/security/honeypot";
import { isProd } from "@/lib/env";
import { MFA_PENDING_COOKIE, MFA_PENDING_TTL_SECONDS } from "@/lib/auth/mfa-cookie";

export type ActionState = { error?: string; ok?: true } | null;

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

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fail = await preFlight(formData);
  if (fail) return fail;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = consume(clientKey(`signup:${ip}`), 30, 60_000);
  if (!rl.ok) return { error: "Too many attempts. Try again in a minute." };

  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { email, password, displayName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName, emailVerified: false },
  });

  // Auto-grant admin in any org whose scoutmasterEmail matches.
  const matchedOrgs = await prisma.org.findMany({
    where: { scoutmasterEmail: email },
    select: { id: true },
  });
  if (matchedOrgs.length > 0) {
    await prisma.orgMembership.createMany({
      data: matchedOrgs.map((o) => ({ userId: user.id, orgId: o.id, role: "admin" })),
      skipDuplicates: true,
    });
  }

  await createSession(user.id);
  redirect("/");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fail = await preFlight(formData);
  if (fail) return fail;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = consume(clientKey(`login:${ip}`), 30, 60_000);
  if (!rl.ok) return { error: "Too many attempts. Try again in a minute." };

  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid email or password." };
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return { error: "Invalid email or password." };
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return { error: "Invalid email or password." };

  const privileged = await isPrivilegedUser(user.id);
  if (!passwordLoginAllowedForRole({ privileged })) {
    return { error: "Admins must sign in with Google or Apple in production." };
  }

  if (user.totpEnrolledAt) {
    const cookieStore = await cookies();
    cookieStore.set(MFA_PENDING_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd(),
      path: "/",
      maxAge: MFA_PENDING_TTL_SECONDS,
    });
    redirect("/login/mfa");
  }

  await createSession(user.id);
  redirect("/");
}

export async function readPendingMfaUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get(MFA_PENDING_COOKIE)?.value ?? null;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, totpEnrolledAt: true },
  });
  if (!user || !user.totpEnrolledAt) return null;
  return user.id;
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
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = consume(clientKey(`mfa:${ip}`), 30, 60_000);
  if (!rl.ok) return { error: "Too many attempts. Try again in a minute." };

  const cookieStore = await cookies();
  const pendingId = cookieStore.get(MFA_PENDING_COOKIE)?.value ?? null;
  if (!pendingId) return { error: "Sign-in expired. Start again." };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter your 6-digit code or a backup code." };

  const user = await prisma.user.findUnique({
    where: { id: pendingId },
    select: { id: true, totpEnrolledAt: true },
  });
  if (!user || !user.totpEnrolledAt) {
    cookieStore.set(MFA_PENDING_COOKIE, "", { path: "/", maxAge: 0 });
    return { error: "Sign-in expired. Start again." };
  }

  const { verifyMfaCodeForUser } = await import("@/lib/auth/mfa-verify");
  const ok = await verifyMfaCodeForUser(user.id, code);
  if (!ok) return { error: "That code is invalid." };

  cookieStore.set(MFA_PENDING_COOKIE, "", { path: "/", maxAge: 0 });
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
