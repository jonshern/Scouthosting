"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth/auth";
import { revokeToken } from "@/lib/auth/api-token";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

const ProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
});

const PasswordSchema = z
  .object({
    current: z.string().min(1),
    next: z.string().min(12),
    confirm: z.string().min(12),
  })
  .refine((d) => d.next === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

export async function updateProfile(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  const newEmail = parsed.data.email.toLowerCase();
  const emailChanged = newEmail !== user.email.toLowerCase();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: parsed.data.displayName,
      email: newEmail,
      // If the email changed, the new address needs verification.
      ...(emailChanged ? { emailVerified: false } : {}),
    },
  });
  redirect("/account/profile?saved=1");
}

export async function changePassword(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  const parsed = PasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    // Also signs out every other browser, so a password change locks out
    // anyone who had the old one.
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.current,
        newPassword: parsed.data.next,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch (e) {
    const code = isAPIError(e) ? (e.body as { code?: string } | undefined)?.code : null;
    if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
      // OAuth-only account — no current password to verify against.
      throw new Error("Your account uses Google/Apple sign-in; no password to change.");
    }
    if (code === "INVALID_PASSWORD") throw new Error("Current password incorrect.");
    throw e;
  }
  redirect("/account/password?saved=1");
}

export async function revokeApiToken(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing token id.");
  const row = await prisma.apiToken.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row || row.userId !== user.id) throw new Error("Not found.");
  await revokeToken(id, prisma);
  redirect("/account/api-tokens");
}

export async function resendVerificationEmail(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/account/profile");
  if (!(await rateLimit(`verify-email:${user.id}`, 3, 10 * 60_000)).ok) {
    throw new Error("Too many emails. Try again in a few minutes.");
  }
  await auth.api.sendVerificationEmail({
    body: { email: user.email, callbackURL: "/account/profile?verified=1" },
    headers: await headers(),
  });
  redirect("/account/profile?sent=1");
}
