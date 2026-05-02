// Public-site announcement banner.
//
// Renders a pinned, non-expired Announcement as a banner at the top of
// every public page on an org's subdomain. Implemented as response-
// shim middleware so it doesn't require touching every render function.
//
// Member visibility: only the most recent pinned announcement is
// surfaced (a unit shouldn't have two competing banners). Expired
// pins are filtered out automatically — leader picks an expiresAt and
// the banner self-retires.

import { prisma } from "./db.js";

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

async function resolveBanner(orgId) {
  const now = new Date();
  return prisma.announcement.findFirst({
    where: {
      orgId,
      pinned: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, body: true },
  });
}

function bannerHtml(announcement) {
  if (!announcement) return "";
  const previewBody = announcement.body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
  return `<aside class="site-banner" role="status" style="background:linear-gradient(135deg,var(--primary,#0f172a),var(--accent,#1d4ed8));color:#fff;padding:.65rem 1rem;text-align:center;font-size:.92rem;border-bottom:1.5px solid #0f172a">
  <strong style="font-weight:700">${escapeHtml(announcement.title)}</strong>
  ${previewBody ? `<span style="opacity:.92;margin-left:.5rem">${escapeHtml(previewBody)}</span>` : ""}
</aside>`;
}

/**
 * Express middleware. Mount on org-subdomain routes. Wraps res.send so
 * any HTML response on this org gets the banner injected just inside
 * the body. Non-HTML responses pass through untouched.
 */
export function attachAnnouncementBanner() {
  return async function announcementBannerMiddleware(req, res, next) {
    if (!req.org?.id) return next();
    let banner;
    try {
      banner = await resolveBanner(req.org.id);
    } catch {
      // Best effort — never block a page render on the banner lookup.
      return next();
    }
    if (!banner) return next();
    const html = bannerHtml(banner);
    const origSend = res.send.bind(res);
    res.send = function (body) {
      if (typeof body === "string" && (res.get("Content-Type") || "").includes("text/html")) {
        // Inject right after <body ...>.
        body = body.replace(/<body([^>]*)>/i, (m) => `${m}${html}`);
      }
      return origSend(body);
    };
    next();
  };
}
