"use server";

// One-click sign-in and reset for the demo deployment (src/lib/demo).

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getSession } from "@/lib/auth/session";
import { endSession } from "@/lib/auth/sessions";
import { DEMO_PASSWORD, demoAccount, isDemoMode } from "@/lib/demo/mode";
import { currentDemoUnit, resetDemo } from "@/lib/demo/reset";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";

async function preFlight(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/");
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF token.");
}

export async function demoSignInAction(formData: FormData): Promise<void> {
  await preFlight(formData);
  const account = demoAccount(String(formData.get("role") ?? ""));
  if (!account) redirect("/demo?error=role");
  const h = await headers();
  if (!(await rateLimit(`demo-signin:${clientIp(h) ?? "unknown"}`, 30, 60_000)).ok) {
    redirect("/demo?error=busy");
  }
  // Whoever was signed in here before steps aside first.
  await endSession();
  try {
    await auth.api.signInEmail({ body: { email: account.email, password: DEMO_PASSWORD }, headers: h });
  } catch {
    // The accounts are mid-reset or someone deleted one; the next reset
    // brings it back.
    redirect("/demo?error=signin");
  }
  const unit = await currentDemoUnit();
  redirect(unit ? `/o/${unit.slug}${account.landing}` : "/demo");
}

export async function demoResetAction(formData: FormData): Promise<void> {
  await preFlight(formData);
  const { user } = await getSession();
  if (!user || user.email.toLowerCase() !== demoAccount("admin")?.email) redirect("/demo?error=admin");
  // The wipe takes the caller's session with it.
  await resetDemo({ reason: "admin" });
  redirect("/demo?reset=1");
}
