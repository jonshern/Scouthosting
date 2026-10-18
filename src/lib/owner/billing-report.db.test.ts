// A paid invoice from the Stripe webhook lands in the billing report
// once, however many times Stripe sends it. Runs only with
// TEST_DATABASE_URL set; cleans up only its own rows.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncFromStripeEvent } from "@/lib/billing/stripe";
import { paymentReport } from "./billing-report";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;

describe.skipIf(!db)("billing report: payments from the webhook", () => {
  let orgId = "";
  const customer = `cus_report_${S}`;

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: {
        slug: `report-${S}`,
        unitType: "Troop",
        unitNumber: "1",
        displayName: `Report ${S}`,
        charterOrg: "x",
        city: "x",
        state: "MN",
        scoutmasterName: "x",
        scoutmasterEmail: `report-${S}@example.invalid`,
        stripeCustomerId: customer,
        subscriptionStatus: "active",
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.billingPayment.deleteMany({ where: { stripeCustomerId: customer } });
    if (orgId) await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("records a paid invoice once and skips a $0 one", async () => {
    const paidAt = Math.floor(Date.now() / 1000) - 60;
    const invoice = (id: string, amount: number) => ({
      type: "invoice.payment_succeeded",
      livemode: false,
      data: { object: { id, customer, amount_paid: amount, currency: "usd", status_transitions: { paid_at: paidAt } } },
    });
    const before = await paymentReport("test");
    await syncFromStripeEvent(invoice(`in_a_${S}`, 9900));
    await syncFromStripeEvent(invoice(`in_a_${S}`, 9900));
    await syncFromStripeEvent(invoice(`in_zero_${S}`, 0));

    const rows = await prisma.billingPayment.findMany({ where: { stripeCustomerId: customer } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orgId, amountCents: 9900, livemode: false });
    expect(rows[0].paidAt.getTime()).toBe(paidAt * 1000);

    const after = await paymentReport("test");
    expect(after.last30.cents - before.last30.cents).toBe(9900);
    expect((await paymentReport("live")).recent.some((p) => p.stripeCustomerId === customer)).toBe(false);
  });
});
