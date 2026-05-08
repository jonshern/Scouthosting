"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import {
  isPlausibleStripeKey,
  isPlausibleWebhookSecret,
  setOrgStripeCredentials,
} from "@/lib/treasury/stripe";

const Schema = z.object({
  orgSlug: z.string().min(1),
  apiKey: z.string().min(20).max(200),
  webhookSecret: z.string().max(200).optional().or(z.literal("")),
  accountLabel: z.string().max(120).optional().or(z.literal("")),
});

export type StripeSettingsState = { ok?: true; error?: string; message?: string } | null;

export async function saveTreasuryStripeKey(
  _prev: StripeSettingsState,
  formData: FormData,
): Promise<StripeSettingsState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  if (!org.encryptedDek) return { error: "Org vault not provisioned." };

  if (!isPlausibleStripeKey(parsed.data.apiKey)) {
    return { error: "Stripe key must look like rk_live_… / sk_test_…" };
  }
  if (parsed.data.webhookSecret && !isPlausibleWebhookSecret(parsed.data.webhookSecret)) {
    return { error: "Webhook secret must start with whsec_…" };
  }

  const fields = setOrgStripeCredentials({
    org,
    apiKey: parsed.data.apiKey,
    webhookSecret: parsed.data.webhookSecret || null,
    accountLabel: parsed.data.accountLabel || null,
  });

  await prisma.org.update({
    where: { id: org.id },
    data: fields,
  });

  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "TreasuryStripe",
    action: "update",
    summary: `Saved treasury Stripe credentials (${fields.treasuryStripeKeyPrefix}…).`,
  });

  revalidatePath(`/o/${org.slug}/admin/treasury/settings`);
  return { ok: true, message: "Saved." };
}

const ClearSchema = z.object({ orgSlug: z.string().min(1) });

export async function clearTreasuryStripeKey(
  _prev: StripeSettingsState,
  formData: FormData,
): Promise<StripeSettingsState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ClearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  await prisma.org.update({
    where: { id: org.id },
    data: {
      treasuryStripeKeyCt: null,
      treasuryStripeWebhookSecretCt: null,
      treasuryStripeKeyPrefix: null,
      treasuryStripeAccountLabel: null,
    },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "TreasuryStripe",
    action: "delete",
    summary: "Cleared treasury Stripe credentials.",
  });
  revalidatePath(`/o/${org.slug}/admin/treasury/settings`);
  return { ok: true, message: "Cleared." };
}
