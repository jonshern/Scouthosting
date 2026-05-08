// Per-org treasury Stripe. Distinct from src/lib/billing/stripe.ts —
// that module handles platform billing (orgs subscribing to Compass).
// This module instantiates a Stripe client *with the org's own
// restricted secret key* so member payments land in the unit's own
// Stripe account.
//
// Key + webhook secret are stored encrypted with the org's DEK; we
// only decrypt at request time, never log the plaintext, and refuse
// to call Stripe with a key that doesn't begin with the expected
// prefix (`rk_` / `sk_`).

import crypto from "node:crypto";
import type { Org } from "@prisma/client";
import { encryptField, decryptField } from "@/lib/encryption";
import { unwrapDekWithMaster } from "@/lib/encryption";

const KEY_PURPOSE = "org.treasuryStripeKey";
const WEBHOOK_PURPOSE = "org.treasuryStripeWebhookSecret";

type StripeLike = {
  checkout: {
    sessions: {
      create: (args: unknown) => Promise<{ id: string; url: string | null }>;
    };
  };
};

export function isPlausibleStripeKey(s: string): boolean {
  return /^(rk|sk)_(live|test)_[A-Za-z0-9]{16,}$/.test(s.trim());
}

export function isPlausibleWebhookSecret(s: string): boolean {
  return /^whsec_[A-Za-z0-9]{16,}$/.test(s.trim());
}

export function setOrgStripeCredentials(args: {
  org: Pick<Org, "id" | "encryptedDek">;
  apiKey: string;
  webhookSecret?: string | null;
  accountLabel?: string | null;
}): {
  treasuryStripeKeyCt: Buffer | null;
  treasuryStripeWebhookSecretCt: Buffer | null;
  treasuryStripeKeyPrefix: string | null;
  treasuryStripeAccountLabel: string | null;
} {
  if (!args.org.encryptedDek) {
    throw new Error("Org vault not provisioned.");
  }
  const dek = unwrapDekWithMaster(args.org);
  const keyCt = encryptField(args.apiKey, dek, args.org.id, KEY_PURPOSE);
  const wsCt = args.webhookSecret
    ? encryptField(args.webhookSecret, dek, args.org.id, WEBHOOK_PURPOSE)
    : null;
  return {
    treasuryStripeKeyCt: keyCt,
    treasuryStripeWebhookSecretCt: wsCt,
    treasuryStripeKeyPrefix: args.apiKey.slice(0, 7),
    treasuryStripeAccountLabel: args.accountLabel?.trim() || null,
  };
}

export function decryptOrgStripeKey(
  org: Pick<Org, "id" | "encryptedDek" | "treasuryStripeKeyCt">,
): string | null {
  if (!org.encryptedDek || !org.treasuryStripeKeyCt) return null;
  const dek = unwrapDekWithMaster(org);
  return decryptField(org.treasuryStripeKeyCt, dek, org.id, KEY_PURPOSE);
}

export function decryptOrgWebhookSecret(
  org: Pick<Org, "id" | "encryptedDek" | "treasuryStripeWebhookSecretCt">,
): string | null {
  if (!org.encryptedDek || !org.treasuryStripeWebhookSecretCt) return null;
  const dek = unwrapDekWithMaster(org);
  return decryptField(org.treasuryStripeWebhookSecretCt, dek, org.id, WEBHOOK_PURPOSE);
}

let _modCache: { default: new (key: string, opts: { apiVersion: string }) => StripeLike } | null = null;

async function loadStripeMod() {
  if (_modCache) return _modCache;
  // @ts-expect-error optional dep
  const mod = (await import("stripe")) as {
    default: new (key: string, opts: { apiVersion: string }) => StripeLike;
  };
  _modCache = mod;
  return mod;
}

export async function getOrgStripeClient(
  org: Pick<Org, "id" | "encryptedDek" | "treasuryStripeKeyCt">,
): Promise<StripeLike | null> {
  const key = decryptOrgStripeKey(org);
  if (!key) return null;
  if (!isPlausibleStripeKey(key)) return null;
  try {
    const mod = await loadStripeMod();
    return new mod.default(key, { apiVersion: "2024-11-20.acacia" });
  } catch {
    return null;
  }
}

export type CheckoutInput = {
  org: Pick<Org, "id" | "slug" | "encryptedDek" | "treasuryStripeKeyCt">;
  memberId?: string | null;
  amountCents: number;
  description: string;
  buyerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
};

export async function createMemberPaymentSession(
  input: CheckoutInput,
): Promise<{ url: string | null; sessionId: string }> {
  if (input.amountCents < 50) {
    throw new Error("amount must be at least $0.50.");
  }
  const stripe = await getOrgStripeClient(input.org);
  if (!stripe) throw new Error("treasury_stripe_not_configured");

  const baseMeta: Record<string, string> = {
    orgId: input.org.id,
    orgSlug: input.org.slug,
    treasury: "1",
    ...(input.memberId ? { memberId: input.memberId } : {}),
    ...(input.metadata ?? {}),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: input.description },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.buyerEmail || undefined,
    metadata: baseMeta,
    payment_intent_data: { metadata: baseMeta },
  });

  return { url: session.url, sessionId: session.id };
}

// Local copy of the Stripe webhook signature check, keyed off the
// org's webhook secret. Identical algo to lib/billing/stripe.ts so we
// don't need the SDK to verify.
export function verifyOrgWebhookSignature(args: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  webhookSecret: string;
  toleranceMs?: number;
  now?: Date;
}): boolean {
  const tolerance = args.toleranceMs ?? 5 * 60 * 1000;
  const now = (args.now ?? new Date()).getTime();
  if (!args.signatureHeader) return false;
  const parts = String(args.signatureHeader)
    .split(",")
    .reduce<Record<string, string[]>>((acc, kv) => {
      const [k, v] = kv.split("=", 2);
      if (k && v) (acc[k.trim()] = acc[k.trim()] || []).push(v.trim());
      return acc;
    }, {});
  const ts = parts.t?.[0];
  const v1 = parts.v1 || [];
  if (!ts || v1.length === 0) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(now - tsNum * 1000) > tolerance) return false;
  const body = typeof args.rawBody === "string" ? args.rawBody : args.rawBody.toString("utf8");
  const expected = crypto
    .createHmac("sha256", args.webhookSecret)
    .update(`${ts}.${body}`)
    .digest("hex");
  for (const sig of v1) {
    if (sig.length !== expected.length) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
    } catch {
      // length mismatch
    }
  }
  return false;
}
