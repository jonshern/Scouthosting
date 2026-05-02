// Wrap an outbound email/SMS with view + click tracking.
//
// Email: appends a 1x1 pixel that records an "open" event and rewrites
// every plain-text URL in the body to go through the click-redirect.
// SMS:   rewrites URLs to short click-redirect tokens.
//
// We deliberately avoid a heavyweight HTML parser — outgoing emails are
// authored as plain text or trusted HTML by the leader, and we only
// rewrite (a) raw http(s):// URLs in the text and (b) href="..."
// attribute values in HTML. Anything else (links inside JS, base64
// images, etc.) is passed through unchanged.
//
// Recipients keep their original unsubscribe / RSVP-token URLs intact
// because those have to remain stateless and verifiable on receipt;
// we skip rewriting any URL whose path begins with /unsubscribe/ or
// /rsvp/ for the same reason.

import { makeOpenToken, makeClickToken } from "./trackingToken.js";

const SKIP_PATH_PREFIXES = ["/unsubscribe/", "/rsvp/", "/t/"];

// Match http(s):// URLs that aren't already inside an HTML attribute.
// Keeps it simple — handles the common case (URL on its own in text or
// inside Markdown); doesn't try to be perfect inside raw HTML where
// we use a separate href= regex.
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/g;

function isSkippable(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return SKIP_PATH_PREFIXES.some((p) => u.pathname.startsWith(p));
  } catch {
    return true; // unparseable: leave it alone
  }
}

function rewriteUrl({ baseUrl, rawUrl, mailLogId, recipient }) {
  if (isSkippable(rawUrl)) return rawUrl;
  const token = makeClickToken({ mailLogId, recipient, url: rawUrl });
  const encoded = encodeURIComponent(rawUrl);
  return `${baseUrl}/t/c/${token}?to=${encoded}`;
}

function rewriteText(text, ctx) {
  if (!text) return text;
  return text.replace(URL_RE, (m) => rewriteUrl({ ...ctx, rawUrl: m }));
}

function rewriteHtml(html, ctx) {
  if (!html) return html;
  // 1) Rewrite href="..." in anchors.
  let out = html.replace(/(\bhref\s*=\s*")([^"]+)(")/gi, (match, pre, url, post) => {
    if (!/^https?:\/\//i.test(url)) return match;
    return `${pre}${rewriteUrl({ ...ctx, rawUrl: url })}${post}`;
  });
  // 2) Rewrite raw URLs in visible text — same rule as the plain-text
  // path. Skip URLs that are already inside attribute quotes by only
  // matching outside of them; the simple `>...<` heuristic catches the
  // common case where the visible URL is the same as href.
  out = out.replace(/>([^<]*)</g, (_match, inner) => {
    return ">" + inner.replace(URL_RE, (m) => rewriteUrl({ ...ctx, rawUrl: m })) + "<";
  });
  return out;
}

function pixelHtml({ baseUrl, mailLogId, recipient }) {
  const token = makeOpenToken({ mailLogId, recipient });
  return `<img src="${baseUrl}/t/o/${token}.png" alt="" width="1" height="1" style="display:block;border:0;width:1px;height:1px" loading="eager">`;
}

// Wrap an email message (text and/or html) with tracking. Returns the
// shape consumers can pass straight into mail.send().
export function trackEmail({ baseUrl, mailLogId, recipient, text, html, subject, from, replyTo, headers, to }) {
  const ctx = { baseUrl, mailLogId, recipient };
  const trackedText = rewriteText(text, ctx);

  // If the caller sent an HTML body, decorate it; otherwise build a
  // minimal HTML wrapper from the text so the pixel has somewhere to
  // live (clients that prefer HTML get tracked; clients that prefer
  // text get tracked links).
  let trackedHtml;
  if (html) {
    trackedHtml = rewriteHtml(html, ctx) + pixelHtml(ctx);
  } else if (text) {
    const escaped = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Make text URLs clickable in the HTML alt by linking them, and
    // also rewrite them through the tracker.
    const linkified = escaped.replace(URL_RE, (m) => {
      const tracked = rewriteUrl({ ...ctx, rawUrl: m });
      return `<a href="${tracked}" style="color:#0e3320">${m}</a>`;
    });
    trackedHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap;line-height:1.45">${linkified}</div>${pixelHtml(ctx)}`;
  }

  return { to, subject, from, replyTo, headers, text: trackedText, html: trackedHtml };
}

// Rewrite URLs in an SMS body. SMS has no pixel, so click-tracking is
// the only signal.
export function trackSmsBody({ baseUrl, mailLogId, recipient, body }) {
  return rewriteText(body, { baseUrl, mailLogId, recipient });
}
