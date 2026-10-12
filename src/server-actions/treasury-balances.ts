"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury, TREASURY_FORBIDDEN } from "@/lib/auth/treasury-access";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { sendBalancesForOrg } from "@/lib/treasury/send-balances";
import { apexPublicOrigin } from "@/lib/tenancy/resolve";

const Schema = z.object({ orgSlug: z.string().min(1) });

export type SendBalancesState =
  | { ok: true; emailsSent: number; membersCovered: number; skipped: { name: string; reason: string }[] }
  | { error: string }
  | null;


export async function sendAllBalances(
  _prev: SendBalancesState,
  formData: FormData,
): Promise<SendBalancesState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };

  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  if (!(await canManageTreasury(user, org.id))) return { error: TREASURY_FORBIDDEN };

  const baseUrl = apexPublicOrigin();
  const summary = await sendBalancesForOrg(org, baseUrl);

  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Treasury",
    action: "send-balances",
    summary: `Sent ${summary.emailsSent} balance email(s) covering ${summary.membersCovered} member(s).`,
  });

  revalidatePath(`/o/${org.slug}/admin/treasury/balances`);
  return { ok: true, emailsSent: summary.emailsSent, membersCovered: summary.membersCovered, skipped: summary.skipped };
}
