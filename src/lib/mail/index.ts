/**
 * Mail driver. Console by default (logs to stdout, no external traffic).
 * Production should set MAIL_DRIVER=resend and RESEND_API_KEY.
 *
 * The Compass Express app supports console / smtp / resend; this v1 port
 * keeps the surface identical and lights up `console` first. Resend +
 * SMTP land as parallel modules; admin code calls `send()` either way.
 */

import { isDemoMode } from "@/lib/demo/mode";
import { captureOutbound, plainText } from "@/lib/demo/outbox";

export type MailMessage = {
  to: string;
  toName?: string | null;
  subject: string;
  // HTML body (already escaped/sanitized by the caller).
  html: string;
  // Plaintext fallback. If missing, derived from `html` by stripping tags.
  text?: string;
  replyTo?: string;
  unsubscribeUrl?: string;
};

export type MailResult = { ok: true; messageId?: string } | { ok: false; error: string };

export interface MailDriver {
  send(msg: MailMessage): Promise<MailResult>;
}

class ConsoleDriver implements MailDriver {
  async send(msg: MailMessage): Promise<MailResult> {
    const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // eslint-disable-next-line no-console
    console.log("[mail:console]", JSON.stringify({
      id, to: msg.to, subject: msg.subject, bytes: msg.html.length,
    }));
    return { ok: true, messageId: id };
  }
}

class ResendDriver implements MailDriver {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}
  async send(msg: MailMessage): Promise<MailResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        // A hung provider must not hold the request (and a group send's
        // whole loop) open until the platform kills it.
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text ?? stripHtml(msg.html),
          reply_to: msg.replyTo,
          headers: msg.unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${msg.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `resend ${res.status}: ${await res.text().catch(() => "")}` };
      }
      const body = (await res.json()) as { id?: string };
      return { ok: true, messageId: body.id };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }
}

let cached: MailDriver | null = null;

export function getMailDriver(): MailDriver {
  if (cached) return cached;
  const driver = (process.env.MAIL_DRIVER ?? "console").toLowerCase();
  if (driver === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM ?? "Compass <noreply@compass.app>";
    if (!key) {
      // eslint-disable-next-line no-console
      console.warn("MAIL_DRIVER=resend but RESEND_API_KEY is unset; falling back to console");
      cached = new ConsoleDriver();
      return cached;
    }
    cached = new ResendDriver(key, from);
    return cached;
  }
  cached = new ConsoleDriver();
  return cached;
}

export function _setMailDriverForTests(d: MailDriver | null): void {
  cached = d;
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  // A demo deployment never sends real mail (src/lib/demo/mode.ts).
  if (isDemoMode()) {
    const messageId = await captureOutbound({
      kind: "email",
      to: msg.to,
      toName: msg.toName,
      subject: msg.subject,
      body: msg.text ?? plainText(msg.html),
    });
    return { ok: true, messageId };
  }
  return getMailDriver().send(msg);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
