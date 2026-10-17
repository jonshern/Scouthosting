// Money posts exactly once when requests race, against a real Postgres.
// Skipped unless TEST_DATABASE_URL points at a migrated test database.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { provisionOrgVault } from "@/lib/encryption";
import { applyStripeOnce } from "@/lib/billing/stripe-idempotency";
import { provisionTreasury } from "./provision";
import { postTransaction, reverseTransaction } from "./posting";
import { setOrgStripeCredentials } from "./stripe";
import { settleEventChargeForRsvp } from "./event-charge";
import { settleSalesOrderAsPaid, unsettleSalesOrder } from "@/lib/sales";
import { GENERAL_FUND, SCOUT_ACCOUNTS } from "./money";
import { POST as treasuryWebhook } from "@/app/api/webhooks/treasury-stripe/route";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("money posts exactly once under concurrency", () => {
  const tag = `money-races-${Date.now()}`;
  const webhookSecret = `whsec_${"a".repeat(24)}`;
  let orgId = "";
  let memberId = "";

  beforeAll(async () => {
    const vault = await provisionOrgVault("money-races-passphrase");
    const org = await prisma.org.create({
      data: {
        slug: tag,
        unitType: "Troop",
        unitNumber: "996",
        displayName: "Money races",
        charterOrg: "Test",
        city: "Test",
        state: "TS",
        scoutmasterName: "Test",
        scoutmasterEmail: `${tag}@example.invalid`,
        ...vault.fields,
      },
    });
    orgId = org.id;
    await prisma.org.update({
      where: { id: orgId },
      data: setOrgStripeCredentials({ org, apiKey: "sk_test_123456789", webhookSecret }),
    });
    await provisionTreasury(orgId);
    memberId = (await prisma.member.create({ data: { orgId, isYouth: true, email: `kid-${tag}@example.invalid` } })).id;
  });

  afterAll(async () => {
    await prisma.salesCampaign.deleteMany({ where: { orgId } });
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.stripeWebhookReceipt.deleteMany({ where: { key: { contains: tag } } });
  });

  const balance = async (code: string) =>
    (await prisma.fund.findUniqueOrThrow({ where: { orgId_code: { orgId, code } } })).balanceCents;

  it("applyStripeOnce applies one of two concurrent deliveries, and rolls back on failure", async () => {
    const key = `test:${tag}:once`;
    let applied = 0;
    const run = () =>
      applyStripeOnce({ key, eventId: "evt_1", eventType: "x" }, async () => {
        applied += 1;
        await new Promise((r) => setTimeout(r, 50));
        return applied;
      });
    const results = await Promise.all([run(), run(), run()]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(applied).toBe(1);

    const failKey = `test:${tag}:fails`;
    await expect(
      applyStripeOnce({ key: failKey, eventId: "evt_2", eventType: "x" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // The receipt rolled back with the failed writes, so a retry applies.
    const retry = await applyStripeOnce({ key: failKey, eventId: "evt_2", eventType: "x" }, async () => "ok");
    expect(retry).toEqual({ duplicate: false, result: "ok" });
  });

  it("credits a Stripe member payment once when both of its events arrive together", async () => {
    const pi = `pi_${tag}`;
    const before = { general: await balance(GENERAL_FUND), scouts: await balance(SCOUT_ACCOUNTS) };
    const deliver = (type: string, object: Record<string, unknown>) => {
      const body = JSON.stringify({
        id: `evt_${crypto.randomUUID()}`,
        type,
        data: { object: { ...object, metadata: { treasury: "1", memberId } } },
      });
      const t = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac("sha256", webhookSecret).update(`${t}.${body}`).digest("hex");
      return treasuryWebhook(
        new Request(`http://localhost/api/webhooks/treasury-stripe?org=${tag}`, {
          method: "POST",
          body,
          headers: { "stripe-signature": `t=${t},v1=${sig}` },
        }),
      );
    };
    const responses = await Promise.all([
      deliver("checkout.session.completed", { id: `cs_${tag}`, payment_intent: pi, amount_total: 2500 }),
      deliver("payment_intent.succeeded", { id: pi, amount_received: 2500 }),
      deliver("payment_intent.succeeded", { id: pi, amount_received: 2500 }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    const deposits = await prisma.transaction.count({
      where: { orgId, stripePaymentIntentId: pi, type: "deposit", memberId },
    });
    expect(deposits).toBe(2); // general deposit + member credit, once each
    expect(await balance(GENERAL_FUND)).toBe(before.general); // in, then transferred out
    expect(await balance(SCOUT_ACCOUNTS)).toBe(before.scouts + 5000); // transfer-in + credit
    const sub = await prisma.memberSubaccount.findUniqueOrThrow({ where: { memberId } });
    expect(sub.balanceCents).toBe(2500);
  });

  it("settles a sales order once when the webhook and a leader race", async () => {
    const general = await prisma.fund.findUniqueOrThrow({ where: { orgId_code: { orgId, code: GENERAL_FUND } } });
    const campaign = await prisma.salesCampaign.create({
      data: {
        orgId,
        name: `Popcorn ${tag}`,
        startsOn: new Date(),
        endsOn: new Date(Date.now() + 86400000),
        fundId: general.id,
        proceedsSplit: "per-scout",
        scoutSplitPct: 50,
      },
    });
    const order = await prisma.salesOrder.create({
      data: { orgId, campaignId: campaign.id, source: "public-page", scoutMemberId: memberId, buyerName: "Neighbor", totalCents: 4000 },
    });
    const settle = (paymentSource: "manual" | "stripe") =>
      settleSalesOrderAsPaid({ orgId, orderId: order.id, paymentSource, stripePaymentIntentId: paymentSource === "stripe" ? `pi_sale_${tag}` : null });
    const results = await Promise.all([settle("stripe"), settle("stripe"), settle("manual")]);
    expect(results.filter((r) => r.settled)).toHaveLength(1);
    expect(await prisma.transaction.count({ where: { salesOrderId: order.id, type: "deposit" } })).toBe(1);
    expect(await prisma.transaction.count({ where: { salesOrderId: order.id, type: "fundraiser-credit" } })).toBe(1);
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
  });

  it("cancelling a paid order takes its money back off the books, once", async () => {
    const general = await prisma.fund.findUniqueOrThrow({ where: { orgId_code: { orgId, code: GENERAL_FUND } } });
    const campaign = await prisma.salesCampaign.create({
      data: {
        orgId, name: `Wreaths ${tag}`, startsOn: new Date(), endsOn: new Date(Date.now() + 86400000),
        fundId: general.id, proceedsSplit: "per-scout", scoutSplitPct: 25,
      },
    });
    const order = await prisma.salesOrder.create({
      data: { orgId, campaignId: campaign.id, source: "public-page", scoutMemberId: memberId, buyerName: "Neighbor", totalCents: 2000 },
    });
    const before = { general: await balance(GENERAL_FUND), scouts: await balance(SCOUT_ACCOUNTS) };
    const sub = async () => (await prisma.memberSubaccount.findUnique({ where: { memberId } }))?.balanceCents ?? 0;
    const subBefore = await sub();

    await settleSalesOrderAsPaid({ orgId, orderId: order.id, paymentSource: "stripe", stripePaymentIntentId: `pi_wreath_${tag}` });
    expect(await sub()).toBe(subBefore + 500);

    const results = await Promise.allSettled([
      unsettleSalesOrder({ orgId, orderId: order.id, status: "cancelled" }),
      unsettleSalesOrder({ orgId, orderId: order.id, status: "cancelled" }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await balance(GENERAL_FUND)).toBe(before.general);
    expect(await balance(SCOUT_ACCOUNTS)).toBe(before.scouts);
    expect(await sub()).toBe(subBefore);
    expect(await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: "cancelled", depositTransactionId: null,
    });

    // A retried Stripe event doesn't revive it.
    const late = await settleSalesOrderAsPaid({ orgId, orderId: order.id, paymentSource: "stripe", stripePaymentIntentId: `pi_wreath_${tag}` });
    expect(late.settled).toBe(false);
  });

  it("reverses a transaction only once", async () => {
    const general = await prisma.fund.findUniqueOrThrow({ where: { orgId_code: { orgId, code: GENERAL_FUND } } });
    const t = await postTransaction({ orgId, fundId: general.id, type: "deposit", amountCents: 700, description: "cash" });
    const before = await balance(GENERAL_FUND);
    const results = await Promise.allSettled([
      reverseTransaction({ orgId, originalId: t.id }),
      reverseTransaction({ orgId, originalId: t.id }),
      reverseTransaction({ orgId, originalId: t.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(String(r.reason)).toMatch(/already reversed/);
    }
    expect(await balance(GENERAL_FUND)).toBe(before - 700);
  });

  it("charges an event once for a double-tap yes, and leaves no charge after yes then no", async () => {
    const event = await prisma.event.create({ data: { orgId, title: "Campout", startsAt: new Date("2026-11-01"), cost: 15 } });
    const rsvp = await prisma.rsvp.create({
      data: { orgId, eventId: event.id, memberId, name: "Kid", email: `rsvp-${tag}@example.invalid`, response: "yes" },
    });
    const settle = (response: "yes" | "no") => settleEventChargeForRsvp({ orgId, eventId: event.id, memberId, response });
    await Promise.all([settle("yes"), settle("yes"), settle("yes")]);
    const open = () =>
      prisma.transaction.count({ where: { eventId: event.id, memberId, type: "event-charge", reversedBy: { none: {} } } });
    expect(await open()).toBe(1);

    // "yes" then "no": the RSVP ends as "no"; both settlements race. The
    // ledger must follow the final RSVP, whichever settles last.
    await prisma.rsvp.update({ where: { id: rsvp.id }, data: { response: "no" } });
    await Promise.all([settle("yes"), settle("no")]);
    expect(await open()).toBe(0);
  });
});
