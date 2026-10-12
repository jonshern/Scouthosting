// POST /api/webhooks/stripe — Stripe-signed event. Subscription state
// sync. Always 200 on handled / ignored events; 401 on signature
// failure (so Stripe surfaces the misconfig). Each event id runs once;
// a redelivery answers { duplicate: true } without touching anything.

import { NextResponse, type NextRequest } from "next/server";
import { syncFromStripeEvent, verifyStripeSignature, type StripeEvent } from "@/lib/billing/stripe";
import { withStripeEventOnce } from "@/lib/billing/webhook-events";
import { logger } from "@/lib/log";

const log = logger.child("stripe-webhook");

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  const v = verifyStripeSignature(rawBody, sig, secret);
  if (!v.ok) {
    log.warn("stripe webhook signature failed", { reason: v.reason });
    return NextResponse.json(
      { error: "bad_signature", reason: v.reason },
      { status: 401 },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  try {
    const event = body as StripeEvent;
    const once = await withStripeEventOnce(event, "platform", () => syncFromStripeEvent(event));
    if (once.duplicate) return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json(once.result);
  } catch (err) {
    log.error("syncFromStripeEvent threw", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
