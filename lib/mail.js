// Mail abstraction.
//
// Drivers selected via MAIL_DRIVER:
//   "console"  (default in dev)        — log to stdout, no real send
//   "resend"   (recommended for prod)  — Resend's HTTP API; one env var
//   "smtp"                             — Nodemailer over any SMTP provider
//                                        (Postmark, Mailgun, SES SMTP, …)
//
// Real provider drivers require their respective env vars set; otherwise
// they fall back to console with a warning.

import "dotenv/config";
import { logger } from "./log.js";

const log = logger.child("mail");
const DRIVER = (process.env.MAIL_DRIVER || "console").toLowerCase();
const FROM_DEFAULT =
  process.env.MAIL_FROM || "Compass <noreply@example.invalid>";

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

function consoleSend(msg) {
  const from = msg.from || FROM_DEFAULT;
  const id = `console-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  // Indent the body so multiline output reads nicely; no truncation so
  // tokens / magic links survive console scraping.
  const body = (msg.text || msg.html || "").replace(/\n/g, "\n         ");
  const headerLines = msg.headers
    ? Object.entries(msg.headers)
        .map(([k, v]) => `\n  ${k}: ${v}`)
        .join("")
    : "";
  log.info("dispatched (console driver)", {
    id,
    from,
    to: msg.to,
    subject: msg.subject,
    headers: msg.headers,
  });
  return Promise.resolve({ ok: true, id });
}

async function resendSend(msg) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.warn("RESEND_API_KEY missing; falling back to console driver");
    return consoleSend(msg);
  }
  const body = {
    from: msg.from || FROM_DEFAULT,
    to: Array.isArray(msg.to) ? msg.to : [msg.to],
    subject: msg.subject,
  };
  if (msg.html) body.html = msg.html;
  if (msg.text) body.text = msg.text;
  if (msg.replyTo) body.reply_to = msg.replyTo;
  if (msg.headers) body.headers = msg.headers;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await r.json());
    } catch {
      detail = await r.text();
    }
    return { ok: false, error: `Resend ${r.status}: ${detail.slice(0, 300)}` };
  }
  const json = await r.json();
  return { ok: true, id: json.id };
}

let smtpTransporter = null;
async function smtpSend(msg) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    log.warn("SMTP_HOST missing; falling back to console driver");
    return consoleSend(msg);
  }
  if (!smtpTransporter) {
    const { default: nodemailer } = await import("nodemailer");
    smtpTransporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }
  try {
    const info = await smtpTransporter.sendMail({
      from: msg.from || FROM_DEFAULT,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
      headers: msg.headers,
    });
    return { ok: true, id: info.messageId };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Send a single message.
 * @param {{ to: string|string[], subject: string, html?: string, text?: string,
 *           from?: string, replyTo?: string }} msg
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
export async function send(msg) {
  if (!msg?.to) return { ok: false, error: "Missing recipient" };
  if (!msg.subject) return { ok: false, error: "Missing subject" };
  if (!msg.html && !msg.text) return { ok: false, error: "Missing body" };

  switch (DRIVER) {
    case "console":
      return consoleSend(msg);
    case "resend":
      return resendSend(msg);
    case "smtp":
      return smtpSend(msg);
    case "ses":
    default:
      log.warn("unknown driver; falling back to console", { driver: DRIVER });
      return consoleSend(msg);
  }
}

/**
 * Best-effort batch send. Sequential for the console driver so logs stay
 * ordered; bumped to small parallelism for real drivers.
 */
export async function sendBatch(messages) {
  let sent = 0;
  const errors = [];
  const concurrency = DRIVER === "console" ? 1 : 5;
  let cursor = 0;
  async function worker() {
    while (cursor < messages.length) {
      const i = cursor++;
      const r = await send(messages[i]);
      if (r.ok) sent++;
      else errors.push({ to: messages[i].to, error: r.error });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { sent, errors };
}

export const mailDriver = DRIVER;
