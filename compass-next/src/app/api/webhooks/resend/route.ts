// POST /api/webhooks/resend — Svix-signed event from Resend.
//
// Bounces and complaints flip every Member with the bounced address
// to bouncedAt / emailUnsubscribed so future broadcasts skip them.
// We respond 200 even on no-op events (delivered / opened / clicked)
// so Resend doesn't retry; we return 401 on missing/bad signature so
// a misconfig surfaces in Resend's delivery dashboard.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  normalizeResendEvent,
  verifyResendSignature,
  type ResendEvent,
} from "@/lib/mail/resend-webhook";

// Disable Next.js's automatic body parsing — we need the raw bytes
// for HMAC verification.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const headers: Record<string, string | undefined> = {};
  // Lowercase keys so the verifier's lookups (svix-id etc.) hit.
  for (const [k, v] of req.headers.entries()) {
    headers[k.toLowerCase()] = v;
  }

  const v = verifyResendSignature(headers, rawBody, secret);
  if (!v.ok) {
    return NextResponse.json({ error: "bad_signature", reason: v.reason }, { status: 401 });
  }

  let body: ResendEvent | null = null;
  try {
    body = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const event = normalizeResendEvent(body);
  if (!event.kind || !event.email) {
    // Delivered / sent / opened / clicked — ack so Resend stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Mark every Member across every org with this email — one household
  // can have the same email recorded on multiple Member rows.
  const updated = await prisma.member.updateMany({
    where: { email: event.email },
    data: {
      bouncedAt: new Date(),
      bounceReason: event.reason,
      emailUnsubscribed: true,
      unsubscribedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    kind: event.kind,
    email: event.email,
    affected: updated.count,
  });
}
