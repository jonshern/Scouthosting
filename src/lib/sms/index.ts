// SMS abstraction.
//
// Drivers selected via SMS_DRIVER:
//   "console" (default) — log to stdout, no real send
//   "twilio"            — Twilio REST API (no SDK; one fetch())
//
// Pairs with Member.commPreference + Member.smsOptIn for broadcast
// targeting. Falls back to console with a warning if env vars missing.

import { logger } from "@/lib/log";
import { isDemoMode } from "@/lib/demo/mode";
import { captureOutbound } from "@/lib/demo/outbox";

const log = logger.child("sms");

function driver(): string {
  return (process.env.SMS_DRIVER || "console").toLowerCase();
}

function fromNumber(): string {
  return process.env.TWILIO_FROM || "";
}

export type SmsMessage = { to: string; body: string };
export type SmsResult = { ok: true; id: string } | { ok: false; error: string };

async function consoleSend({ to, body }: SmsMessage): Promise<SmsResult> {
  const id = `sms-console-${Date.now().toString(36)}`;
  log.info("dispatched (console driver)", { id, to, preview: body.slice(0, 160) });
  return { ok: true, id };
}

async function twilioSend({ to, body }: SmsMessage): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const FROM = fromNumber();
  if (!sid || !token || !FROM) {
    log.warn(
      "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM missing; falling back to console driver",
    );
    return consoleSend({ to, body });
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ From: FROM, To: to, Body: body });
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await r.json());
    } catch {
      detail = await r.text();
    }
    return { ok: false, error: `Twilio ${r.status}: ${detail.slice(0, 300)}` };
  }
  const json = (await r.json()) as { sid?: string };
  return { ok: true, id: json.sid ?? "" };
}

/**
 * Normalize a US-style "555-123-4567" to "+15551234567"; pass through
 * if already E.164. Anything else returns null so the broadcaster can
 * skip.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\+\d{8,15}$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(msg: SmsMessage): Promise<SmsResult> {
  if (!msg.to) return { ok: false, error: "Missing recipient" };
  if (!msg.body) return { ok: false, error: "Missing body" };
  const phone = normalisePhone(msg.to);
  if (!phone) return { ok: false, error: `Invalid phone: ${msg.to}` };
  // A demo deployment never sends real texts (src/lib/demo/mode.ts).
  if (isDemoMode()) {
    return { ok: true, id: await captureOutbound({ kind: "sms", to: phone, body: msg.body }) };
  }
  const d = driver();
  switch (d) {
    case "console":
      return consoleSend({ to: phone, body: msg.body });
    case "twilio":
      return twilioSend({ to: phone, body: msg.body });
    default:
      log.warn("unknown driver; falling back to console", { driver: d });
      return consoleSend({ to: phone, body: msg.body });
  }
}

export async function sendSmsBatch(
  messages: SmsMessage[],
): Promise<{ sent: number; errors: Array<{ to: string; error: string }> }> {
  let sent = 0;
  const errors: Array<{ to: string; error: string }> = [];
  const concurrency = driver() === "console" ? 1 : 3;
  let cursor = 0;
  async function worker() {
    while (cursor < messages.length) {
      const i = cursor++;
      const r = await sendSms(messages[i]);
      if (r.ok) sent++;
      else errors.push({ to: messages[i].to, error: r.error });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { sent, errors };
}

export const smsDriver = driver;
