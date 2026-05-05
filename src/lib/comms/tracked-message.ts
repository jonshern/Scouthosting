// Wrap an outbound email/SMS with view + click tracking.
//
// Email: appends a 1x1 pixel that records an "open" event and rewrites
// every plain-text URL in the body to go through the click-redirect.
// SMS:   rewrites URLs to short click-redirect tokens.
//
// We deliberately avoid a heavyweight HTML parser — outgoing emails
// are authored as plain text or trusted HTML by the leader, and we
// only rewrite (a) raw http(s):// URLs in the text and (b) href="..."
// attribute values in HTML.
//
// Recipients keep their original unsubscribe / RSVP-token URLs intact
// because those have to remain stateless and verifiable on receipt;
// we skip rewriting any URL whose path begins with /unsubscribe/,
// /rsvp/, or /t/ for the same reason.

import { makeClickToken, makeOpenToken } from "@/lib/tracking/click-token";

const SKIP_PATH_PREFIXES = ["/unsubscribe/", "/rsvp/", "/t/"];
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/g;

function isSkippable(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return SKIP_PATH_PREFIXES.some((p) => u.pathname.startsWith(p));
  } catch {
    return true;
  }
}

type Ctx = { baseUrl: string; mailLogId: string; recipient: string };

function rewriteUrl(ctx: Ctx, rawUrl: string): string {
  if (isSkippable(rawUrl)) return rawUrl;
  const token = makeClickToken({
    mailLogId: ctx.mailLogId,
    recipient: ctx.recipient,
    url: rawUrl,
  });
  const encoded = encodeURIComponent(rawUrl);
  return `${ctx.baseUrl}/t/c/${token}?to=${encoded}`;
}

function rewriteText(text: string | undefined, ctx: Ctx): string | undefined {
  if (!text) return text;
  return text.replace(URL_RE, (m) => rewriteUrl(ctx, m));
}

function rewriteHtml(html: string | undefined, ctx: Ctx): string | undefined {
  if (!html) return html;
  let out = html.replace(/(\bhref\s*=\s*")([^"]+)(")/gi, (match, pre, url, post) => {
    if (!/^https?:\/\//i.test(url)) return match;
    return `${pre}${rewriteUrl(ctx, url)}${post}`;
  });
  out = out.replace(/>([^<]*)</g, (_match, inner) => {
    return ">" + (inner as string).replace(URL_RE, (m: string) => rewriteUrl(ctx, m)) + "<";
  });
  return out;
}

function pixelHtml(ctx: Ctx): string {
  const token = makeOpenToken({ mailLogId: ctx.mailLogId, recipient: ctx.recipient });
  return `<img src="${ctx.baseUrl}/t/o/${token}.png" alt="" width="1" height="1" style="display:block;border:0;width:1px;height:1px" loading="eager">`;
}

export type TrackedEmailInput = {
  baseUrl: string;
  mailLogId: string;
  recipient: string;
  text?: string;
  html?: string;
  subject?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  to: string;
};

export type TrackedEmailOutput = {
  to: string;
  subject?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  text?: string;
  html?: string;
};

export function trackEmail(input: TrackedEmailInput): TrackedEmailOutput {
  const ctx: Ctx = {
    baseUrl: input.baseUrl,
    mailLogId: input.mailLogId,
    recipient: input.recipient,
  };
  const trackedText = rewriteText(input.text, ctx);

  let trackedHtml: string | undefined;
  if (input.html) {
    trackedHtml = (rewriteHtml(input.html, ctx) ?? "") + pixelHtml(ctx);
  } else if (input.text) {
    const escaped = String(input.text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const linkified = escaped.replace(URL_RE, (m) => {
      const tracked = rewriteUrl(ctx, m);
      return `<a href="${tracked}" style="color:#0f172a">${m}</a>`;
    });
    trackedHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap;line-height:1.45">${linkified}</div>${pixelHtml(ctx)}`;
  }

  return {
    to: input.to,
    subject: input.subject,
    from: input.from,
    replyTo: input.replyTo,
    headers: input.headers,
    text: trackedText,
    html: trackedHtml,
  };
}

export function trackSmsBody(input: {
  baseUrl: string;
  mailLogId: string;
  recipient: string;
  body: string;
}): string | undefined {
  return rewriteText(input.body, {
    baseUrl: input.baseUrl,
    mailLogId: input.mailLogId,
    recipient: input.recipient,
  });
}
