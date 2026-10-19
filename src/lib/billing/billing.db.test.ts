// Self-serve sign-up through to a paying unit, against real Postgres:
// startUnitTrial, Checkout carrying the trial over, the webhook sync,
// and GET /api/v1/orgs/:slug/subscription. Runs only with
// TEST_DATABASE_URL set; cleans up only the rows it made.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
  process.env.STRIPE_SECRET_KEY = "sk_test_unit";
  process.env.STRIPE_PRICE_YEARLY = "price_year";
  process.env.STRIPE_PRICE_MONTHLY = "price_month";
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import { startUnitTrial } from "@/lib/provision/self-serve";
import { createCheckoutSession, setStripeClientForTests, syncFromStripeEvent } from "./stripe";
import { createStripeRestClient } from "./stripe-rest";
import { TRIAL_DAYS, billingSummary } from "./trial";
import { applyStripeOnce, stripeKey } from "./stripe-idempotency";
import * as subscription from "@/app/api/v1/orgs/[slug]/subscription/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
// A unit number nobody else's test uses, so slugs don't collide.
const NUM = String(10000 + (Number.parseInt(S.slice(-6), 36) % 89999));
const CITY = `Billtown ${S}`;
const DAY = 24 * 60 * 60 * 1000;

const f = {} as {
  owner: { id: string; email: string; displayName: string; token: string };
  outsider: { id: string; token: string };
  orgIds: string[];
};

async function makeUser(label: string) {
  const email = `${label}-${S}@example.invalid`;
  const user = await prisma.user.create({ data: { email, displayName: `${label} ${S}`, adultAttestedAt: new Date() } });
  const token = await issueToken(user.id, "test", prisma);
  return { id: user.id, email, displayName: user.displayName ?? label, token: token.raw };
}

