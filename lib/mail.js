// Mail abstraction.
//
// Phase 1 ships a console driver: every send is logged to stdout and a
// MailLog row is written by the caller. Real providers (Resend, SES,
// Mailgun, SMTP via nodemailer) plug in here without touching the call
// sites.
//
// Driver selection is via MAIL_DRIVER env var:
//   "console"  (default in dev)  — log + return ok
//   "smtp"     — TODO: wire nodemailer
//   "resend"   — TODO: wire @resend/node
//   "ses"      — TODO: wire @aws-sdk/client-sesv2

import "dotenv/config";

const DRIVER = (process.env.MAIL_DRIVER || "console").toLowerCase();
const FROM_DEFAULT = process.env.MAIL_FROM || "Scouthosting <noreply@example.invalid>";

/**
 * Send a single message.
 * @param {{ to: string, subject: string, html?: string, text?: string,
 *           from?: string, replyTo?: string }} msg
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
export async function send(msg) {
  if (!msg?.to) return { ok: false, error: "Missing recipient" };
  if (!msg.subject) return { ok: false, error: "Missing subject" };
  if (!msg.html && !msg.text) return { ok: false, error: "Missing body" };

  switch (DRIVER) {
    case "console":
      return sendConsole(msg);
    case "smtp":
    case "resend":
    case "ses":
      // Not wired yet — fall through to console with a warning so devs can
      // tell the difference between "configured" and "actually sending".
      console.warn(`[mail] driver "${DRIVER}" not implemented yet; falling back to console.`);
      return sendConsole(msg);
    default:
      return { ok: false, error: `Unknown MAIL_DRIVER: ${DRIVER}` };
  }
}

function sendConsole(msg) {
  const from = msg.from || FROM_DEFAULT;
  const id = `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(
    `[mail/console] ${id}\n  from:  ${from}\n  to:    ${msg.to}\n  subj:  ${msg.subject}\n  body:  ${
      (msg.text || msg.html || "").slice(0, 200).replace(/\n/g, "\\n")
    }${(msg.text || msg.html || "").length > 200 ? "..." : ""}`
  );
  return Promise.resolve({ ok: true, id });
}

/**
 * Best-effort batch send. Returns counts and a list of errors.
 * Sequential on purpose so console output stays readable; a real
 * provider should override with a parallel/queued send.
 */
export async function sendBatch(messages) {
  let sent = 0;
  const errors = [];
  for (const m of messages) {
    const r = await send(m);
    if (r.ok) sent++;
    else errors.push({ to: m.to, error: r.error });
  }
  return { sent, errors };
}

export const mailDriver = DRIVER;
