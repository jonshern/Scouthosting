"use server";

import { getSession } from "@/lib/auth/session";
import { accountStanding } from "@/lib/auth/requirements";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { checkHoneypot, honeypotField, honeypotTimingField } from "@/lib/security/honeypot";
import { StartTrialSchema, startUnitTrial } from "@/lib/provision/self-serve";

export type StartTrialState =
  | { error: string }
  | { done: { slug: string; displayName: string; recoveryCode: string; trialEndsAt: string | null } }
  | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function startTrialAction(
  _prev: StartTrialState,
  formData: FormData,
): Promise<StartTrialState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF token." };
  const hp = checkHoneypot({
    [honeypotField]: String(formData.get(honeypotField) ?? ""),
    [honeypotTimingField]: String(formData.get(honeypotTimingField) ?? ""),
  });
  if (!hp.ok) return { error: "Submission rejected." };

  const { user } = await getSession();
  if (!user) return { error: "Sign in first." };
  if (!(await accountStanding(user.id)).adultConfirmed) {
    return { error: "Confirm you are 18 or older before creating a unit." };
  }
  if (!(await rateLimit(`start-trial:${user.id}`, 3, DAY_MS)).ok) {
    return { error: "You've created several units today. Contact support to add more." };
  }

  const parsed = StartTrialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    const res = await startUnitTrial(user, parsed.data);
    return {
      done: {
        slug: res.slug,
        displayName: res.displayName,
        recoveryCode: res.recoveryCode,
        trialEndsAt: res.trialEndsAt?.toISOString() ?? null,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the unit." };
  }
}
