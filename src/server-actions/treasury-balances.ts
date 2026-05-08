"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { sendBalancesForOrg } from "@/lib/treasury/send-balances";

const Schema = z.object({ orgSlug: z.string().min(1) });

export type SendBalancesState =
  | { ok: true; emailsSent: number; membersCovered: number; skipped: { name: string; reason: string }[] }
  | { error: string }
  | null;

async function originForRequest(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

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
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  const baseUrl = await originForRequest();
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
