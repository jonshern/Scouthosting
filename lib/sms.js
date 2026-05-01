// SMS abstraction.
//
// Drivers selected via SMS_DRIVER:
//   "console" (default) — log to stdout, no real send
//   "twilio"            — Twilio REST API (no SDK; one fetch())
//
// Pairs with Member.commPreference + Member.smsOptIn for broadcast
// targeting. Falls back to console with a warning if env vars missing.

import "dotenv/config";
import { logger } from "./log.js";

const log = logger.child("sms");
const DRIVER = (process.env.SMS_DRIVER || "console").toLowerCase();
const FROM = process.env.TWILIO_FROM || ""; // E.164, e.g. "+15551234567"

function consoleSend({ to, body }) {
  const id = `sms-console-${Date.now().toString(36)}`;
  log.info("dispatched (console driver)", { id, to, preview: body.slice(0, 160) });
  return Promise.resolve({ ok: true, id });
}

async function twilioSend({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !FROM) {
    log.warn("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM missing; falling back to console driver");
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
  const json = await r.json();
  return { ok: true, id: json.sid };
}

/**
 * Normalize a US-style "555-123-4567" to "+15551234567"; pass through if
 * already E.164. Anything else returns null so the broadcaster can skip.
 */
export function normalisePhone(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\+\d{8,15}$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Send a single SMS.
 * @param {{ to: string, body: string }} msg
 */
export async function sendSms({ to, body }) {
  if (!to) return { ok: false, error: "Missing recipient" };
  if (!body) return { ok: false, error: "Missing body" };
  const phone = normalisePhone(to);
  if (!phone) return { ok: false, error: `Invalid phone: ${to}` };
  switch (DRIVER) {
    case "console":
      return consoleSend({ to: phone, body });
    case "twilio":
      return twilioSend({ to: phone, body });
    default:
      log.warn("unknown driver; falling back to console", { driver: DRIVER });
      return consoleSend({ to: phone, body });
  }
}

export async function sendSmsBatch(messages) {
  let sent = 0;
  const errors = [];
  const concurrency = DRIVER === "console" ? 1 : 3;
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

export const smsDriver = DRIVER;