async function getSubscription(slug: string, token: string) {
  const req = new NextRequest("http://localhost/api/v1/test", { headers: { authorization: `Bearer ${token}` } });
  const res = await subscription.GET(req, { params: Promise.resolve({ slug }) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const input = {
  unitType: "Troop" as const,
  unitNumber: NUM,
  charterOrg: "First Church",
  city: CITY,
  state: "MN",
  passphrase: "unit-passphrase-123",
  passphraseConfirm: "unit-passphrase-123",
};

describe.skipIf(!db)("self-serve trial and billing (Postgres)", () => {
  beforeAll(async () => {
    f.owner = await makeUser("owner");
    f.outsider = await makeUser("outsider");
    f.orgIds = [];
  });

  afterAll(async () => {
    setStripeClientForTests(null);
    await prisma.org.deleteMany({ where: { id: { in: f.orgIds } } });
    await prisma.stripeWebhookReceipt.deleteMany({ where: { eventId: { startsWith: `evt_${S}` } } });
    await prisma.user.deleteMany({ where: { id: { in: [f.owner?.id, f.outsider?.id].filter(Boolean) } } });
  });

  it("creates the unit with a TRIAL_DAYS trial and makes the signer its admin and owner", async () => {
    const before = Date.now();
    const res = await startUnitTrial(f.owner, input);
    const org = await prisma.org.findUniqueOrThrow({ where: { slug: res.slug } });
    f.orgIds.push(org.id);

    expect(org.slug).toBe(`troop${NUM}`);
    expect(org.subscriptionStatus).toBe("trialing");
    expect(org.ownerId).toBe(f.owner.id);
    expect(org.scoutmasterEmail).toBe(f.owner.email);
    const days = (org.trialEndsAt!.getTime() - before) / DAY;
    expect(days).toBeGreaterThan(TRIAL_DAYS - 0.01);
    expect(days).toBeLessThan(TRIAL_DAYS + 0.01);
    expect(res.recoveryCode).toBeTruthy();

    const m = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: f.owner.id, orgId: org.id } },
    });
    expect(m?.role).toBe("admin");
  });

  it("gives a second unit with the same number a city-suffixed address", async () => {
    const res = await startUnitTrial(f.owner, input);
    const org = await prisma.org.findUniqueOrThrow({ where: { slug: res.slug } });
    f.orgIds.push(org.id);
    expect(res.slug).toMatch(new RegExp(`^troop${NUM}-billtown-`));
  });

  it("starts Checkout with the rest of the trial free", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://stripe.test/cs_1" })));
    setStripeClientForTests(createStripeRestClient("sk_test_unit", fetchImpl));
    const org = await prisma.org.findFirstOrThrow({ where: { id: f.orgIds[0] } });

    const out = await createCheckoutSession(org, { email: f.owner.email }, {
      interval: "month",
      successUrl: "https://x/ok",
      cancelUrl: "https://x/no",
    });
    expect(out.url).toBe("https://stripe.test/cs_1");
    const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_month");
    expect(body.get("subscription_data[metadata][orgId]")).toBe(org.id);
    expect(Number(body.get("subscription_data[trial_end]"))).toBe(Math.floor(org.trialEndsAt!.getTime() / 1000));
    expect(body.get("customer_email")).toBe(f.owner.email);
  });

  it("follows Stripe webhooks from checkout to renewal to cancellation", async () => {
    const orgId = f.orgIds[0]!;
    const customer = `cus_${S}`;
    const sub = `sub_${S}`;

    expect(
      await syncFromStripeEvent({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", customer, subscription: sub, metadata: { orgId } } },
      }),
    ).toEqual({ ok: true });

    // Newer API versions put the period end on the subscription item.
    const periodEnd = Math.floor((Date.now() + 30 * DAY) / 1000);
    await syncFromStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: sub,
          customer,
          status: "trialing",
          cancel_at_period_end: false,
          items: { data: [{ price: { id: "price_month" }, current_period_end: periodEnd }] },
        },
      },
    });
    let org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.subscriptionStatus).toBe("active");
    expect(org.stripeCustomerId).toBe(customer);
    expect(org.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
    expect(billingSummary(org, { stripeConfigured: true })).toMatchObject({ subscribed: true, locked: false });

    // An invoice found through the customer when it has no metadata.
    await syncFromStripeEvent({ type: "invoice.payment_failed", data: { object: { id: "in_1", customer } } });
    org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.subscriptionStatus).toBe("past_due");

    await syncFromStripeEvent({ type: "customer.subscription.deleted", data: { object: { id: sub, customer } } });
    org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.subscriptionStatus).toBe("canceled");
    expect(billingSummary(org, { stripeConfigured: true }).locked).toBe(true);
  });

  it("serves the subscription to members over the API and refuses outsiders", async () => {
    const org = await prisma.org.findUniqueOrThrow({ where: { id: f.orgIds[1] } });
    const ok = await getSubscription(org.slug, f.owner.token);
    expect(ok.status).toBe(200);
    expect(ok.json.subscription).toMatchObject({ status: "trialing", trialDaysLeft: TRIAL_DAYS, locked: false, subscribed: false });

    const no = await getSubscription(org.slug, f.outsider.token);
    expect(no.status).toBe(403);
  });

  it("skips a subscription event that arrives after a newer one", async () => {
    const orgId = f.orgIds[1]!;
    const sub = `sub_${S}_late`;
    const t = Math.floor(Date.now() / 1000);
    const updated = (created: number, status: string) =>
      syncFromStripeEvent({
        id: `evt_${S}_${created}`,
        type: "customer.subscription.updated",
        created,
        data: { object: { id: sub, status, metadata: { orgId } } },
      });

    expect(await updated(t, "canceled")).toEqual({ ok: true });
    expect(await updated(t - 60, "active")).toEqual({ ok: true, ignored: true, reason: "stale" });
    let org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.subscriptionStatus).toBe("canceled");
    expect(org.stripeEventAt?.getTime()).toBe(t * 1000);

    expect(await updated(t + 60, "active")).toEqual({ ok: true });
    org = await prisma.org.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.subscriptionStatus).toBe("active");
  });

  it("applies a redelivered subscription event once", async () => {
    const orgId = f.orgIds[1]!;
    const event = {
      id: `evt_${S}_redelivered`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000) + 3600,
      data: { object: { id: `sub_${S}_late`, status: "past_due", metadata: { orgId } } },
    };
    const deliver = () =>
      applyStripeOnce({ key: stripeKey("event", event.id), eventId: event.id, eventType: event.type }, (tx) =>
        syncFromStripeEvent(event, tx),
      );
    expect(await deliver()).toEqual({ duplicate: false, result: { ok: true } });
    expect(await deliver()).toEqual({ duplicate: true });
    const audits = await prisma.auditLog.count({
      where: { orgId, action: "billing.subscription_updated", summary: { startsWith: "Status=past_due" } },
    });
    expect(audits).toBe(1);
  });
});
