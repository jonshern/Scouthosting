"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { LoginSchema, SignupSchema } from "@/lib/validation/schemas";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, endSession } from "@/lib/auth/sessions";
import { consume } from "@/lib/security/rate-limit";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { checkHoneypot, honeypotField, honeypotTimingField } from "@/lib/security/honeypot";

export type ActionState = { error?: string; ok?: true } | null;

function clientKey(suffix: string) {
  // best-effort key; real apps fold in IP from x-forwarded-for upstream
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

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
