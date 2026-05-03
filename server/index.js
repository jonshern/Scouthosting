import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import { prisma } from "../lib/db.js";
import {
  lucia,
  attachSession,
  hashPassword,
  verifyPassword,
  roleInOrg,
  isPrivilegedUser,
  passwordLoginAllowedForRole,
} from "../lib/auth.js";
import { originAuth } from "../lib/originAuth.js";
import { csrfMiddleware, csrfProtect, csrfHtmlInjector } from "../lib/csrf.js";
import { rateLimit } from "../lib/rateLimit.js";
import { securityHeaders } from "../lib/securityHeaders.js";
import { honeypotFields, verifyHoneypot } from "../lib/honeypot.js";
import { apiRouter } from "./api.js";
import { superAdminRouter } from "./superAdmin.js";
import { logger } from "../lib/log.js";
import { track, EVENTS } from "../lib/analytics.js";
import { marketingTag, firstPartyTag } from "../lib/analyticsTag.js";
import { supportWidget } from "../lib/supportWidget.js";
import { marketingWidget } from "../lib/marketingWidget.js";

const log = logger.child("http");
import { issueToken } from "../lib/apiToken.js";
import { verifyResendSignature, normalizeResendEvent } from "../lib/resendWebhook.js";
import { verifyStripeSignature, syncFromStripeEvent } from "../lib/stripe.js";

// Buckets: tight on auth surfaces (login/signup are the brute-force
// targets), looser on /api/provision since legitimate provisioning is
// rare anyway. The factory honours DISABLE_RATE_LIMIT=1 so integration
// tests can stay deterministic without preconfiguring a fixture window.
const loginLimiter = rateLimit({ name: "login", limit: 10, windowMs: 15 * 60_000 });
const signupLimiter = rateLimit({ name: "signup", limit: 5, windowMs: 60 * 60_000 });
const provisionLimiter = rateLimit({ name: "provision", limit: 5, windowMs: 60 * 60_000 });
import {
  provisionOrg,
  validateProvisionInput,
} from "./provision.js";
import {
  renderSite,
  renderEventDetail,
  renderEventsList,
  renderCalendarMonth,
  renderDirectory,
  renderPostsList,
  renderPostDetail,
  renderTripPlan,
  renderForms,
  renderSurvey,
  renderSurveyAck,
  renderEagleList,
  renderCohProgram,
  renderMbcList,
  renderReimburseForm,
  renderVideoGallery,
  renderNewsletterArchive,
  renderNewsletterPage,
  renderChatPage,
} from "./render.js";
import { adminRouter } from "./admin.js";
import * as storage from "../lib/storage.js";
import { googleOAuth, googleConfigured, fetchGoogleProfile, appleOAuth, appleConfigured, decodeAppleIdToken } from "../lib/oauth.js";
import { generateState, generateCodeVerifier } from "arctic";
import { icsFor, icsForOrg, expandOccurrences } from "../lib/calendar.js";
import { verifyRsvpToken } from "../lib/rsvpToken.js";
import { verifyTrackingToken } from "../lib/trackingToken.js";
import { verifyUnsubToken } from "../lib/unsubToken.js";
import { makeSignedToken, verifySignedToken } from "../lib/signedToken.js";
import {
  buildEnrollmentArtifacts,
  verifyTotp,
  mintBackupCodes,
  verifyBackupCode,
  mintPreMfaToken,
  verifyPreMfaToken,
} from "../lib/mfa.js";
import { send as sendMail } from "../lib/mail.js";
import { recordAudit } from "../lib/audit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ */
/* Hostname → org slug                                                 */
/* ------------------------------------------------------------------ */

const APEX_HOSTS = new Set([
  (process.env.APEX_DOMAIN || "compass.app").toLowerCase(),
  `www.${process.env.APEX_DOMAIN || "compass.app"}`.toLowerCase(),
  "compass.local",
  "localhost",
]);

function slugFromHost(host) {
  if (!host) return null;
  const bare = host.split(":")[0].toLowerCase();
  if (APEX_HOSTS.has(bare)) return null;
  const parts = bare.split(".");
  if (parts.length < 2) return null;
  const candidate = parts[0];
  if (!candidate || candidate === "www") return null;
  return candidate;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const app = express();
// Trust the first hop (Cloudflare / GCP load balancer). Without this,
// req.ip is the upstream proxy and rate-limit buckets collapse onto one IP.
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);

// Liveness probe for load balancers / orchestrators. Cheap, no DB
// touch (so a Postgres outage doesn't blackhole the whole node).
app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok");
});

// Readiness probe — confirms we can talk to Postgres. Use this for
// deploy gates; failing readiness sheds traffic without restarting.
app.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.type("text/plain").send("ready");
  } catch (err) {
    log.error("readiness probe failed", { err });
    res.status(503).type("text/plain").send("not ready");
  }
});
app.use(originAuth);
// Request logging: one line per response with method, path, status, ms.
// Skips static asset and health-check noise. Each request gets a short
// requestId so downstream log lines can be stitched together.
app.use((req, res, next) => {
  const t0 = Date.now();
  const requestId = crypto.randomBytes(6).toString("base64url");
  req.log = log.with({ requestId, orgSlug: req.org?.slug });
  res.on("finish", () => {
    if (req.path.startsWith("/uploads") || req.path === "/healthz") return;
    const ms = Date.now() - t0;
    const fields = { method: req.method, path: req.path, status: res.statusCode, ms };
    if (res.statusCode >= 500) req.log.error("request", fields);
    else if (res.statusCode >= 400) req.log.warn("request", fields);
    else req.log.info("request", fields);
  });
  next();
});
// Raw body is captured on req.rawBody so signed-webhook handlers
// (e.g. /api/webhooks/resend) can verify the HMAC over the exact
// bytes the provider sent, rather than re-serializing req.body.
app.use(express.json({
  verify: (req, _res, buf) => {
    if (buf && buf.length) req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(attachSession);
app.use(csrfMiddleware);
app.use(csrfHtmlInjector);

// Resolve req.org from Host header (or custom domain).
app.use(async (req, _res, next) => {
  const slug = slugFromHost(req.headers.host);
  const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
  req.slugFromHost = slug;
  if (!slug) {
    // Apex / www — also check custom-domain match.
    req.org = await prisma.org.findUnique({ where: { customDomain: host } }).catch(() => null);
    return next();
  }
  req.org = await prisma.org.findUnique({ where: { slug } });
  next();
});

/* ------------------ SEO (robots.txt + sitemap.xml) --------------- */

import { buildSitemap, robotsTxt } from "../lib/seo.js";

const APEX_DOMAIN = process.env.APEX_DOMAIN || "compass.app";

// robots.txt — apex allows all, points at sitemap. Org subdomains
// disallow /admin + /login (cosmetic; those paths are auth-gated
// server-side).
app.get("/robots.txt", (req, res) => {
  const isOrg = !!req.org;
  const proto = req.protocol;
  const host = req.hostname;
  const sitemapUrl = `${proto}://${host}/sitemap.xml`;
  const body = robotsTxt(
    isOrg
      ? { disallow: ["/admin", "/login", "/api/"], sitemapUrl }
      : { sitemapUrl },
  );
  res.type("text/plain").send(body);
});

// sitemap.xml — apex lists marketing pages; org subdomains list the
// homepage + recent published events + albums.
app.get("/sitemap.xml", async (req, res) => {
  const proto = req.protocol;
  const host = req.hostname;
  const base = `${proto}://${host}`;
  let entries;
  if (!req.org) {
    entries = [
      { loc: `${base}/`, changefreq: "weekly", priority: 1 },
      { loc: `${base}/security.html`, changefreq: "monthly", priority: 0.6 },
      { loc: `${base}/signup.html`, changefreq: "monthly", priority: 0.7 },
      { loc: `${base}/login.html`, changefreq: "monthly", priority: 0.5 },
    ];
  } else {
    const now = new Date();
    const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const [events, albums] = await Promise.all([
      prisma.event.findMany({
        where: { orgId: req.org.id, startsAt: { gte: since } },
        orderBy: { startsAt: "asc" },
        select: { id: true, updatedAt: true },
        take: 200,
      }),
      prisma.album.findMany({
        where: { orgId: req.org.id, visibility: "public" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, updatedAt: true },
        take: 100,
      }),
    ]);
    entries = [
      { loc: `${base}/`, changefreq: "weekly", priority: 1 },
      { loc: `${base}/events`, changefreq: "weekly", priority: 0.8 },
      { loc: `${base}/photos`, changefreq: "weekly", priority: 0.7 },
      ...events.map((e) => ({
        loc: `${base}/events/${e.id}`,
        lastmod: e.updatedAt,
        changefreq: "weekly",
        priority: 0.7,
      })),
      ...albums.map((a) => ({
        loc: `${base}/photos/${a.id}`,
        lastmod: a.updatedAt,
        changefreq: "monthly",
        priority: 0.5,
      })),
    ];
  }
  res.type("application/xml").send(buildSitemap(entries));
});

// Pinned announcement banner — mounts only when an org is resolved.
// Wraps res.send so any HTML response gets the banner injected just
// inside <body>. Non-HTML and apex responses pass through untouched.
import { attachAnnouncementBanner } from "../lib/announcementBanner.js";
app.use(attachAnnouncementBanner());

/* ------------------ Telemetry / analytics injection ---------------- */
//
// Every HTML response gets:
//   - Plausible (apex only, only when ANALYTICS_PROVIDER=plausible)
//     injected into <head>
//   - First-party beacon (everywhere) injected before </body>
//   - Floating support widget (everywhere) injected before </body>
//
// All three are inert when their HTML markers aren't present, so a
// fragment response (e.g. an HTMX partial) doesn't get a malformed
// <script> stub.

app.use(function attachTelemetry(req, res, next) {
  // Skip non-HTML routes and the telemetry endpoint itself.
  if (req.path === "/__telemetry") return next();
  const surface = req.org ? "tenant"
    : req.path.startsWith("/admin") ? "admin"
    : "marketing";

  const origSend = res.send.bind(res);
  res.send = function (body) {
    if (typeof body === "string" && (res.get("Content-Type") || "").includes("text/html")) {
      const beacon = firstPartyTag({ surface });
      // Marketing visitors get the lighter chat-style sales widget;
      // tenants and admins get the full support widget (bug / billing
      // / feature-request / abuse). Different audiences, different
      // shapes — see lib/marketingWidget.js for the rationale.
      const csrf = typeof req.csrfToken === "function" ? req.csrfToken() : (req.csrfToken || "");
      const widget = surface === "marketing"
        ? marketingWidget({ csrfToken: csrf })
        : supportWidget({
            surface,
            csrfToken: csrf,
            user: req.user ? { email: req.user.email, displayName: req.user.displayName } : null,
          });
      // Plausible is apex-only and opt-in. We splice into <head>; the
      // others go just before </body> so they don't block first paint.
      if (surface === "marketing") {
        const tag = marketingTag();
        if (tag && /<\/head>/i.test(body)) body = body.replace(/<\/head>/i, tag + "</head>");
      }
      if (/<\/body>/i.test(body)) {
        body = body.replace(/<\/body>/i, beacon + widget + "</body>");
      }
    }
    return origSend(body);
  };
  next();
});

/* ------------------ /__telemetry — first-party beacon -------------- */
//
// Public endpoint (no Bearer required): the beacon fires from the
// browser on apex marketing pages where the visitor is unauthenticated.
// When the caller IS authenticated (cookie session for tenant /
// admin), we attribute the event to the user + org; otherwise we just
// record the surface dimension. Either way, we don't store IPs or UAs
// at the column level — the UA goes into the JSON payload only on
// `client-error` events so the operator can repro browser bugs.
//
// Whitelisted event names are reused from EVENTS so a typo on the
// client doesn't pollute the AuditLog with unknown actions.

const TELEMETRY_EVENT_MAP = {
  "page-view": EVENTS.PAGE_VIEW,
  "element-clicked": EVENTS.ELEMENT_CLICKED,
  "client-error": EVENTS.CLIENT_ERROR,
  "fetch-failed": EVENTS.FETCH_FAILED,
};

app.post("/__telemetry", express.json({ limit: "8kb" }), async (req, res) => {
  // Always 204 — best-effort, never block the page on telemetry.
  res.status(204).end();
  try {
    const body = req.body || {};
    const event = TELEMETRY_EVENT_MAP[String(body.event || "")];
    if (!event) return;
    const surface = String(body.surface || "marketing").slice(0, 16);
    const path = String(body.path || "").slice(0, 240);
    const dims = { surface, path };
    // Carry through the small set of known dimensions per event type.
    if (typeof body.label === "string") dims.label = body.label.slice(0, 120);
    if (typeof body.status === "number") dims.status = body.status;
    if (typeof body.url === "string") dims.url = body.url.slice(0, 240);
    if (event === EVENTS.CLIENT_ERROR) {
      if (typeof body.kind === "string") dims.kind = body.kind.slice(0, 32);
      if (typeof body.message === "string") dims.message = body.message.slice(0, 240);
      if (typeof body.source === "string") dims.source = body.source.slice(0, 240);
      if (typeof body.line === "number") dims.line = body.line;
      if (typeof body.col === "number") dims.col = body.col;
      if (typeof body.stack === "string") dims.stack = body.stack.slice(0, 800);
      if (typeof body.ua === "string") dims.ua = body.ua.slice(0, 200);
    }
    await track(event, {
      orgId: req.org?.id || null,
      userId: req.user?.id || null,
      dimensions: dims,
    });
  } catch (e) {
    log.warn("telemetry endpoint failed", { err: e });
  }
});

/* ------------------ Marketing site (apex / www) ------------------- */
//
// HTML files go through res.send so the telemetry/widget injector
// upstairs catches them. Non-HTML assets (CSS, JS, images, fonts)
// fall through to express.static which streams them via res.sendFile
// — much cheaper than buffering through res.send.

const STATIC_FALLTHROUGH = express.static(ROOT, { extensions: ["html"], index: "index.html" });

app.use((req, res, next) => {
  if (req.slugFromHost || req.org) return next();

  // Resolve the candidate HTML path the same way express.static would,
  // then read+send if it's HTML. Path safety: only accept GETs whose
  // path resolves cleanly under ROOT (no traversal).
  if (req.method !== "GET" && req.method !== "HEAD") return STATIC_FALLTHROUGH(req, res, next);
  let p = decodeURIComponent(req.path || "/");
  if (p.endsWith("/")) p += "index.html";
  if (!p.endsWith(".html")) {
    // Try with .html extension (matches express.static `extensions: ["html"]`).
    const withExt = p + ".html";
    const candidate = path.join(ROOT, withExt);
    if (candidate.startsWith(ROOT) && fs.existsSync(candidate)) {
      p = withExt;
    } else {
      return STATIC_FALLTHROUGH(req, res, next);
    }
  }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    return STATIC_FALLTHROUGH(req, res, next);
  }
  let html;
  try {
    html = fs.readFileSync(file, "utf8");
  } catch {
    return STATIC_FALLTHROUGH(req, res, next);
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

/* ------------------ JSON API (mobile + external) ------------------ */

app.use("/api/v1", apiRouter);

// Super-admin console — apex-only. The router itself enforces the
// User.isSuperAdmin gate; mounting it here just scopes the URL prefix.
app.use("/__super", (req, res, next) => {
  if (req.org) return next();
  return superAdminRouter(req, res, next);
});

// Apex-only org chooser. After a fresh apex login, a user holding admin
// in 2+ orgs lands here (postLoginRedirect picks /choose-org). Each row
// links to that org's /auth/handoff so the click crosses subdomains
// with a short-lived token rather than a shared cookie.
app.get("/choose-org", async (req, res, next) => {
  if (req.org) return next();
  if (!req.user) return res.redirect(`/login.html?next=${encodeURIComponent("/choose-org")}`);
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: req.user.id, role: "admin" },
    select: { org: { select: { slug: true, displayName: true, unitType: true, unitNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) {
    return res.redirect("/signup.html");
  }
  if (memberships.length === 1) {
    const url = handoffUrlForUser(req, req.user.id, memberships[0].org.slug, "/admin");
    return res.redirect(url);
  }
  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const rows = memberships
    .map((m) => {
      const url = handoffUrlForUser(req, req.user.id, m.org.slug, "/admin");
      return `<li><a class="org" href="${escape(url)}">
        <span class="org__name">${escape(m.org.displayName)}</span>
        <span class="org__meta">${escape(m.org.unitType)} ${escape(m.org.unitNumber)} · ${escape(m.org.slug)}</span>
      </a></li>`;
    })
    .join("");
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Choose your unit — Compass</title>
<link rel="stylesheet" href="/tokens.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.shell{max-width:520px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:2.25rem 2rem 2rem;box-shadow:var(--shadow-card)}
.eyebrow{font-size:11px;color:var(--ink-muted);letter-spacing:.14em;text-transform:uppercase;font-weight:600;margin-bottom:.5rem}
h1{font-family:var(--font-display);font-weight:400;font-size:32px;line-height:1.1;letter-spacing:-.02em;margin:0 0 .5rem}
.lede{color:var(--ink-soft);margin:0 0 1.5rem;font-size:15px}
ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:.6rem}
.org{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;text-decoration:none;color:inherit;transition:border-color .12s,background .12s}
.org:hover{border-color:var(--ink);background:var(--bg)}
.org__name{font-weight:600;font-size:16px;color:var(--ink)}
.org__meta{font-size:12.5px;color:var(--ink-muted)}
.fine{margin-top:1.25rem;font-size:13px;color:var(--ink-muted);text-align:center}
.fine a{color:var(--ink);font-weight:500}
</style></head><body>
<div class="shell">
<div class="eyebrow">§ Choose your unit</div>
<h1>You're in more than one unit.</h1>
<p class="lede">Pick which one you'd like to open.</p>
<ul>${rows}</ul>
<p class="fine">Wrong account? <a href="/api/auth/logout" data-method="post">Sign out</a></p>
</div>
</body></html>`);
});

// Invite acceptance. The link in the invitation email lands here on
// the org subdomain. We verify the signed token, find or create the
// User account, attach an OrgMembership at the embedded role, and
// redirect into the admin (or the public site for parent/scout roles).
app.get("/invite/:token", async (req, res) => {
  if (!req.org) return res.status(404).type("text/plain").send("Wrong host for this invite");
  const { verifyInviteToken, inviteSecret } = await import("../lib/inviteToken.js");
  const claims = verifyInviteToken(req.params.token, { secret: inviteSecret() });
  if (!claims) {
    return res.status(400).type("html").send(inviteErrorPage(req.org, "This invite link is invalid or has expired."));
  }
  if (claims.orgId !== req.org.id) {
    return res.status(400).type("html").send(inviteErrorPage(req.org, "This invite is for a different unit."));
  }
  if (req.user) {
    if (req.user.email.toLowerCase() !== claims.email) {
      return res.status(400).type("html").send(inviteErrorPage(req.org, `This invite was sent to ${claims.email}. You're signed in as ${req.user.email} — sign out first, then click the link again.`));
    }
    await prisma.orgMembership.upsert({
      where: { userId_orgId: { userId: req.user.id, orgId: req.org.id } },
      update: {},
      create: { userId: req.user.id, orgId: req.org.id, role: claims.role },
    });
    return res.redirect(claims.role === "scout" || claims.role === "parent" ? "/" : "/admin");
  }
  // Not signed in — render an "accept invite" page that pre-fills email
  // and offers Google SSO + password set.
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accept invite — ${escape(req.org.displayName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f8fa;--surface:#fff;--ink:#0f172a;--ink-muted:#64748b;--line:#e2e8f0;--primary:#0f172a;--accent:#1d4ed8;--font-display:"Newsreader",serif;--font-ui:"Inter Tight",sans-serif}
body{margin:0;font-family:var(--font-ui);background:var(--bg);color:var(--ink);min-height:100vh;display:grid;place-items:center;padding:1rem}
main{max-width:440px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:2.25rem 2rem}
h1{font-family:var(--font-display);font-weight:400;letter-spacing:-.02em;margin:0 0 .4rem;font-size:30px}
h1 em{font-style:italic;color:var(--primary)}
p{color:var(--ink-muted)}
label{display:block;margin:1rem 0 0;font-size:.86rem}
input{display:block;width:100%;margin-top:.3rem;padding:.6rem .75rem;border:1.5px solid var(--line);border-radius:8px;font:inherit;background:#fff;color:var(--ink)}
.btn{display:flex;align-items:center;justify-content:center;width:100%;margin-top:1.2rem;padding:.7rem;border-radius:8px;border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-weight:600;cursor:pointer;text-decoration:none}
.btn:hover{background:var(--primary);color:var(--accent);border-color:var(--primary)}
.btn-google{background:#fff;color:var(--ink);border-color:var(--line)}
.divider{display:flex;align-items:center;gap:.75rem;color:var(--ink-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;font-weight:600;margin:1.2rem 0}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--line)}
</style></head><body>
<main>
  <h1>Welcome to <em>${escape(req.org.displayName)}.</em></h1>
  <p>You're being invited as <strong>${escape(claims.role)}</strong>. Create a Compass account (or sign in if you already have one) and you'll land in the unit.</p>
  <form method="post" action="/invite/${escape(req.params.token)}">
    ${req.csrfToken ? `<input type="hidden" name="csrf" value="${req.csrfToken}">` : ""}
    <label>Your name<input name="displayName" required></label>
    <label>Email<input name="email" type="email" value="${escape(claims.email)}" readonly style="background:#f7f8fa"></label>
    <label>Choose a password<input name="password" type="password" required minlength="8"></label>
    <button class="btn" type="submit">Accept invite & create account</button>
  </form>
  <div class="divider">or</div>
  <a class="btn btn-google" href="/auth/google/start?next=${encodeURIComponent(`/invite/${req.params.token}`)}">Continue with Google</a>
  <p style="font-size:.78rem;margin-top:1rem">By accepting, you agree to <a href="/security.html">Compass's privacy + security model</a>.</p>
</main></body></html>`);
});

app.post("/invite/:token", async (req, res) => {
  if (!req.org) return res.status(404).type("text/plain").send("Wrong host");
  const { verifyInviteToken, inviteSecret } = await import("../lib/inviteToken.js");
  const claims = verifyInviteToken(req.params.token, { secret: inviteSecret() });
  if (!claims) return res.status(400).type("text/plain").send("Invalid or expired invite");
  if (claims.orgId !== req.org.id) return res.status(400).type("text/plain").send("Wrong org");
  const password = String(req.body?.password || "");
  const displayName = String(req.body?.displayName || "").trim();
  if (!password || password.length < 8 || !displayName) {
    return res.status(400).type("text/plain").send("Display name + 8+ char password required");
  }
  const existing = await prisma.user.findUnique({ where: { email: claims.email } });
  let user;
  if (existing) {
    user = existing;
  } else {
    user = await prisma.user.create({
      data: {
        email: claims.email,
        displayName,
        passwordHash: await hashPassword(password),
        emailVerified: true, // proven by clicking the signed link
      },
    });
  }
  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: req.org.id } },
    update: {},
    create: { userId: user.id, orgId: req.org.id, role: claims.role },
  });
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect(claims.role === "scout" || claims.role === "parent" ? "/" : "/admin");
});

function inviteErrorPage(org, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invite — ${escape(org.displayName)}</title>
<style>body{font-family:"Inter Tight",sans-serif;background:#f7f8fa;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}main{max-width:480px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:2rem;text-align:center}h1{font-family:"Newsreader",serif;font-weight:400;letter-spacing:-.02em}a{color:#0f172a}</style>
</head><body><main><h1>Hmm.</h1><p>${escape(message)}</p><p><a href="/">← Back to ${escape(org.displayName)}</a></p></main></body></html>`;
}

// In-app support form. Available on apex (anonymous can ask billing /
// signup questions) and on every org subdomain (leaders + members can
// flag bugs). Files a SupportTicket the super-admin sees in /__super.
app.get("/help", (req, res) => {
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const orgName = req.org ? req.org.displayName : "Compass";
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Help — ${orgName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f8fa;--surface:#fff;--ink:#0f172a;--ink-muted:#64748b;--line:#e2e8f0;--primary:#0f172a;--accent:#1d4ed8;--font-display:"Newsreader",serif;--font-ui:"Inter Tight",sans-serif}
body{margin:0;font-family:var(--font-ui);background:var(--bg);color:var(--ink);min-height:100vh;padding:2rem 1rem}
main{max-width:560px;margin:0 auto;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:2rem}
h1{font-family:var(--font-display);font-weight:400;letter-spacing:-.02em;margin:0 0 .4rem}
p{color:var(--ink-muted)}
label{display:block;margin:0 0 .8rem;font-size:.86rem;color:var(--ink)}
input,textarea,select{display:block;width:100%;margin-top:.3rem;padding:.55rem .7rem;border:1.5px solid var(--line);border-radius:8px;font:inherit;background:#fff;color:var(--ink)}
textarea{min-height:8rem;font-family:var(--font-ui)}
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.65rem 1.1rem;border-radius:8px;border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-weight:600;cursor:pointer;text-decoration:none}
.btn:hover{background:var(--primary);color:var(--accent);border-color:var(--primary)}
.muted{color:var(--ink-muted);font-size:.84rem}
</style></head><body>
<main>
  <h1>How can we help?</h1>
  <p>Submit a request and a Compass operator will reply by email. ${req.org ? `You're on <strong>${orgName}</strong>'s site; if you need a leader of this unit, contact them at <a href="mailto:${req.org.scoutmasterEmail}">${req.org.scoutmasterEmail}</a> instead.` : `For a question about a specific troop, visit that troop's site and use the help button there.`}</p>
  <form method="post" action="/help">
    ${req.csrfToken ? `<input type="hidden" name="csrf" value="${req.csrfToken}">` : ""}
    <label>Your email<input name="email" type="email" required value="${req.user?.email || ""}"></label>
    <label>Your name<input name="name" type="text" value="${req.user?.displayName || ""}"></label>
    <label>Category
      <select name="category">
        <option value="question">Question</option>
        <option value="bug">Something is broken</option>
        <option value="billing">Billing</option>
        <option value="abuse">Abuse / safety</option>
        <option value="feature">Feature request</option>
        <option value="other">Other</option>
      </select>
    </label>
    <label>Subject<input name="subject" required maxlength="200"></label>
    <label>What's going on?<textarea name="body" required maxlength="5000"></textarea></label>
    <button class="btn" type="submit">Send</button>
    <p class="muted" style="margin-top:1rem">We'll reply within one business day. For urgent youth-safety concerns, contact your council directly.</p>
  </form>
</main></body></html>`);
});

// Multer for the screenshot attachment on bug-category support
// tickets. Single PNG, ≤4 MB (a full-viewport screenshot at 2x DPR
// runs ~1-2 MB; 4 MB leaves headroom). Other categories don't ship
// a file; multer's any() tolerates that.
const supportUpload = multer({
  dest: process.env.UPLOAD_TMP || "/tmp/compass-uploads",
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
});

app.post("/help", supportUpload.single("screenshot"), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!email || !subject || !body) {
    return res.status(400).type("text/plain").send("email, subject, and message are required");
  }
  // Persist the screenshot if one came through. Saved to org-scoped
  // storage when we have an org; apex tickets share the marketing
  // bucket. Best-effort — a storage failure shouldn't block the
  // ticket itself; we just drop the screenshot.
  let screenshotFilename = null;
  let screenshotMimeType = null;
  if (req.file && req.body?.category === "bug") {
    try {
      const fs = await import("node:fs/promises");
      const buf = await fs.readFile(req.file.path);
      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/jpeg" ? "jpg" : null;
      if (ext) {
        screenshotFilename = `support-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
        await storage.save(req.org?.id || "_apex", screenshotFilename, buf);
        screenshotMimeType = req.file.mimetype;
      }
      await fs.unlink(req.file.path).catch(() => {});
    } catch (err) {
      log.warn("support screenshot persist failed", { err: err && err.message });
    }
  }
  const viewportPath = String(req.body?._path || "").slice(0, 500) || null;
  const viewportWidth = Number(req.body?.viewportWidth) || null;
  const viewportHeight = Number(req.body?.viewportHeight) || null;
  const ticket = await prisma.supportTicket.create({
    data: {
      orgId: req.org?.id || null,
      userId: req.user?.id || null,
      fromEmail: email,
      fromName: String(req.body?.name || "").trim() || null,
      category: String(req.body?.category || "question"),
      subject: subject.slice(0, 200),
      body: body.slice(0, 5000),
      priority: req.body?.category === "abuse" ? "urgent" : "normal",
      screenshotFilename,
      screenshotMimeType,
      viewportPath,
      viewportWidth: Number.isFinite(viewportWidth) ? viewportWidth : null,
      viewportHeight: Number.isFinite(viewportHeight) ? viewportHeight : null,
    },
  });
  log.info("support ticket filed", { id: ticket.id, orgSlug: req.org?.slug, category: ticket.category });
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thanks — Compass</title>
<style>body{font-family:"Inter Tight",sans-serif;background:#f7f8fa;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}main{max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:2rem;text-align:center}h1{font-family:"Newsreader",serif;font-weight:400;letter-spacing:-.02em}a{color:#0f172a}</style>
</head><body>
<main>
  <h1>We got it.</h1>
  <p>A Compass operator will reply to <strong>${escape(email)}</strong> within one business day.</p>
  <p style="color:#64748b;font-size:.86rem">Reference: <code>${escape(ticket.id)}</code></p>
  <p><a href="/">← back to ${escape(req.org?.displayName || "Compass")}</a></p>
</main></body></html>`);
});

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ------------------ Mail provider webhooks ----------------------- */

// POST /api/webhooks/resend — Svix-signed event from Resend. Bounces
// and complaints flip Member.bouncedAt + Member.emailUnsubscribed so
// audienceFor stops including the address in future broadcasts.
//
// We respond 200 even on no-op events (delivered / opened / clicked) so
// Resend doesn't retry; we 401 on missing/bad signature so a misconfig
// surfaces in their delivery dashboard.
app.post("/api/webhooks/resend", async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // No secret = webhooks aren't configured for this deployment.
    // Refuse anything that arrives so a stale URL can't muck with state.
    return res.status(503).json({ error: "webhook_not_configured" });
  }
  const v = verifyResendSignature(req.headers, req.rawBody || JSON.stringify(req.body || {}), secret);
  if (!v.ok) return res.status(401).json({ error: "bad_signature", reason: v.reason });

  const event = normalizeResendEvent(req.body);
  if (!event.kind || !event.email) {
    // Delivered / sent / opened / clicked — just ack so Resend stops retrying.
    return res.json({ ok: true, ignored: true });
  }

  // Find every Member across every org with this email; mark them all.
  // (One household can have the same email recorded on multiple Member
  // rows — parents who admin two units.)
  const updated = await prisma.member.updateMany({
    where: { email: event.email },
    data: {
      bouncedAt: new Date(),
      bounceReason: event.reason,
      emailUnsubscribed: true,
      unsubscribedAt: new Date(),
    },
  });

  res.json({ ok: true, kind: event.kind, email: event.email, affected: updated.count });
});

// POST /api/webhooks/stripe — subscription state sync. Signature verified
// over the raw request body (captured on req.rawBody by the json middleware
// above). All work happens in lib/stripe.js#syncFromStripeEvent so this
// handler stays a thin transport layer.
//
// Always responds 200 to handled and ignored event types; only signature
// failure → 401 (so Stripe surfaces the misconfig in their dashboard).
app.post("/api/webhooks/stripe", async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "webhook_not_configured" });

  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const sig = req.headers["stripe-signature"];
  const v = verifyStripeSignature(rawBody, sig, secret);
  if (!v.ok) {
    log.warn({ reason: v.reason }, "stripe webhook signature failed");
    return res.status(401).json({ error: "bad_signature", reason: v.reason });
  }

  try {
    const result = await syncFromStripeEvent(req.body);
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err: err.message, type: req.body?.type }, "stripe webhook handler errored");
    // 500 → Stripe will retry. That's the correct behaviour for a
    // transient DB blip; if it's a persistent bug we'll see it in
    // the audit log.
    return res.status(500).json({ error: "handler_error" });
  }
});

/* ------------------ Provisioning API ------------------------------ */

app.post("/api/provision", provisionLimiter, async (req, res) => {
  const errors = validateProvisionInput(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }
  try {
    const org = await provisionOrg(req.body);
    track(EVENTS.ORG_PROVISIONED, {
      orgId: org.id,
      dimensions: { unitType: org.unitType, plan: org.plan },
    });
    res.status(201).json({
      ok: true,
      tenant: {
        slug: org.slug,
        displayName: org.displayName,
        scoutmasterEmail: org.scoutmasterEmail,
      },
      url: `https://${org.slug}.${process.env.APEX_DOMAIN || "compass.app"}`,
      message: `Site provisioned for ${org.displayName}.`,
    });
  } catch (err) {
    res.status(409).json({ ok: false, errors: [err.message] });
  }
});

app.get("/api/orgs", async (_req, res) => {
  const orgs = await prisma.org.findMany({
    orderBy: { createdAt: "asc" },
    select: { slug: true, displayName: true, plan: true, isDemo: true },
  });
  res.json({ ok: true, orgs });
});

/* ------------------ Auth ------------------------------------------ */

app.post("/api/auth/signup", signupLimiter, csrfProtect, async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ ok: false, error: "email, password, displayName required" });
  }
  if (password.length < 12) {
    return res.status(400).json({ ok: false, error: "Password must be at least 12 characters" });
  }
  const lowerEmail = email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (exists) {
    return res.status(409).json({ ok: false, error: "Email already registered" });
  }
  const user = await prisma.user.create({
    data: { email: lowerEmail, displayName, passwordHash: await hashPassword(password) },
  });

  // Auto-grant admin membership for any org where this email is the
  // founding leader. Lets the scoutmaster from the provisioning step claim
  // their site by signing up with the same email.
  const ownedOrgs = await prisma.org.findMany({
    where: { scoutmasterEmail: lowerEmail },
    select: { id: true },
  });
  if (ownedOrgs.length) {
    await prisma.orgMembership.createMany({
      data: ownedOrgs.map((o) => ({ userId: user.id, orgId: o.id, role: "admin" })),
      skipDuplicates: true,
    });
    // Claim workspace ownership for any matching orgs that don't yet
    // have an ownerId. The `ownerId: null` filter makes this idempotent
    // for re-signup attempts and safe against ownership transfers.
    await prisma.org.updateMany({
      where: { id: { in: ownedOrgs.map((o) => o.id) }, ownerId: null },
      data: { ownerId: user.id },
    });
  }

  // Funnel marker — apex/JSON-API signup path. Mirrors the redirect-
  // signup track() call above so /__super/analytics counts the same
  // conversion regardless of which path they came in through.
  track(EVENTS.USER_SIGNED_UP, {
    orgId: ownedOrgs[0]?.id || null,
    userId: user.id,
    dimensions: { surface: "marketing", role: ownedOrgs.length ? "admin" : "parent" },
  });

  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.status(201).json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } });
});

// Helpers for cross-domain login routing.
//
// The apex sets a session cookie that is host-only — Chromium browsers
// reject `Domain=.localhost` in dev, and even on real prod domains a
// host-only cookie is the conservative default. So when we need a
// freshly-authenticated user to end up on an org subdomain (admin
// dashboard, org home), we redirect to <slug>/auth/handoff with a
// short-lived signed token; the subdomain exchanges it for a session
// cookie of its own, then redirects to the intended path.
function buildOrgUrl(req, slug, path) {
  const hostHeader = (req.headers.host || "").toLowerCase();
  const [hostname, portFromHost] = hostHeader.split(":");
  const apex = hostname || (process.env.APEX_DOMAIN || "compass.app").toLowerCase();
  const protocol = req.protocol || (process.env.NODE_ENV === "production" ? "https" : "http");
  const port = portFromHost ? `:${portFromHost}` : "";
  // If the current host *already* resolves to this org (because it
  // matches Org.customDomain, or we're already on the org's subdomain),
  // stay on the current host instead of rebuilding `<slug>.<apex>`.
  // This is what makes single-host staging deploys work without
  // wildcard DNS — the redirect stops at the apex.
  if (req.org && req.org.slug === slug) {
    return `${protocol}://${hostname}${port}${path}`;
  }
  return `${protocol}://${slug}.${apex}${port}${path}`;
}

function makeLoginHandoffToken(userId, next) {
  return makeSignedToken(
    { kind: "login-handoff", uid: userId, next: next || "/" },
    { secret: AUTH_SECRET, ttlSeconds: 60 }
  );
}

function handoffUrlForUser(req, userId, slug, next) {
  const token = makeLoginHandoffToken(userId, next);
  return buildOrgUrl(req, slug, `/auth/handoff?token=${encodeURIComponent(token)}`);
}

// Pick where to send a freshly-signed-in user.
//   - super admin → /__super (apex)
//   - admin in 1 org → that org's /admin via handoff
//   - admin in 2+ orgs → apex /choose-org chooser
//   - parent only → first org home via handoff
//   - no org → /signup.html
async function postLoginRedirect(userId, req) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      memberships: {
        select: { role: true, org: { select: { slug: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!u) return "/";
  if (u.isSuperAdmin) return "/__super";
  const adminMems = u.memberships.filter((m) => m.role === "admin");
  if (adminMems.length === 1) {
    return handoffUrlForUser(req, userId, adminMems[0].org.slug, "/admin");
  }
  if (adminMems.length > 1) {
    return "/choose-org";
  }
  const anyMem = u.memberships[0];
  if (anyMem) {
    return handoffUrlForUser(req, userId, anyMem.org.slug, "/");
  }
  return "/signup.html";
}

app.post("/api/auth/login", loginLimiter, csrfProtect, async (req, res) => {
  const { email, password } = req.body || {};
  const emailLc = (email || "").toString().toLowerCase().trim();
  if (!emailLc || !password) {
    return res.status(400).json({ ok: false, error: "email and password required" });
  }
  const user = await prisma.user.findUnique({ where: { email: emailLc } });
  if (!user || !user.passwordHash) {
    log.warn("login.failed", { email: emailLc, reason: "no-user-or-passwordless", ip: req.ip });
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }
  const privileged = await isPrivilegedUser(user.id);
  if (!passwordLoginAllowedForRole({ privileged })) {
    log.warn("login.blocked", { email: emailLc, reason: "admin-sso-required", ip: req.ip });
    return res.status(403).json({
      ok: false,
      error: "Admin accounts must sign in with Google or Apple.",
      code: "sso_required",
    });
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    log.warn("login.failed", { email: emailLc, userId: user.id, reason: "wrong-password", ip: req.ip });
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  const redirect = await postLoginRedirect(user.id, req);
  res.json({
    ok: true,
    user: { id: user.id, email: user.email, displayName: user.displayName },
    redirect,
  });
});

app.post("/api/auth/logout", csrfProtect, async (req, res) => {
  if (req.session) await lucia.invalidateSession(req.session.id);
  res.appendHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
  res.json({ ok: true });
});

app.get("/api/auth/providers", (_req, res) => {
  res.json({ ok: true, providers: { google: googleConfigured } });
});

/* ------------------------------------------------------------------ */
/* Browser web push (W3C Push API)                                     */
/* ------------------------------------------------------------------ */
//
// Cookie-authed counterparts to /api/v1/push/register so a logged-in
// browser user can subscribe to push without an API token. The mobile
// app keeps using the bearer-token endpoint; web subscriptions live
// here. Both write into the same PushDevice table; sendPushBatch
// fans out by provider on dispatch.

app.get("/push/vapid-key", (_req, res) => {
  const key = vapidPublicKey();
  if (!key) return res.status(503).json({ error: "vapid_unconfigured" });
  res.json({ publicKey: key });
});

app.post("/push/web-subscribe", csrfProtect, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  const sub = req.body?.subscription;
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return res.status(400).json({ error: "invalid_subscription" });
  }
  // Token is the JSON-stringified subscription. PushDevice.token is
  // unique, so re-subscribing from the same browser/endpoint upserts.
  const token = JSON.stringify({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  const deviceLabel = req.body?.deviceLabel
    ? String(req.body.deviceLabel).slice(0, 80)
    : "Browser";
  const device = await prisma.pushDevice.upsert({
    where: { token },
    update: {
      userId: req.user.id,
      provider: "webpush",
      platform: "web",
      deviceLabel,
      retiredAt: null,
      retiredReason: null,
    },
    create: {
      userId: req.user.id,
      token,
      provider: "webpush",
      platform: "web",
      deviceLabel,
    },
  });
  res.status(201).json({ id: device.id });
});

app.post("/push/web-unsubscribe", csrfProtect, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  const endpoint = String(req.body?.endpoint || "");
  if (!endpoint) return res.status(400).json({ error: "endpoint_required" });
  // Find the matching subscription by parsing each row's token. With
  // small per-user device counts this is cheap; scaling beyond that
  // would warrant a separate `endpoint` column.
  const devices = await prisma.pushDevice.findMany({
    where: { userId: req.user.id, provider: "webpush", retiredAt: null },
    select: { id: true, token: true },
  });
  const match = devices.find((d) => {
    try {
      return JSON.parse(d.token).endpoint === endpoint;
    } catch {
      return false;
    }
  });
  if (match) {
    await prisma.pushDevice.update({
      where: { id: match.id },
      data: { retiredAt: new Date(), retiredReason: "user-unsubscribed" },
    });
  }
  res.json({ ok: true });
});

// Static HTML pages can't be touched by csrfHtmlInjector, so JS fetches
// the current CSRF token here before POSTing to /api/auth/login (and
// any other CSRF-protected JSON endpoint they need to talk to).
app.get("/api/csrf", (req, res) => {
  res.json({ ok: true, token: req.csrfToken });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false });
  res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email, displayName: req.user.displayName },
  });
});

/* ------------------ Google OAuth --------------------------------- */

const OAUTH_STATE_COOKIE = "compass_oauth_state";
const OAUTH_VERIFIER_COOKIE = "compass_oauth_verifier";
const OAUTH_NEXT_COOKIE = "compass_oauth_next";

function setShortCookie(res, name, value) {
  res.appendHeader(
    "Set-Cookie",
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

function clearShortCookie(res, name) {
  res.appendHeader("Set-Cookie", `${name}=; Path=/; HttpOnly; Max-Age=0`);
}

function readCookie(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

app.get("/auth/google/start", async (req, res) => {
  if (!googleConfigured) {
    return res
      .status(503)
      .type("html")
      .send(
        `<!doctype html><meta charset="utf-8"><title>Google sign-in not configured</title>
         <body style="font-family:system-ui;max-width:520px;margin:4rem auto;padding:0 1.25rem">
         <h1>Google sign-in isn't configured here.</h1>
         <p>Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,
         and <code>GOOGLE_REDIRECT_URI</code> in your <code>.env</code> and restart.</p>
         <p><a href="/login.html">← Back to sign in</a></p></body>`
      );
  }
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = await googleOAuth.createAuthorizationURL(state, codeVerifier, {
    scopes: ["openid", "profile", "email"],
  });

  setShortCookie(res, OAUTH_STATE_COOKIE, state);
  setShortCookie(res, OAUTH_VERIFIER_COOKIE, codeVerifier);

  // Stash the post-login redirect target if provided. Only same-host paths or
  // recognized Compass hosts are honored at callback time.
  const next = String(req.query.next || "").slice(0, 500);
  if (next) setShortCookie(res, OAUTH_NEXT_COOKIE, encodeURIComponent(next));

  res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  if (!googleConfigured) return res.status(503).send("Google OAuth not configured.");

  const code = req.query.code;
  const stateParam = req.query.state;
  const storedState = readCookie(req, OAUTH_STATE_COOKIE);
  const codeVerifier = readCookie(req, OAUTH_VERIFIER_COOKIE);

  clearShortCookie(res, OAUTH_STATE_COOKIE);
  clearShortCookie(res, OAUTH_VERIFIER_COOKIE);

  if (!code || !stateParam || !storedState || stateParam !== storedState || !codeVerifier) {
    return res.status(400).send("Invalid OAuth state.");
  }

  let tokens;
  try {
    tokens = await googleOAuth.validateAuthorizationCode(code, codeVerifier);
  } catch {
    return res.status(400).send("Token exchange failed.");
  }

  let profile;
  try {
    profile = await fetchGoogleProfile(tokens.accessToken);
  } catch {
    return res.status(502).send("Could not fetch Google profile.");
  }

  if (!profile.email || !profile.email_verified) {
    return res
      .status(400)
      .send("Your Google account doesn't have a verified email — we can't link it.");
  }

  const email = profile.email.toLowerCase();
  const sub = profile.sub;
  const displayName = profile.name || email.split("@")[0];

  // Try to find an existing OAuthAccount; otherwise link by verified email or create.
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: sub } },
    include: { user: true },
  });

  let user;
  if (existing) {
    user = existing.user;
  } else {
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, displayName, emailVerified: true },
      });
      // Same auto-link as password signup: founding leader claims their org.
      const ownedOrgs = await prisma.org.findMany({
        where: { scoutmasterEmail: email },
        select: { id: true },
      });
      if (ownedOrgs.length) {
        await prisma.orgMembership.createMany({
          data: ownedOrgs.map((o) => ({ userId: user.id, orgId: o.id, role: "admin" })),
          skipDuplicates: true,
        });
        await prisma.org.updateMany({
          where: { id: { in: ownedOrgs.map((o) => o.id) }, ownerId: null },
          data: { ownerId: user.id },
        });
      }
    }
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: "google", providerAccountId: sub },
    });
  }

  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());

  // Redirect back to the requested path if same-host; else marketing root.
  const next = readCookie(req, OAUTH_NEXT_COOKIE);
  clearShortCookie(res, OAUTH_NEXT_COOKIE);
  if (next && next.startsWith("/")) return res.redirect(decodeURIComponent(next));
  res.redirect("/");
});

/* ------------------ Apple Sign-in -------------------------------- */

app.get("/auth/apple/start", async (req, res) => {
  if (!appleConfigured) {
    return res.status(503).type("text/plain").send("Apple sign-in is not configured here.");
  }
  const state = generateState();
  setShortCookie(res, OAUTH_STATE_COOKIE, state);
  if (typeof req.query.next === "string" && req.query.next.startsWith("/")) {
    setShortCookie(res, OAUTH_NEXT_COOKIE, encodeURIComponent(req.query.next));
  }
  // Apple doesn't use PKCE for the auth code flow; we still ask for
  // name + email scopes (the user can untick name in Apple's UI).
  const url = await appleOAuth.createAuthorizationURL(state, ["name", "email"]);
  // Apple requires response_mode=form_post when "name" / "email" scopes
  // are requested — the redirect URI gets POSTed instead of GETed.
  url.searchParams.set("response_mode", "form_post");
  res.redirect(url.toString());
});

// Apple uses POST callback when scopes include name/email. The body
// contains: code, state, optionally `user` (a JSON blob with the user's
// name on first sign-in only).
app.post("/auth/apple/callback", async (req, res) => {
  if (!appleConfigured) return res.status(503).send("Apple OAuth not configured.");

  const code = req.body?.code;
  const stateParam = req.body?.state;
  const storedState = readCookie(req, OAUTH_STATE_COOKIE);
  clearShortCookie(res, OAUTH_STATE_COOKIE);

  if (!code || !stateParam || !storedState || stateParam !== storedState) {
    return res.status(400).send("Invalid OAuth state.");
  }

  let tokens;
  try {
    tokens = await appleOAuth.validateAuthorizationCode(code);
  } catch (err) {
    log.warn("Apple token exchange failed", { err });
    return res.status(400).send("Token exchange failed.");
  }

  let claims;
  try {
    claims = decodeAppleIdToken(tokens.idToken);
  } catch (err) {
    log.warn("Apple id_token decode failed", { err });
    return res.status(502).send("Could not read Apple identity.");
  }

  if (!claims.email) {
    // Apple can hide the email behind a relay address; even then we get
    // *some* email. If genuinely missing, bail.
    return res.status(400).send("Apple didn't share a usable email.");
  }

  const email = String(claims.email).toLowerCase();
  const sub = claims.sub;
  // First-sign-in only: Apple posts a `user` JSON blob with name fields.
  let displayName = email.split("@")[0];
  if (req.body?.user) {
    try {
      const u = JSON.parse(req.body.user);
      const first = u?.name?.firstName || "";
      const last = u?.name?.lastName || "";
      const composed = `${first} ${last}`.trim();
      if (composed) displayName = composed;
    } catch {
      // Malformed user blob — fall back to email-derived name.
    }
  }

  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "apple", providerAccountId: sub } },
    include: { user: true },
  });

  let user;
  if (existing) {
    user = existing.user;
  } else {
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, displayName, emailVerified: true },
      });
      const ownedOrgs = await prisma.org.findMany({
        where: { scoutmasterEmail: email },
        select: { id: true },
      });
      if (ownedOrgs.length) {
        await prisma.orgMembership.createMany({
          data: ownedOrgs.map((o) => ({ userId: user.id, orgId: o.id, role: "admin" })),
          skipDuplicates: true,
        });
        await prisma.org.updateMany({
          where: { id: { in: ownedOrgs.map((o) => o.id) }, ownerId: null },
          data: { ownerId: user.id },
        });
      }
    }
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: "apple", providerAccountId: sub },
    });
  }

  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());

  const next = readCookie(req, OAUTH_NEXT_COOKIE);
  clearShortCookie(res, OAUTH_NEXT_COOKIE);
  if (next && next.startsWith("/")) return res.redirect(decodeURIComponent(next));
  res.redirect("/");
});

/* ------------------ Admin (org subdomain only) -------------------- */

app.use("/admin", (req, res, next) => {
  if (!req.org) return res.status(404).send("Site not found");
  next();
});
// CSRF guard for any /admin state-changing request. csrfProtect is a
// no-op on GET, so it sits cleanly in front of every admin route.
app.use("/admin", csrfProtect);
app.use("/admin", adminRouter);

function rsvpAck(org, { ok, message, eventId }) {
  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const back = eventId ? `<p style="margin-top:1rem"><a href="/events/${escape(eventId)}">View event details →</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? "Thanks!" : "RSVP error"} — ${escape(org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>
body{display:grid;place-items:center;min-height:100vh;padding:2rem;background:var(--bg);color:var(--ink);font-family:var(--font-ui);margin:0}
.card{max-width:480px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:2rem;text-align:center;box-shadow:var(--shadow-card)}
.card h1{font-family:var(--font-display);font-weight:400;font-size:1.6rem;margin-top:0;color:${ok ? "var(--success)" : "#7d2614"}}
.card p{color:var(--ink-soft)}
.card a{color:var(--accent);text-decoration:none}
.card a:hover{text-decoration:underline}
</style>
</head><body>
<div class="card">
<h1>${ok ? "Thanks!" : "We couldn't record your RSVP"}</h1>
<p>${escape(message)}</p>
${back}
<p class="muted small" style="margin-top:1.25rem"><a href="/">Back to ${escape(org.displayName)}</a></p>
</div></body></html>`;
}

/* ------------------ Public org login / signup --------------------- */

// Org subdomains expose /login and /signup for any user (not leader-gated
// like /admin/login). Used by visitors who want to RSVP, view the
// member directory, etc. Auto-creates an OrgMembership(role=parent) on
// signup so the new user is associated with this org.

function publicLoginPage(org, { error, next, googleConfigured: gc, mode = "login" }) {
  const apex = (process.env.APEX_DOMAIN || "compass.app").toLowerCase();
  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const errHtml = error ? `<div class="flash-err">${escape(error)}</div>` : "";
  const nextEnc = encodeURIComponent(next || "/");
  const isLogin = mode === "login";
  const otherMode = isLogin ? "signup" : "login";
  const otherCopy = isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in";

  const googleHtml = gc
    ? `<a class="btn-google" href="https://${apex}/auth/google/start?next=${nextEnc.replace(/^\/?/, encodeURIComponent("https://" + (org.slug + "." + apex)))}">
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.63z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.36 0-4.36-1.6-5.07-3.74H.96v2.34A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.93 10.68A5.4 5.4 0 0 1 3.64 9c0-.58.1-1.15.29-1.68V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.97-2.34z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.98l2.97 2.34C4.64 5.18 6.64 3.58 9 3.58z"/>
  </svg>
  <span>Continue with Google</span>
</a>
<div class="divider"><span>or with email</span></div>`
    : "";

  const nameField = isLogin
    ? ""
    : `<label>Your name<input name="displayName" type="text" required maxlength="80" autocomplete="name"></label>`;
  const action = isLogin ? "/login" : "/signup";
  const submit = isLogin ? "Sign in" : "Create account";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(isLogin ? "Sign in" : "Sign up")} — ${escape(org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.card{max-width:440px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:2.25rem 2rem;box-shadow:var(--shadow-card)}
h1{font-family:var(--font-display);font-weight:400;font-size:2rem;line-height:1.05;letter-spacing:-.025em;margin:0 0 .25rem}
p.lede{color:var(--ink-soft);margin:0 0 1.6rem;font-size:.95rem}
label{display:block;margin:0 0 1rem;font-size:.86rem;font-weight:600;color:var(--ink)}
input{display:block;width:100%;margin-top:.3rem;padding:.65rem .8rem;border:1.5px solid var(--line);border-radius:var(--radius-button);font:inherit;background:var(--surface);color:var(--ink)}
input:focus{outline:none;border-color:var(--ink)}
.btn{display:block;width:100%;padding:.78rem;border-radius:var(--radius-button);border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-family:var(--font-ui);font-weight:600;cursor:pointer;font-size:.95rem;margin-top:.5rem;transition:background 120ms ease-out,color 120ms ease-out}
.btn:hover{background:var(--primary-hover);color:var(--accent)}
.btn-google{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.72rem;border-radius:var(--radius-button);border:1.5px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none;font-weight:500;font-size:.95rem}
.btn-google:hover{border-color:var(--ink);background:var(--bg)}
.divider{display:flex;align-items:center;gap:.75rem;color:var(--ink-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;font-weight:600;margin:1.2rem 0}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--line)}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.65rem 1rem;border-radius:var(--radius-button);margin-bottom:1rem;font-size:.92rem}
small.help{display:block;color:var(--ink-muted);margin-top:1.1rem;font-size:.85rem;text-align:center}
small.help a{color:var(--primary);font-weight:600;text-decoration:none}
small.help a:hover{color:var(--primary-hover);text-decoration:underline}
</style></head><body>
<div class="card">
<h1>${escape(org.displayName)}</h1>
<p class="lede">${escape(isLogin ? "Sign in to RSVP and view the directory." : "Create an account to RSVP for events.")}</p>
${errHtml}
${googleHtml}
<form method="post" action="${escape(action)}?next=${escape(nextEnc)}" autocomplete="on">
${nameField}
<label>Email<input name="email" type="email" required autocomplete="email"></label>
<label>Password<input name="password" type="password" required autocomplete="${isLogin ? "current-password" : "new-password"}" minlength="${isLogin ? "1" : "12"}"></label>
${isLogin ? "" : honeypotFields()}
<button class="btn" type="submit">${escape(submit)}</button>
</form>
<small class="help">
  <a href="/${escape(otherMode)}?next=${escape(nextEnc)}">${escape(otherCopy)}</a>
  ${isLogin ? `<br><a href="/forgot">Forgot password?</a> · <a href="/magic">Sign in by email</a>` : ""}
</small>
</div></body></html>`;
}

async function ensureMembership(userId, orgId, defaultRole = "parent") {
  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId, orgId } },
    update: {},
    create: { userId, orgId, role: defaultRole },
  });
}

function safeNext(nextRaw) {
  const n = String(nextRaw || "/");
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

/* ------------------ Mobile-app auth handshake -------------------- */

// The mobile app opens this URL in an in-app browser. If the user isn't
// signed in, we redirect to a login page and bounce back here once
// they are. Once signed in (Lucia cookie present), we mint a fresh
// ApiToken and redirect to the deep-link scheme so the app receives it.
//
// This handler works at BOTH apex and org subdomains:
//   - Apex (compass.app/auth/mobile/begin) — recommended path. Mobile is
//     a single binary, not per-org; org selection happens client-side
//     after /api/v1/auth/me returns the membership list. Login bounces
//     through the apex /login.html page.
//   - Org subdomain (troop100.compass.app/auth/mobile/begin) — kept for
//     back-compat with older mobile builds and OAuth deep-links. Login
//     bounces through the org's branded /login page.
//
// Flow:
//   compass app  →  https://compass.app/auth/mobile/begin?redirect=compass://callback
//                   (in-app browser, sees cookie or signs the user in)
//                →  Location: compass://callback?token=<raw>&user=<id>
//   app then calls /api/v1/auth/me with the bearer to populate state.
app.get("/auth/mobile/begin", async (req, res) => {
  const redirect = String(req.query.redirect || "");
  // Allow only the compass:// custom scheme. Everything else returns
  // 400 — we don't want to hand out tokens to arbitrary URLs.
  if (!/^compass:\/\//.test(redirect)) {
    return res.status(400).type("text/plain").send("Missing or invalid redirect= scheme.");
  }
  if (!req.user) {
    const back = `/auth/mobile/begin?redirect=${encodeURIComponent(redirect)}`;
    // Apex uses the static /login.html page (which fetches CSRF then
    // POSTs JSON to /api/auth/login). Org subdomains have their own
    // branded /login route.
    const loginPath = req.org ? "/login" : "/login.html";
    return res.redirect(`${loginPath}?next=${encodeURIComponent(back)}`);
  }
  const deviceLabel = String(req.query.device || req.headers["user-agent"] || "Mobile device").slice(0, 80);
  const token = await issueToken(req.user.id, deviceLabel, prisma);
  const url = new URL(redirect);
  url.searchParams.set("token", token.raw);
  url.searchParams.set("userId", req.user.id);
  url.searchParams.set("displayName", req.user.displayName || "");
  return res.redirect(url.toString());
});

app.get("/login", (req, res, next) => {
  if (!req.org) return next();
  if (req.user) return res.redirect(safeNext(req.query.next));
  res.type("html").send(
    publicLoginPage(req.org, {
      next: req.query.next,
      googleConfigured,
      mode: "login",
    })
  );
});

app.post("/login", loginLimiter, csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  const { email, password } = req.body || {};
  const emailLc = (email || "").toString().toLowerCase().trim();
  const nextUrl = safeNext(req.query.next);
  const fail = (error) =>
    res.type("html").send(
      publicLoginPage(req.org, { error, next: nextUrl, googleConfigured, mode: "login" })
    );
  if (!emailLc || !password) return fail("Email and password required.");
  const user = await prisma.user.findUnique({ where: { email: emailLc } });
  if (!user || !user.passwordHash) {
    log.warn("login.failed", { email: emailLc, orgSlug: req.org.slug, reason: "no-user-or-passwordless", ip: req.ip });
    return fail("Invalid credentials.");
  }
  const privileged = await isPrivilegedUser(user.id);
  if (!passwordLoginAllowedForRole({ privileged })) {
    log.warn("login.blocked", { email: emailLc, orgSlug: req.org.slug, reason: "admin-sso-required", ip: req.ip });
    return fail("Admin accounts must sign in with Google or Apple.");
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    log.warn("login.failed", { email: emailLc, userId: user.id, orgSlug: req.org.slug, reason: "wrong-password", ip: req.ip });
    return fail("Invalid credentials.");
  }
  // 2FA gate: if the user has enrolled, do NOT issue a session yet —
  // mint a short-lived pre-MFA token and redirect to /mfa where the
  // second factor gets verified. Membership is ensured AFTER the
  // second factor (we don't want a half-authenticated user touching
  // the directory).
  if (user.totpEnrolledAt) {
    const token = mintPreMfaToken({ userId: user.id, secret: AUTH_SECRET });
    return res.redirect(`/mfa?token=${encodeURIComponent(token)}&next=${encodeURIComponent(nextUrl)}`);
  }
  await ensureMembership(user.id, req.org.id, "parent");
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect(nextUrl);
});

// Cross-domain login handoff. The apex sends a freshly-authenticated
// user here with a short-lived signed token; we mint a session cookie
// scoped to this subdomain (host-only, so we don't depend on
// browsers honouring Domain=.localhost or even .compass.app), then
// redirect to the path the apex picked (typically /admin).
app.get("/auth/handoff", async (req, res, next) => {
  if (!req.org) return next();
  const token = String(req.query.token || "");
  const claims = verifySignedToken(token, { secret: AUTH_SECRET });
  if (!claims || claims.kind !== "login-handoff" || !claims.uid) {
    return res.status(400).type("text/plain").send("Login link invalid or expired. Sign in again.");
  }
  const user = await prisma.user.findUnique({ where: { id: claims.uid } });
  if (!user) {
    return res.status(400).type("text/plain").send("Login link no longer valid.");
  }
  // Make sure this user has at least a parent membership in this org —
  // matches the existing /login post-auth behavior so the directory and
  // RSVP pages don't 404 for SSO-fresh users.
  await ensureMembership(user.id, req.org.id, "parent");
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  const nextPath = typeof claims.next === "string" && claims.next.startsWith("/") ? claims.next : "/";
  res.redirect(nextPath);
});

app.get("/signup", (req, res, next) => {
  if (!req.org) return next();
  if (req.user) return res.redirect(safeNext(req.query.next));
  res.type("html").send(
    publicLoginPage(req.org, {
      next: req.query.next,
      googleConfigured,
      mode: "signup",
    })
  );
});

app.post("/signup", signupLimiter, csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  const { email, password, displayName } = req.body || {};
  const nextUrl = safeNext(req.query.next);

  // Bot deterrents — honeypot field + minimum render-to-submit time.
  // Failures look like a generic error to avoid leaking which signal
  // tripped (so naive bots can't tune around it).
  const hp = verifyHoneypot(req.body || {});
  if (!hp.ok) {
    log.warn("signup honeypot rejected", { reason: hp.reason });
    return res.type("html").send(
      publicLoginPage(req.org, { error: "Couldn't create the account. Try again in a moment.", next: nextUrl, googleConfigured, mode: "signup" }),
    );
  }

  if (!email || !password || !displayName) {
    return res.type("html").send(
      publicLoginPage(req.org, { error: "Name, email, and password required.", next: nextUrl, googleConfigured, mode: "signup" })
    );
  }
  if (password.length < 12) {
    return res.type("html").send(
      publicLoginPage(req.org, { error: "Password must be at least 12 characters.", next: nextUrl, googleConfigured, mode: "signup" })
    );
  }
  const lower = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: lower } });
  if (existing) {
    return res.type("html").send(
      publicLoginPage(req.org, { error: "An account already exists for that email — sign in instead.", next: nextUrl, googleConfigured, mode: "login" })
    );
  }
  const user = await prisma.user.create({
    data: { email: lower, displayName, passwordHash: await hashPassword(password) },
  });

  // If this email matches an Org's scoutmasterEmail, grant admin in those
  // orgs (founding-leader claim path); otherwise grant parent here.
  const ownedOrgs = await prisma.org.findMany({ where: { scoutmasterEmail: lower }, select: { id: true } });
  if (ownedOrgs.length) {
    await prisma.orgMembership.createMany({
      data: ownedOrgs.map((o) => ({ userId: user.id, orgId: o.id, role: "admin" })),
      skipDuplicates: true,
    });
    await prisma.org.updateMany({
      where: { id: { in: ownedOrgs.map((o) => o.id) }, ownerId: null },
      data: { ownerId: user.id },
    });
  }
  await ensureMembership(user.id, req.org.id, ownedOrgs.some((o) => o.id === req.org.id) ? "admin" : "parent");

  // Fire-and-forget verify email; failure shouldn't block signup.
  sendVerifyEmail(req.org, user).catch((err) => log.warn("verify email failed", { err }));

  // Funnel marker — closes the loop on /__super/analytics' marketing-
  // conversion section. Best-effort; track() never throws.
  track(EVENTS.USER_SIGNED_UP, {
    orgId: req.org.id,
    userId: user.id,
    dimensions: { surface: "tenant", role: ownedOrgs.length ? "admin" : "parent" },
  });

  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect(nextUrl);
});

app.post("/logout", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (req.session) await lucia.invalidateSession(req.session.id);
  res.appendHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
  res.redirect("/");
});

/* ------------------ Password reset / magic link / verify ----------- */

const AUTH_SECRET =
  process.env.AUTH_TOKEN_SECRET ||
  process.env.RSVP_SECRET ||
  "dev-auth-token-secret-do-not-use-in-prod";

function authPage(org, { title, message, fields = [], action, ok }) {
  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const fieldHtml = fields
    .map(
      (f) => `<label>${escape(f.label)}<input name="${escape(f.name)}" type="${escape(f.type || "text")}" ${
        f.required ? "required" : ""
      } ${f.minlength ? `minlength="${f.minlength}"` : ""} autocomplete="${escape(f.autocomplete || "off")}"></label>`
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} — ${escape(org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.card{max-width:440px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:2.25rem 2rem;box-shadow:var(--shadow-card)}
h1{font-family:var(--font-display);font-weight:400;font-size:2rem;line-height:1.05;letter-spacing:-.025em;margin:0 0 .25rem}
p{color:var(--ink-soft);font-size:.95rem;margin:0 0 1.25rem}
label{display:block;margin:0 0 1rem;font-size:.86rem;font-weight:600;color:var(--ink)}
input{display:block;width:100%;margin-top:.3rem;padding:.65rem .8rem;border:1.5px solid var(--line);border-radius:var(--radius-button);font:inherit;background:var(--surface);color:var(--ink)}
input:focus{outline:none;border-color:var(--ink)}
.btn{display:block;width:100%;padding:.78rem;border-radius:var(--radius-button);border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-family:var(--font-ui);font-weight:600;cursor:pointer;font-size:.95rem;margin-top:.5rem}
.btn:hover{background:var(--primary-hover);color:var(--accent)}
.flash{background:var(--accent-soft);border:1px solid var(--accent);color:var(--ink);padding:.65rem 1rem;border-radius:var(--radius-button);margin-bottom:1rem;font-size:.92rem}
.muted{color:var(--ink-muted);font-size:.85rem;text-align:center;margin-top:1.1rem}
.muted a{color:var(--primary);font-weight:600;text-decoration:none}
.muted a:hover{color:var(--primary-hover);text-decoration:underline}
</style></head><body>
<div class="card">
<h1>${escape(title)}</h1>
${ok ? `<div class="flash">${escape(ok)}</div>` : ""}
<p>${escape(message)}</p>
${
  action
    ? `<form method="post" action="${escape(action)}">${fieldHtml}<button class="btn" type="submit">Continue</button></form>`
    : ""
}
<p class="muted"><a href="/login">← Back to sign in</a></p>
</div></body></html>`;
}

// Send a verify-email link after signup or by request.
async function sendVerifyEmail(org, user) {
  const token = makeSignedToken(
    { kind: "verify", uid: user.id, email: user.email },
    { secret: AUTH_SECRET, ttlSeconds: 60 * 60 * 24 * 7 }
  );
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const port = process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "";
  const url = `${protocol}://${org.slug}.${apex}${port}/verify/${token}`;
  await sendMail({
    to: user.email,
    subject: `Verify your email at ${org.displayName}`,
    text: `Click to verify your email at ${org.displayName}:\n\n${url}\n\nLink expires in 7 days.`,
  });
}

// Verify-email link handler. Idempotent — clicking twice is fine.
app.get("/verify/:token", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifySignedToken(req.params.token, { secret: AUTH_SECRET });
  if (!claims || claims.kind !== "verify") {
    return res.status(400).type("html").send(
      authPage(req.org, { title: "Verification link invalid", message: "This link is bad or expired." })
    );
  }
  await prisma.user.updateMany({
    where: { id: claims.uid, email: claims.email },
    data: { emailVerified: true },
  });
  res
    .type("html")
    .send(authPage(req.org, { title: "Email verified", message: "Thanks — your email is verified.", ok: "Verified." }));
});

// Forgot-password.
app.get("/forgot", (req, res, next) => {
  if (!req.org) return next();
  res.type("html").send(
    authPage(req.org, {
      title: "Reset your password",
      message: "Enter your email; if it matches an account we'll send a reset link.",
      fields: [{ label: "Email", name: "email", type: "email", required: true, autocomplete: "email" }],
      action: "/forgot",
    })
  );
});

app.post("/forgot", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  // Do the DB lookup whether or not we'll send, so timing leaks less.
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user) {
    const token = makeSignedToken(
      { kind: "reset", uid: user.id, email: user.email, h: user.passwordHash?.slice(-12) || "" },
      { secret: AUTH_SECRET, ttlSeconds: 60 * 60 }
    );
    const apex = process.env.APEX_DOMAIN || "compass.app";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const port =
      process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "";
    const url = `${protocol}://${req.org.slug}.${apex}${port}/reset/${token}`;
    await sendMail({
      to: user.email,
      subject: `Reset your password at ${req.org.displayName}`,
      text: `A password reset was requested for ${req.org.displayName}.\n\n${url}\n\nLink expires in 1 hour. Ignore this email if it wasn't you.`,
    });
  }
  // Always show the same response regardless.
  res.type("html").send(
    authPage(req.org, {
      title: "Check your email",
      message: "If that email matches an account, we've sent a reset link. The link expires in 1 hour.",
      ok: "Sent.",
    })
  );
});

app.get("/reset/:token", (req, res, next) => {
  if (!req.org) return next();
  const claims = verifySignedToken(req.params.token, { secret: AUTH_SECRET });
  if (!claims || claims.kind !== "reset") {
    return res.status(400).type("html").send(
      authPage(req.org, { title: "Reset link invalid", message: "This link is bad or expired. Request a new one." })
    );
  }
  res.type("html").send(
    authPage(req.org, {
      title: "Pick a new password",
      message: "Choose a new password (at least 12 characters).",
      fields: [
        { label: "New password", name: "password", type: "password", required: true, minlength: 12, autocomplete: "new-password" },
      ],
      action: `/reset/${req.params.token}`,
    })
  );
});

app.post("/reset/:token", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifySignedToken(req.params.token, { secret: AUTH_SECRET });
  if (!claims || claims.kind !== "reset") {
    return res.status(400).type("html").send(
      authPage(req.org, { title: "Reset link invalid", message: "This link is bad or expired." })
    );
  }
  const password = (req.body?.password || "").toString();
  if (password.length < 12) {
    return res.status(400).type("html").send(
      authPage(req.org, {
        title: "Pick a new password",
        message: "Password must be at least 12 characters.",
        fields: [{ label: "New password", name: "password", type: "password", required: true, minlength: 12, autocomplete: "new-password" }],
        action: `/reset/${req.params.token}`,
      })
    );
  }

  // Bind token to the current passwordHash suffix — reusing an old reset
  // token after the password has changed will fail because `h` won't match.
  const user = await prisma.user.findUnique({ where: { id: claims.uid } });
  if (!user || (user.passwordHash || "").slice(-12) !== (claims.h || "")) {
    return res.status(400).type("html").send(
      authPage(req.org, { title: "Reset link expired", message: "This reset link is no longer valid. Request a new one." })
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  // Invalidate any existing sessions for safety.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  // Sign them in and redirect.
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect("/");
});

/* ------------------------------------------------------------------ */
/* /mfa — second-factor gate                                           */
/* ------------------------------------------------------------------ */
//
// Lands here from POST /login or POST /admin/login when the user has
// totpEnrolledAt set. The pre-MFA token in the URL is a 60s-TTL
// signed claim that just says "this user passed the password check".
// We verify the second factor here and only then issue a real Lucia
// session. Both /login surfaces redirect through this single page so
// there's one source of truth for the second-factor UX.

function mfaPage({ token, next: nextUrl, error, mode = "totp" }) {
  const escapeAttr = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const flip = mode === "backup" ? "totp" : "backup";
  const flipLabel = mode === "backup" ? "Use a code from your app" : "Use a backup code instead";
  const inputLabel = mode === "backup" ? "8-digit backup code" : "6-digit code from your authenticator";
  const inputName = mode === "backup" ? "backupCode" : "code";
  const inputPattern = mode === "backup" ? "[0-9-]{8,9}" : "\\d{6}";
  const inputPlaceholder = mode === "backup" ? "1234-5678" : "123456";
  const errBlock = error
    ? `<div class="flash flash-err">${escapeAttr(error)}</div>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Two-factor verification — Compass</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.card{max-width:440px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:2.25rem 2rem;box-shadow:var(--shadow-card)}
h1{font-family:var(--font-display);font-weight:400;font-size:1.6rem;line-height:1.05;letter-spacing:-.025em;margin:0 0 .25rem}
p{color:var(--ink-soft);font-size:.95rem;margin:0 0 1.25rem}
label{display:block;margin:0 0 1rem;font-size:.86rem;font-weight:600;color:var(--ink)}
input{display:block;width:100%;margin-top:.3rem;padding:.65rem .8rem;border:1.5px solid var(--line);border-radius:var(--radius-button);font:inherit;background:var(--surface);color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:.1em}
input:focus{outline:none;border-color:var(--ink)}
.btn{display:block;width:100%;padding:.78rem;border-radius:var(--radius-button);border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-family:var(--font-ui);font-weight:600;cursor:pointer;font-size:.95rem;margin-top:.5rem}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.65rem 1rem;border-radius:var(--radius-button);margin-bottom:1rem;font-size:.92rem}
small{display:block;color:var(--ink-muted);margin-top:1.1rem;font-size:.85rem;text-align:center}
small a{color:var(--primary);font-weight:600;text-decoration:none}
small a:hover{text-decoration:underline}
</style></head><body>
<div class="card">
<h1>Two-factor verification</h1>
<p>Open your authenticator app and enter the current code.</p>
${errBlock}
<form method="post" action="/mfa">
  <input type="hidden" name="token" value="${escapeAttr(token)}">
  <input type="hidden" name="next" value="${escapeAttr(nextUrl || "/")}">
  <input type="hidden" name="mode" value="${escapeAttr(mode)}">
  <label>${escapeAttr(inputLabel)}
    <input name="${escapeAttr(inputName)}" type="text" inputmode="numeric" autocomplete="one-time-code" required pattern="${inputPattern}" placeholder="${escapeAttr(inputPlaceholder)}" autofocus>
  </label>
  <button class="btn" type="submit">Verify</button>
</form>
<small><a href="/mfa?token=${encodeURIComponent(token)}&next=${encodeURIComponent(nextUrl || "/")}&mode=${flip}">${escapeAttr(flipLabel)}</a></small>
</div></body></html>`;
}

app.get("/mfa", (req, res) => {
  const token = String(req.query.token || "");
  const nextUrl = String(req.query.next || "/");
  const mode = req.query.mode === "backup" ? "backup" : "totp";
  if (!token) return res.redirect("/login");
  // Validate just enough to fail fast on stale links — we re-verify
  // on POST anyway.
  const uid = verifyPreMfaToken(token, { secret: AUTH_SECRET });
  if (!uid) return res.redirect("/login?next=" + encodeURIComponent(nextUrl));
  res.type("html").send(mfaPage({ token, next: nextUrl, mode }));
});

app.post("/mfa", csrfProtect, async (req, res) => {
  const token = String(req.body?.token || "");
  const nextUrl = String(req.body?.next || "/");
  const mode = req.body?.mode === "backup" ? "backup" : "totp";
  const uid = verifyPreMfaToken(token, { secret: AUTH_SECRET });
  if (!uid) {
    return res.status(400).type("html").send(
      mfaPage({ token: "", next: nextUrl, mode, error: "Your session expired. Sign in again." }),
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, totpSecret: true, totpEnrolledAt: true, totpLastUsedAt: true },
  });
  if (!user || !user.totpEnrolledAt) {
    return res.status(400).type("html").send(
      mfaPage({ token, next: nextUrl, mode, error: "MFA isn't set up for this account." }),
    );
  }

  if (mode === "backup") {
    const codeId = await verifyBackupCode({
      userId: user.id,
      code: req.body?.backupCode || "",
      prismaClient: prisma,
    });
    if (!codeId) {
      log.warn("mfa.backup.failed", { userId: user.id, ip: req.ip });
      return res.status(400).type("html").send(
        mfaPage({ token, next: nextUrl, mode: "backup", error: "That backup code didn't match." }),
      );
    }
    await prisma.backupCode.update({ where: { id: codeId }, data: { usedAt: new Date() } });
  } else {
    const result = verifyTotp({
      secret: user.totpSecret,
      token: req.body?.code || "",
      lastUsedAt: user.totpLastUsedAt,
    });
    if (!result.ok) {
      log.warn("mfa.totp.failed", { userId: user.id, reason: result.reason, ip: req.ip });
      const errCopy =
        result.reason === "replay"
          ? "That code was already used. Wait for the next one."
          : "That code didn't match — try the current one.";
      return res.status(400).type("html").send(
        mfaPage({ token, next: nextUrl, mode: "totp", error: errCopy }),
      );
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { totpLastUsedAt: result.periodStart },
    });
  }

  // Second factor accepted — issue the real session.
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect(nextUrl || "/");
});

// Magic-link login — email a one-tap sign-in URL.
app.get("/magic", (req, res, next) => {
  if (!req.org) return next();
  res.type("html").send(
    authPage(req.org, {
      title: "Sign in by email",
      message: "We'll email you a link that signs you in. No password needed.",
      fields: [{ label: "Email", name: "email", type: "email", required: true, autocomplete: "email" }],
      action: "/magic",
    })
  );
});

app.post("/magic", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user) {
    const token = makeSignedToken(
      { kind: "magic", uid: user.id, email: user.email },
      { secret: AUTH_SECRET, ttlSeconds: 60 * 15 }
    );
    const apex = process.env.APEX_DOMAIN || "compass.app";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const port =
      process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : "";
    const url = `${protocol}://${req.org.slug}.${apex}${port}/magic/${token}`;
    await sendMail({
      to: user.email,
      subject: `Sign in to ${req.org.displayName}`,
      text: `Click to sign in to ${req.org.displayName}:\n\n${url}\n\nLink expires in 15 minutes.`,
    });
  }
  res.type("html").send(
    authPage(req.org, {
      title: "Check your email",
      message: "If that email matches an account, we've sent a sign-in link. It expires in 15 minutes.",
      ok: "Sent.",
    })
  );
});

app.get("/magic/:token", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifySignedToken(req.params.token, { secret: AUTH_SECRET });
  if (!claims || claims.kind !== "magic") {
    return res.status(400).type("html").send(
      authPage(req.org, { title: "Sign-in link invalid", message: "This link is bad or expired." })
    );
  }
  const user = await prisma.user.findUnique({ where: { id: claims.uid } });
  if (!user) return res.status(404).send("Not found");

  // First successful magic-link verifies the email at the same time.
  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  }
  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: req.org.id } },
    update: {},
    create: { userId: user.id, orgId: req.org.id, role: "parent" },
  });
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect("/");
});

/* ------------------ Calendar feeds + event pages ------------------ */

// Subscribable feed for the org. Calendar apps poll this; updates in our
// admin show up automatically in the user's Google/Apple/Outlook calendar.
app.get("/calendar.ics", async (req, res) => {
  if (!req.org) return res.status(404).send("Not found");
  // Optional category filter — /calendar.ics?category=campout subscribes
  // a family to just the campouts. Normalises spaces / underscores so
  // the URL works whether the category is "Campout" or "court_of_honor".
  const rawCategory = String(req.query?.category || "").trim();
  const where = {
    orgId: req.org.id,
    startsAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) },
  };
  let calendarLabel = req.org.displayName;
  if (rawCategory) {
    const { normaliseCategory, categoryMeta } = await import("../lib/eventCategories.js");
    const key = normaliseCategory(rawCategory);
    if (key) {
      // Match against the canonical key OR the leader's free-form
      // input (case-insensitive).
      const meta = categoryMeta(key);
      where.OR = [
        { category: { equals: key, mode: "insensitive" } },
        { category: { equals: meta.label, mode: "insensitive" } },
      ];
      calendarLabel = `${req.org.displayName} — ${meta.label}`;
    } else {
      // Unknown category — fall back to a literal-match filter so the
      // leader's custom category names still work.
      where.category = { equals: rawCategory, mode: "insensitive" };
      calendarLabel = `${req.org.displayName} — ${rawCategory}`;
    }
  }
  const events = await prisma.event.findMany({ where, orderBy: { startsAt: "asc" } });
  const filenameSuffix = rawCategory
    ? `-${rawCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    : "";
  res
    .set("Content-Type", "text/calendar; charset=utf-8")
    .set("Content-Disposition", `inline; filename="${req.org.slug}${filenameSuffix}.ics"`)
    .send(icsForOrg(events, { orgSlug: req.org.slug, displayName: calendarLabel }));
});

// Per-event ICS download — used by the "Add to Apple Calendar" /
// "Download .ics" buttons on the event detail page.
app.get("/events/:id.ics", async (req, res) => {
  if (!req.org) return res.status(404).send("Not found");
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");
  res
    .set("Content-Type", "text/calendar; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="event-${ev.id}.ics"`)
    .send(icsFor(ev, { orgSlug: req.org.slug }));
});

// JSON events feed for the FullCalendar control on /calendar. Accepts
// FullCalendar's standard `?start=&end=` ISO query, expands recurring
// events, and emits the event shape FullCalendar consumes natively.
// `?cat=<slug>` narrows to a category. The endpoint returns a plain
// array (no envelope) because FullCalendar consumes that directly when
// the `events` option is a URL string.
app.get("/calendar.json", async (req, res, next) => {
  if (!req.org) return next();
  const startQ = String(req.query.start || "");
  const endQ = String(req.query.end || "");
  const start = new Date(startQ);
  const end = new Date(endQ);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return res.status(400).json({ error: "bad_range" });
  }

  const candidates = await prisma.event.findMany({
    where: {
      orgId: req.org.id,
      OR: [
        { startsAt: { gte: start, lte: end } },
        { rrule: { not: null } },
      ],
    },
    orderBy: { startsAt: "asc" },
  });

  let expanded = (
    await Promise.all(
      candidates.map((e) =>
        expandOccurrences(e, { from: start, to: end, max: 200 }),
      ),
    )
  )
    .flat()
    .filter((e) => {
      const d = new Date(e.startsAt);
      return d >= start && d <= end;
    });

  const cat = req.query.cat ? String(req.query.cat) : "";
  if (cat) {
    const slugify = (s) => String(s || "").toLowerCase().replace(/[\s_]+/g, "-");
    expanded = expanded.filter((e) => slugify(e.category) === slugify(cat));
  }

  // Per-category color so chips on the FullCalendar grid match the
  // server-rendered chip palette. Falls through to the org's primary.
  const { categoryMeta } = await import("../lib/eventCategories.js");
  const palette = (color) => {
    // Map our category-color tokens to a real hex via the org's
    // primary/accent fallbacks. The FullCalendar consumer only needs a
    // CSS color string.
    const map = {
      primary: req.org.primaryColor || "#0f172a",
      accent: req.org.accentColor || "#1d4ed8",
      sky: "#3a93c5",
      raspberry: "#c44066",
      plum: "#7d4f8a",
      butter: "#e6c44a",
    };
    return map[color] || req.org.primaryColor || "#0f172a";
  };

  const out = expanded.map((e) => {
    const meta = e.category ? categoryMeta(e.category) : null;
    const bg = meta ? palette(meta.color) : (req.org.primaryColor || "#0f172a");
    return {
      id: e.id,
      title: e.title,
      start: new Date(e.startsAt).toISOString(),
      end: e.endsAt ? new Date(e.endsAt).toISOString() : null,
      allDay: !!e.allDay,
      url: `/events/${e.id}`,
      backgroundColor: bg,
      borderColor: bg,
      textColor: meta && (meta.color === "accent" || meta.color === "butter") ? "#0f172a" : "#fff",
      extendedProps: {
        location: e.location || "",
        category: meta?.label || e.category || "",
      },
    };
  });

  res.json(out);
});

// Public calendar page. Renders a FullCalendar control which fetches
// its own events from /calendar.json — this handler just produces the
// page chrome and a category-filter chip row. We pull enough events
// (90 days forward) to know which categories to surface in chips.
app.get("/calendar", async (req, res, next) => {
  if (!req.org) return next();

  const categoryFilter = req.query.cat ? String(req.query.cat) : "";
  const now = new Date();
  const horizonStart = new Date(now);
  horizonStart.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(horizonStart);
  horizonEnd.setDate(horizonEnd.getDate() + 90);

  const candidates = await prisma.event.findMany({
    where: {
      orgId: req.org.id,
      OR: [
        { startsAt: { gte: horizonStart, lte: horizonEnd } },
        { rrule: { not: null } },
      ],
    },
    orderBy: { startsAt: "asc" },
  });
  const expanded = (
    await Promise.all(
      candidates.map((e) => expandOccurrences(e, { from: horizonStart, to: horizonEnd, max: 60 })),
    )
  ).flat();

  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(
      renderCalendarMonth(req.org, expanded, {
        categoryFilter,
        apexDomain: APEX_DOMAIN,
      }),
    );
});

// Public events list (full page).
app.get("/events", async (req, res, next) => {
  if (!req.org) return next();
  const events = await prisma.event.findMany({
    where: {
      orgId: req.org.id,
      OR: [
        { startsAt: { gte: new Date() } },
        { rrule: { not: null }, recurrenceUntil: null },
        { rrule: { not: null }, recurrenceUntil: { gte: new Date() } },
      ],
    },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  const horizon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
  const expanded = (
    await Promise.all(events.map((e) => expandOccurrences(e, { from: new Date(), to: horizon, max: 12 })))
  ).flat().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 50);
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(
      renderEventsList(req.org, expanded, {
        apexDomain: APEX_DOMAIN,
        categoryFilter: req.query?.category ? String(req.query.category) : "",
      }),
    );
});

// Members-only trip plan view.
app.get("/events/:id/plan", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) {
    return res.redirect(`/login?next=/events/${req.params.id}/plan`);
  }
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).send("Members only");

  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Event not found");

  const plan = await prisma.tripPlan.findUnique({
    where: { eventId: ev.id },
    include: {
      meals: {
        orderBy: { sortOrder: "asc" },
        include: { ingredients: { orderBy: { name: "asc" } } },
      },
      gear: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  const yesCount = await prisma.rsvp.count({
    where: { eventId: ev.id, response: "yes" },
  });
  const headcount = plan?.headcountOverride ?? yesCount;

  const flagged = await prisma.member.findMany({
    where: { orgId: req.org.id, dietaryFlags: { isEmpty: false } },
    select: { firstName: true, lastName: true, dietaryFlags: true },
  });

  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderTripPlan(req.org, ev, plan, headcount, flagged));
});

// Public posts archive (paginated by createdAt desc).
app.get("/posts", async (req, res, next) => {
  if (!req.org) return next();
  const posts = await prisma.post.findMany({
    where: { orgId: req.org.id, visibility: "public" },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      author: { select: { displayName: true } },
    },
  });
  if (posts.length) {
    const { summariseReactions } = await import("../lib/postReactions.js");
    const reactionRows = await prisma.postReaction.findMany({
      where: { postId: { in: posts.map((p) => p.id) } },
      select: { postId: true, userId: true, kind: true },
    });
    const summary = summariseReactions(reactionRows, req.user?.id || null);
    for (const p of posts) {
      p.reactions = summary.get(p.id) || {
        likes: 0, bookmarks: 0, youLiked: false, youBookmarked: false,
      };
    }
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderPostsList(req.org, posts, { viewerUserId: req.user?.id || null }));
});

// POST /posts/:id/react — toggle a like or bookmark from the public
// activity-feed page. Used by the form-post fallback for browsers
// without JS. Members-only — anonymous viewers see counts but no
// button.
app.post("/posts/:id/react", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect(`/login?next=/posts`);
  const { normaliseReactionKind } = await import("../lib/postReactions.js");
  let kind;
  try {
    kind = normaliseReactionKind(String(req.body?.kind || "").trim());
  } catch {
    return res.status(400).type("text/plain").send("Bad reaction kind");
  }
  const post = await prisma.post.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!post) return res.status(404).type("text/plain").send("Not found");
  const existing = await prisma.postReaction.findUnique({
    where: {
      postId_userId_kind: { postId: post.id, userId: req.user.id, kind },
    },
  });
  if (existing) {
    await prisma.postReaction.delete({
      where: {
        postId_userId_kind: { postId: post.id, userId: req.user.id, kind },
      },
    });
  } else {
    await prisma.postReaction.create({
      data: { postId: post.id, userId: req.user.id, kind },
    });
  }
  // Anchor the user back to the same post so the page jumps to it.
  res.redirect(`/posts#post-${post.id}`);
});

app.get("/posts/:id", async (req, res, next) => {
  if (!req.org) return next();
  const post = await prisma.post.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      author: { select: { displayName: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { displayName: true } } },
      },
    },
  });
  if (!post) return res.status(404).send("Post not found");

  let role = null;
  if (post.visibility === "members") {
    if (!req.user) {
      return res.redirect(`/login?next=/posts/${post.id}`);
    }
    role = await roleInOrg(req.user.id, req.org.id);
    if (!role) return res.status(403).send("Members only");
  } else if (req.user) {
    role = await roleInOrg(req.user.id, req.org.id);
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderPostDetail(req.org, post, { user: req.user, role }));
});

/* ------------------ Newsletter archive (per-tenant) -------------- */

app.get("/newsletters", async (req, res, next) => {
  if (!req.org) return next();
  const role = req.user ? await roleInOrg(req.user.id, req.org.id) : null;
  const visibility = role ? ["members", "public"] : ["public"];
  const issues = await prisma.newsletter.findMany({
    where: {
      orgId: req.org.id,
      status: "sent",
      visibility: { in: visibility },
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: { author: { select: { displayName: true } } },
  });
  // Members-only archive with no signed-in user → show the sign-in nudge
  // unless there are public issues to show. (If the unit publishes any
  // issue publicly we still want an archive for them.)
  if (!issues.length && !req.user) {
    return res
      .status(401)
      .type("html")
      .send(renderNewsletterArchive(req.org, [], { needsSignIn: true }));
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderNewsletterArchive(req.org, issues));
});

app.get("/newsletters/:id", async (req, res, next) => {
  if (!req.org) return next();
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id, status: "sent" },
    include: { author: { select: { displayName: true } } },
  });
  if (!issue) return res.status(404).send("Newsletter not found");

  if (issue.visibility === "members") {
    if (!req.user) {
      return res
        .status(401)
        .type("html")
        .send(renderNewsletterPage({ org: req.org, newsletter: issue, posts: [], events: [], needsSignIn: true }));
    }
    const role = await roleInOrg(req.user.id, req.org.id);
    if (!role) {
      return res
        .status(403)
        .type("html")
        .send(renderNewsletterPage({ org: req.org, newsletter: issue, posts: [], events: [], notAMember: true }));
    }
  }

  const [posts, events] = await Promise.all([
    issue.includedPostIds.length
      ? prisma.post.findMany({
          where: { id: { in: issue.includedPostIds }, orgId: req.org.id },
          include: { author: { select: { displayName: true } } },
        })
      : [],
    issue.includedEventIds.length
      ? prisma.event.findMany({
          where: { id: { in: issue.includedEventIds }, orgId: req.org.id },
        })
      : [],
  ]);
  const orderedPosts = issue.includedPostIds
    .map((id) => posts.find((p) => p.id === id))
    .filter(Boolean);
  const orderedEvents = issue.includedEventIds
    .map((id) => events.find((e) => e.id === id))
    .filter(Boolean);

  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderNewsletterPage({ org: req.org, newsletter: issue, posts: orderedPosts, events: orderedEvents }));
});

// Post a comment. Sign-in required; auto-creates a parent membership
// on first interaction so a brand-new user comment lands without
// extra setup.
app.post("/posts/:id/comments", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) {
    return res.redirect(`/login?next=/posts/${req.params.id}`);
  }
  const post = await prisma.post.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, visibility: true },
  });
  if (!post) return res.status(404).send("Post not found");

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: req.user.id, orgId: req.org.id } },
    update: {},
    create: { userId: req.user.id, orgId: req.org.id, role: "parent" },
  });

  const body = (req.body?.body || "").toString().trim().slice(0, 2000);
  if (!body) return res.redirect(`/posts/${post.id}`);

  await prisma.comment.create({
    data: {
      orgId: req.org.id,
      postId: post.id,
      authorId: req.user.id,
      body,
    },
  });
  res.redirect(`/posts/${post.id}#comments`);
});

// Admin moderation: hide / show / delete a comment.
async function gateLeader(req, res) {
  if (!req.user) {
    res.redirect(`/login?next=/posts/${req.params.id}`);
    return false;
  }
  const role = await roleInOrg(req.user.id, req.org.id);
  if (role !== "admin" && role !== "leader") {
    res.status(403).send("Leaders only");
    return false;
  }
  return true;
}

app.post("/posts/:id/comments/:cid/hide", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!(await gateLeader(req, res))) return;
  await prisma.comment.updateMany({
    where: { id: req.params.cid, orgId: req.org.id, postId: req.params.id },
    data: { hidden: true },
  });
  res.redirect(`/posts/${req.params.id}`);
});

app.post("/posts/:id/comments/:cid/show", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!(await gateLeader(req, res))) return;
  await prisma.comment.updateMany({
    where: { id: req.params.cid, orgId: req.org.id, postId: req.params.id },
    data: { hidden: false },
  });
  res.redirect(`/posts/${req.params.id}`);
});

app.post("/posts/:id/comments/:cid/delete", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!(await gateLeader(req, res))) return;
  await prisma.comment.deleteMany({
    where: { id: req.params.cid, orgId: req.org.id, postId: req.params.id },
  });
  res.redirect(`/posts/${req.params.id}`);
});

// Public Eagle list — every Eagle Scout on the troop's roster.
app.get("/eagles", async (req, res, next) => {
  if (!req.org) return next();
  const eagles = await prisma.eagleScout.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ earnedAt: "desc" }, { lastName: "asc" }],
  });
  // Resolve scoutbookUserId for any Eagle that's still on the roster.
  // We don't expose it on EagleScout directly (the Member is the source
  // of truth and the Eagle row is intentionally light) — look it up.
  const linkedMemberIds = eagles.map((e) => e.memberId).filter(Boolean);
  const sbMap = new Map();
  if (linkedMemberIds.length) {
    const linked = await prisma.member.findMany({
      where: { orgId: req.org.id, id: { in: linkedMemberIds } },
      select: { id: true, scoutbookUserId: true },
    });
    for (const m of linked) {
      if (m.scoutbookUserId) sbMap.set(m.id, m.scoutbookUserId);
    }
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderEagleList(req.org, eagles, sbMap));
});

// Members-only Merit Badge Counselor list. Phone numbers + emails are
// member contact info, not public data — gate behind login + membership.
app.get("/mbc", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect(`/login?next=/mbc`);
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).send("Members only");

  const list = await prisma.meritBadgeCounselor.findMany({
    where: { orgId: req.org.id },
    orderBy: { name: "asc" },
  });
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderMbcList(req.org, list));
});

// Public + members-only video gallery. Public videos render to anyone;
// members-only videos require login + an org membership.
app.get("/videos", async (req, res, next) => {
  if (!req.org) return next();
  const role = req.user ? await roleInOrg(req.user.id, req.org.id) : null;
  const isMember = !!role;
  const where = { orgId: req.org.id };
  if (!isMember) where.visibility = "public";
  const list = await prisma.video.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderVideoGallery(req.org, list, { isMember }));
});

// Reimbursement request form — member submits, treasurer reviews in
// /admin/reimbursements. Receipt upload is optional but encouraged.
const reimbursementUpload = multer({
  dest: process.env.UPLOAD_TMP || "/tmp/compass-uploads",
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

app.get("/reimburse", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect(`/login?next=/reimburse`);
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).send("Members only");

  const [events, mine] = await Promise.all([
    prisma.event.findMany({
      where: { orgId: req.org.id },
      orderBy: { startsAt: "desc" },
      take: 30,
      select: { id: true, title: true, startsAt: true },
    }),
    prisma.reimbursement.findMany({
      where: { orgId: req.org.id, requesterUserId: req.user.id },
      orderBy: { submittedAt: "desc" },
      take: 20,
      include: { event: { select: { title: true } } },
    }),
  ]);

  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderReimburseForm(req.org, req.user, events, mine, req.csrfToken));
});

app.post(
  "/reimburse",
  csrfProtect,
  reimbursementUpload.single("receipt"),
  async (req, res, next) => {
    if (!req.org) return next();
    if (!req.user) return res.redirect(`/login?next=/reimburse`);
    const role = await roleInOrg(req.user.id, req.org.id);
    if (!role) return res.status(403).send("Members only");

    const amount = parseFloat(req.body?.amount || "0");
    const purpose = (req.body?.purpose || "").toString().trim();
    const eventId = (req.body?.eventId || "").toString().trim() || null;
    if (!Number.isFinite(amount) || amount <= 0 || !purpose) {
      return res.redirect("/reimburse?error=missing");
    }

    let receiptFilename = null;
    let receiptMimeType = null;
    if (req.file) {
      const ext = (req.file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || "bin").toLowerCase();
      receiptFilename = `receipt-${crypto.randomBytes(8).toString("hex")}.${ext}`;
      receiptMimeType = req.file.mimetype || "application/octet-stream";
      await storage.moveFromTemp(req.org.id, receiptFilename, req.file.path);
    }

    await prisma.reimbursement.create({
      data: {
        orgId: req.org.id,
        requesterUserId: req.user.id,
        requesterName: req.user.displayName,
        requesterEmail: req.user.email,
        eventId,
        amountCents: Math.round(amount * 100),
        purpose,
        receiptFilename,
        receiptMimeType,
      },
    });

    res.redirect("/reimburse?ok=1");
  },
);

// Printable Court of Honor program for a specific event.
app.get("/events/:id/program", async (req, res, next) => {
  if (!req.org) return next();
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Event not found");
  const awards = await prisma.cohAward.findMany({
    where: { eventId: ev.id },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { recipient: "asc" }],
  });
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderCohProgram(req.org, ev, awards));
});

// Public survey form.
app.get("/surveys/:slug", async (req, res, next) => {
  if (!req.org) return next();
  const slug = req.params.slug;
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(404).send("Not found");
  const survey = await prisma.survey.findUnique({
    where: { orgId_slug: { orgId: req.org.id, slug } },
  });
  if (!survey) return res.status(404).send("Survey not found");
  if (survey.audience === "members" && !req.user) {
    return res.redirect(`/login?next=/surveys/${slug}`);
  }
  res.set("Content-Type", "text/html; charset=utf-8").send(
    renderSurvey(req.org, survey, { user: req.user })
  );
});

// Submit a survey response. Audience determines login requirement.
// CSRF-protected because GET issues the cookie + injects the form token.
app.post("/surveys/:slug", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  const survey = await prisma.survey.findUnique({
    where: { orgId_slug: { orgId: req.org.id, slug: req.params.slug } },
  });
  if (!survey) return res.status(404).send("Not found");
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) {
    return res.status(410).send("Survey is closed.");
  }
  if (survey.audience === "members" && !req.user) {
    return res.redirect(`/login?next=/surveys/${req.params.slug}`);
  }

  const name = req.user
    ? req.user.displayName
    : (req.body?.name || "").toString().trim();
  const email = req.user
    ? req.user.email
    : (req.body?.email || "").toString().trim().toLowerCase();
  if (!name || (!req.user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return res.redirect(`/surveys/${survey.slug}`);
  }

  // Pluck answers by question id from body.
  const questions = Array.isArray(survey.questions) ? survey.questions : [];
  const answers = {};
  for (const q of questions) {
    let v = req.body?.[q.id];
    if (q.type === "yesno") v = v === "yes" ? true : v === "no" ? false : null;
    else if (q.type === "scale") v = v ? parseInt(v, 10) : null;
    else if (q.type === "multi") {
      v = Array.isArray(v) ? v : v ? [v] : [];
    } else if (typeof v === "string") {
      v = v.slice(0, 2000);
    }
    if (v === undefined) v = null;
    answers[q.id] = v;
  }

  await prisma.surveyResponse.create({
    data: {
      orgId: req.org.id,
      surveyId: survey.id,
      userId: req.user?.id ?? null,
      name,
      email: email || null,
      answers,
    },
  });

  res.set("Content-Type", "text/html; charset=utf-8").send(renderSurveyAck(req.org, survey));
});

// Custom page by slug.
app.get("/p/:slug", async (req, res, next) => {
  if (!req.org) return next();
  const slug = req.params.slug;
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(404).send("Not found");
  const page = await prisma.customPage.findUnique({
    where: { orgId_slug: { orgId: req.org.id, slug } },
  });
  if (!page) return res.status(404).send("Page not found");

  if (page.visibility === "members") {
    if (!req.user) return res.redirect(`/login?next=/p/${page.slug}`);
    const role = await roleInOrg(req.user.id, req.org.id);
    if (!role) return res.status(403).send("Members only");
  }

  const { renderCustomPage } = await import("./render.js");
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderCustomPage(req.org, page));
});

// Forms & documents — visibility filters by viewer role.
app.get("/forms", async (req, res, next) => {
  if (!req.org) return next();
  const role = req.user ? await roleInOrg(req.user.id, req.org.id) : null;
  const where = { orgId: req.org.id };
  if (!role) where.visibility = "public";
  else if (role === "parent" || role === "scout") where.visibility = { in: ["public", "members"] };
  // leaders + admins see everything (no visibility filter).

  const forms = await prisma.form.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
  });
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderForms(req.org, forms, { user: req.user, role }));
});

// Member self-service. A signed-in member can edit their own
// contact info + communication preferences from the org subdomain
// without bothering a leader. The matching Member row is found by
// email (the same heuristic admin auth uses); if there's no Member
// for this email, we render a "ask your leader to add you to the
// directory" message.
app.get("/me", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect("/login?next=/me");
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).type("text/plain").send("Not a member of this unit.");
  const member = await prisma.member.findFirst({
    where: { orgId: req.org.id, email: req.user.email.toLowerCase() },
  });
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderSelfServicePage(req.org, req.user, member, role, req.csrfToken, req.query));
});

app.post("/me", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect("/login?next=/me");
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).type("text/plain").send("Not a member of this unit.");
  const member = await prisma.member.findFirst({
    where: { orgId: req.org.id, email: req.user.email.toLowerCase() },
  });
  if (!member) return res.redirect("/me?notlinked=1");
  const phone = String(req.body?.phone || "").trim().slice(0, 40) || null;
  const commPreference = ["email", "sms", "both", "none"].includes(req.body?.commPreference)
    ? req.body.commPreference
    : "email";
  const smsOptIn = req.body?.smsOptIn === "1";
  await prisma.member.update({
    where: { id: member.id },
    data: { phone, commPreference, smsOptIn },
  });
  res.redirect("/me?saved=1");
});

function renderSelfServicePage(org, user, member, role, csrfToken, query) {
  const escapeAttr = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const sel = (cond) => (cond ? " selected" : "");
  const checked = (cond) => (cond ? " checked" : "");
  const flash = query?.saved
    ? `<div class="flash flash-ok">Saved.</div>`
    : query?.notlinked
      ? `<div class="flash flash-err">No directory entry for ${escapeAttr(user.email)} yet — ask a unit leader to add you.</div>`
      : "";
  const linked = member
    ? `<form method="post" action="/me" class="form-card">
        ${csrfToken ? `<input type="hidden" name="csrf" value="${escapeAttr(csrfToken)}">` : ""}
        <h2>Your contact details</h2>
        <p class="lede">These are what a leader sees in the directory and what we use when sending broadcasts.</p>
        <label>Name
          <input type="text" value="${escapeAttr(member.firstName + " " + member.lastName)}" disabled>
          <span class="hint">Ask a leader to fix typos in your name.</span>
        </label>
        <label>Email
          <input type="email" value="${escapeAttr(member.email)}" disabled>
        </label>
        <label>Phone
          <input name="phone" type="tel" value="${escapeAttr(member.phone || "")}" placeholder="555-0142">
        </label>
        <label>How should we reach you?
          <select name="commPreference">
            <option value="email"${sel(member.commPreference === "email")}>Email only</option>
            <option value="sms"${sel(member.commPreference === "sms")}>Text only</option>
            <option value="both"${sel(member.commPreference === "both")}>Both email and text</option>
            <option value="none"${sel(member.commPreference === "none")}>Don't contact me (still in directory)</option>
          </select>
        </label>
        <label class="checkbox">
          <input name="smsOptIn" type="checkbox" value="1"${checked(member.smsOptIn)}>
          I consent to receiving text messages at the phone number above.
        </label>
        <button class="btn-primary" type="submit">Save</button>
      </form>`
    : `<div class="flash flash-err">
        We couldn't find a directory entry matching <strong>${escapeAttr(user.email)}</strong>. Ask a unit leader to add you, then come back.
      </div>`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>My settings — ${escapeAttr(org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
body{margin:0;font-family:var(--font-ui);background:var(--bg);color:var(--ink);min-height:100vh}
main{max-width:560px;margin:0 auto;padding:2rem 1rem}
h1{font-family:var(--font-display);font-weight:400;letter-spacing:-.02em}
h1 em{font-style:italic;color:var(--ink)}
h2{margin-top:0}
.muted{color:var(--ink-muted);font-size:.92rem}
.org-back{color:var(--ink-muted);text-decoration:none;font-size:.86rem}

/* Surface cards (contact details + your data) share the same chrome */
.form-card,.data-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:1.5rem;margin-top:1.5rem}
.form-card .lede,.data-card p{color:var(--ink-muted);font-size:.92rem}

/* Form controls */
.form-card label{display:block;margin:1rem 0}
.form-card label.checkbox{display:flex;align-items:center;gap:.5rem}
.form-card input,.form-card select{display:block;width:100%;margin-top:.3rem;padding:.6rem .8rem;border:1.5px solid var(--line);border-radius:var(--radius-button);font:inherit;background:var(--surface);color:var(--ink)}
.form-card input[type=checkbox]{display:inline-block;width:auto;margin:0}
.form-card input:disabled{background:var(--bg);color:var(--ink-muted);border-color:var(--line-soft)}
.form-card input:focus,.form-card select:focus{outline:2px solid var(--ink);outline-offset:1px;border-color:var(--ink)}
.form-card .hint{display:block;color:var(--ink-muted);font-size:.78rem;margin-top:.25rem}

/* Buttons */
.btn-primary{background:var(--ink);color:var(--bg);border:1.5px solid var(--ink);padding:.65rem 1.1rem;border-radius:var(--radius-button);font-weight:600;cursor:pointer}
.btn-secondary{background:var(--surface);color:var(--ink);border:1.5px solid var(--ink);padding:.6rem 1.1rem;border-radius:var(--radius-button);font-weight:600;text-decoration:none;font-size:.92rem}
.btn-danger-ghost{background:var(--surface);color:#7d2614;border:1.5px solid #f0bcb1;padding:.6rem 1.1rem;border-radius:var(--radius-button);font-weight:600;text-decoration:none;font-size:.92rem}

/* Data-card specific layout */
.data-actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}

/* Flash messages */
.flash{padding:.6rem .85rem;border-radius:var(--radius-button);margin:1rem 0;font-size:.92rem}
.flash-ok{background:var(--accent-soft);border:1px solid var(--accent);color:var(--ink)}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614}
</style></head><body>
<main>
<a class="org-back" href="/">← ${escapeAttr(org.displayName)}</a>
<h1>My <em>settings.</em></h1>
<p class="muted">Signed in as ${escapeAttr(user.displayName || user.email)}${role && role !== "parent" ? ` · <strong>${escapeAttr(role)}</strong>` : ""}.</p>
${flash}
${linked}
<section class="data-card">
  <h2>Browser notifications</h2>
  <p>Get a notification on this computer when someone DMs you in Compass. Independent from the mobile app — handy for leaders who work from a laptop. Granting permission adds this browser to your notification list; you can unsubscribe any time.</p>
  <div class="data-actions">
    <button id="cmp-push-toggle" class="btn-secondary" type="button" disabled>Loading…</button>
  </div>
  <p id="cmp-push-status" class="muted" style="margin-top:.5rem;font-size:.86rem"></p>
</section>
<section class="data-card">
  <h2>Your data</h2>
  <p>Download a JSON copy of the data linked to your account, or delete the account entirely.</p>
  <div class="data-actions">
    <a class="btn-secondary" href="/me/export.json">Download my data</a>
    <a class="btn-danger-ghost" href="/me/delete">Delete my account</a>
  </div>
</section>
<p class="muted" style="margin-top:1.5rem">For everything else (medical info, family link-ups, position changes), ask your unit leader.</p>

<script>
(function() {
  // Browser-push registration UI — minimal vanilla JS, no framework.
  // Three states the button reflects:
  //   1. Browser doesn't support Notifications / Push → disabled with reason
  //   2. Permission "denied" → disabled with explanation (user must change in browser settings)
  //   3. Otherwise → toggles between "Enable" and "Disable" based on the
  //      current subscription state.
  var toggle = document.getElementById("cmp-push-toggle");
  var status = document.getElementById("cmp-push-status");
  var csrf = ${csrfToken ? `"${escapeAttr(csrfToken)}"` : `""`};

  function setStatus(text, btnLabel, disabled) {
    status.textContent = text || "";
    if (btnLabel != null) toggle.textContent = btnLabel;
    toggle.disabled = !!disabled;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    setStatus("This browser doesn't support browser notifications.", "Not supported", true);
    return;
  }

  // VAPID public key as bytes for the subscribe call.
  function urlBase64ToUint8Array(b64) {
    var padding = "=".repeat((4 - b64.length % 4) % 4);
    var b = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(b);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function fetchVapidKey() {
    var res = await fetch("/push/vapid-key", { credentials: "same-origin" });
    if (!res.ok) throw new Error("vapid-unavailable");
    var body = await res.json();
    return body.publicKey;
  }

  async function refresh() {
    if (Notification.permission === "denied") {
      setStatus("Notifications are blocked in your browser. Open the site permissions and re-enable to receive DMs here.", "Blocked", true);
      return;
    }
    var reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) {
      setStatus("Browser notifications aren't enabled on this device.", "Enable notifications", false);
      toggle.dataset.action = "enable";
      return;
    }
    var sub = await reg.pushManager.getSubscription();
    if (sub) {
      setStatus("Notifications are enabled on this browser.", "Disable notifications", false);
      toggle.dataset.action = "disable";
    } else {
      setStatus("Browser notifications aren't enabled on this device.", "Enable notifications", false);
      toggle.dataset.action = "enable";
    }
  }

  async function enable() {
    setStatus("Asking for permission…", "Working…", true);
    if (Notification.permission !== "granted") {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("Permission declined. You can change this in your browser site settings.", "Enable notifications", false);
        toggle.dataset.action = "enable";
        return;
      }
    }
    try {
      var reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      var key = await fetchVapidKey();
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      var res = await fetch("/push/web-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        credentials: "same-origin",
        body: JSON.stringify({ subscription: sub.toJSON(), deviceLabel: navigator.userAgent.slice(0, 80) }),
      });
      if (!res.ok) throw new Error("server-rejected-" + res.status);
      setStatus("Notifications are enabled on this browser.", "Disable notifications", false);
      toggle.dataset.action = "disable";
    } catch (err) {
      setStatus("Couldn't enable notifications: " + (err && err.message || "unknown error"), "Enable notifications", false);
      toggle.dataset.action = "enable";
    }
  }

  async function disable() {
    setStatus("Working…", "Working…", true);
    try {
      var reg = await navigator.serviceWorker.getRegistration("/");
      var sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        await fetch("/push/web-unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("Notifications are off on this browser.", "Enable notifications", false);
      toggle.dataset.action = "enable";
    } catch (err) {
      setStatus("Couldn't disable: " + (err && err.message || "unknown error"), "Disable notifications", false);
      toggle.dataset.action = "disable";
    }
  }

  toggle.addEventListener("click", function() {
    if (toggle.dataset.action === "enable") enable();
    else if (toggle.dataset.action === "disable") disable();
  });

  refresh();
})();
</script>
</main></body></html>`;
}

// Personal data export. JSON dump of every row keyed to req.user across
// every org they belong to — counterpart to the org-level export at
// /admin/export.json. Excludes credentials (passwordHash, oauth tokens,
// API tokens, push device tokens, sessions) since those are secrets,
// not data the user needs back.
app.get("/me/export.json", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect("/login?next=/me");
  const userId = req.user.id;

  const [
    user, memberships, members,
    posts, announcements, comments, newsletters, photos,
    rsvps, slotAssignments,
    postReactions, reactions, channelMemberships, messages,
    feedbackRequests, feedbackVotes, feedbackComments,
    auditLogs,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, displayName: true,
        emailVerified: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.orgMembership.findMany({ where: { userId } }),
    prisma.member.findMany({ where: { email: req.user.email.toLowerCase() } }),
    prisma.post.findMany({ where: { authorId: userId } }),
    prisma.announcement.findMany({ where: { authorId: userId } }),
    prisma.comment.findMany({ where: { authorId: userId } }),
    prisma.newsletter.findMany({ where: { authorId: userId } }),
    prisma.photo.findMany({ where: { uploaderUserId: userId } }),
    prisma.rsvp.findMany({ where: { userId } }),
    prisma.slotAssignment.findMany({ where: { userId } }),
    prisma.postReaction.findMany({ where: { userId } }),
    prisma.reaction.findMany({ where: { userId } }),
    prisma.channelMember.findMany({ where: { userId } }),
    prisma.message.findMany({ where: { authorId: userId } }),
    prisma.feedbackRequest.findMany({ where: { userId } }),
    prisma.feedbackVote.findMany({ where: { userId } }),
    prisma.feedbackComment.findMany({ where: { userId } }),
    prisma.auditLog.findMany({ where: { userId } }),
  ]);

  await recordAudit({
    org: req.org, user: req.user,
    entityType: "User", entityId: userId,
    action: "self-export",
    summary: "Downloaded personal data export",
  });

  const dump = {
    schema: "compass-personal/v1",
    exportedAt: new Date().toISOString(),
    user, memberships, members,
    posts, announcements, comments, newsletters, photos,
    rsvps, slotAssignments,
    postReactions, reactions, channelMemberships, messages,
    feedbackRequests, feedbackVotes, feedbackComments,
    auditLogs,
  };

  const filename = `compass-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  res
    .type("application/json")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(JSON.stringify(dump, null, 2));
});

// Returns the orgs where the user is the *only* admin. Deletion is
// blocked while any of these exist — otherwise the org becomes orphaned
// with no one able to manage settings, billing, or membership.
async function soleAdminOrgs(userId) {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId, role: "admin" },
    select: { orgId: true, org: { select: { displayName: true, slug: true } } },
  });
  const blockers = [];
  for (const m of memberships) {
    const others = await prisma.orgMembership.count({
      where: { orgId: m.orgId, role: "admin", userId: { not: userId } },
    });
    if (others === 0) blockers.push(m.org);
  }
  return blockers;
}

function renderDeletePage(org, user, csrfToken, { blockers = [], error = null } = {}) {
  const escapeAttr = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const blockerHtml = blockers.length
    ? `<div class="flash flash-err">
        <strong>You can't delete this account yet.</strong>
        <p>You're the only admin on:</p>
        <ul>${blockers.map((o) => `<li>${escapeAttr(o.displayName)}</li>`).join("")}</ul>
        <p>Add another admin (or transfer ownership) before deleting your account.</p>
      </div>`
    : "";
  const errHtml = error
    ? `<div class="flash flash-err">${escapeAttr(error)}</div>`
    : "";
  const formHtml = blockers.length
    ? ""
    : `<form method="post" action="/me/delete" class="confirm-form">
        ${csrfToken ? `<input type="hidden" name="csrf" value="${escapeAttr(csrfToken)}">` : ""}
        <label>Type <code>delete</code> to confirm
          <input name="confirm" type="text" autocomplete="off" required>
        </label>
        <div class="confirm-actions">
          <button class="btn-danger" type="submit">Delete my account</button>
          <a class="cancel" href="/me">Cancel</a>
        </div>
      </form>`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete account — ${escapeAttr(org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
body{margin:0;font-family:var(--font-ui);background:var(--bg);color:var(--ink);min-height:100vh}
main{max-width:560px;margin:0 auto;padding:2rem 1rem}
h1{font-family:var(--font-display);font-weight:400;letter-spacing:-.02em;margin-bottom:.25rem}
.muted{color:var(--ink-muted);font-size:.92rem}
.org-back{color:var(--ink-muted);text-decoration:none;font-size:.86rem}
code{background:var(--line-soft);padding:0 .25rem;border-radius:3px;font-family:var(--font-mono)}

.delete-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:1.5rem;margin-top:1.5rem}
.delete-card p{margin:.5rem 0}

.flash{padding:.65rem 1rem;border-radius:var(--radius-button);margin:1rem 0;font-size:.92rem}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614}
.flash-err ul{margin:.4rem 0 0 1.2rem}
.flash-err p{margin:.4rem 0 0}

.confirm-form{margin-top:1rem}
.confirm-form label{display:block;margin-bottom:1rem}
.confirm-form input{display:block;width:100%;margin-top:.3rem;padding:.6rem .8rem;border:1.5px solid var(--line);border-radius:var(--radius-button);font:inherit;background:var(--surface);color:var(--ink)}
.confirm-form input:focus{outline:2px solid var(--ink);outline-offset:1px;border-color:var(--ink)}
.confirm-actions{display:flex;align-items:center;gap:.75rem}
.btn-danger{background:#7d2614;color:#fff;border:1.5px solid #7d2614;padding:.65rem 1.1rem;border-radius:var(--radius-button);font-weight:600;cursor:pointer}
.cancel{color:var(--ink-muted);text-decoration:none}
</style></head><body>
<main>
<a class="org-back" href="/me">← Back to settings</a>
<h1>Delete account</h1>
<p class="muted">Signed in as ${escapeAttr(user.displayName || user.email)}.</p>
<section class="delete-card">
  <p><strong>What gets deleted:</strong> your login, your active sessions, your reactions and RSVPs, your linked sign-in providers, your push devices.</p>
  <p><strong>What stays:</strong> posts and comments you wrote (attributed to a former member), photos you uploaded, and your directory entry on each unit's roster — a leader can remove the directory entry separately if you want.</p>
  <p class="muted">This action can't be undone.</p>
  ${errHtml}
  ${blockerHtml}
  ${formHtml}
</section>
</main></body></html>`;
}

app.get("/me/delete", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect("/login?next=/me");
  const blockers = await soleAdminOrgs(req.user.id);
  res.type("html").send(renderDeletePage(req.org, req.user, req.csrfToken, { blockers }));
});

app.post("/me/delete", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect("/login?next=/me");

  // Super-admins can lock the platform out of itself if they self-
  // delete via this UI; force them through the super-admin console.
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isSuperAdmin: true },
  });
  if (u?.isSuperAdmin) {
    return res.status(400).type("html").send(
      renderDeletePage(req.org, req.user, req.csrfToken, {
        error: "Super-admin accounts must be deleted from the super-admin console.",
      })
    );
  }

  const confirm = String(req.body?.confirm || "").trim().toLowerCase();
  if (confirm !== "delete") {
    return res.status(400).type("html").send(
      renderDeletePage(req.org, req.user, req.csrfToken, {
        error: 'Type "delete" exactly to confirm.',
      })
    );
  }

  const blockers = await soleAdminOrgs(req.user.id);
  if (blockers.length) {
    return res.status(400).type("html").send(
      renderDeletePage(req.org, req.user, req.csrfToken, { blockers })
    );
  }

  // Capture for the audit row before the User row vanishes.
  const userInfo = { id: req.user.id, email: req.user.email, displayName: req.user.displayName };

  // Cascade rules in the schema clean up sessions, memberships,
  // oauthAccounts, apiTokens, pushDevices, postReactions, reactions,
  // channelMemberships, feedbackVotes. Authored content (posts,
  // comments, photos, etc.) is set-null so the content survives but
  // the byline becomes anonymous.
  await prisma.user.delete({ where: { id: userInfo.id } });

  await recordAudit({
    org: req.org,
    user: null,
    entityType: "User",
    entityId: userInfo.id,
    action: "self-delete",
    summary: `Account deleted by user (${userInfo.email})`,
  });

  res.appendHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
  res.type("html").send(authPage(req.org, {
    title: "Account deleted",
    message: "Your account has been deleted. Posts and comments you wrote stay on the unit's site, attributed to a former member.",
    ok: "Done.",
  }));
});

/* ------------------------------------------------------------------ */
/* Member-to-member direct messages (cookie-authed)                    */
/* ------------------------------------------------------------------ */
//
// Counterpart to /admin/members/:id/message — any signed-in member of
// the org can compose a DM to another member of the same org. The
// admin path skips the role check; this one requires the recipient to
// have a User account (otherwise there's nowhere for the message to
// land — leads/non-account folks get email-only via the admin path).
//
// Posting goes through findOrCreateDmChannel + Message.create just
// like the admin path; recipient gets push + 30-min email reminder
// + weekly digest backstop from PR-F/H.

app.get("/messages/:memberId", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.redirect(`/login?next=/messages/${encodeURIComponent(req.params.memberId)}`);
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).type("text/plain").send("Members-only.");

  const target = await prisma.member.findFirst({
    where: { id: req.params.memberId, orgId: req.org.id, isYouth: false },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!target?.email) return res.status(404).type("text/plain").send("No such member.");

  const targetUser = await prisma.user.findUnique({
    where: { email: target.email.toLowerCase() },
    select: { id: true },
  });
  if (!targetUser) {
    return res
      .status(404)
      .type("text/plain")
      .send("This member doesn't have a Compass account yet — ask a leader to invite them.");
  }
  if (targetUser.id === req.user.id) {
    return res.status(400).type("text/plain").send("Can't message yourself.");
  }

  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const csrf = req.csrfToken
    ? `<input type="hidden" name="csrf" value="${escape(req.csrfToken)}">`
    : "";
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Message ${escape(target.firstName)} — ${escape(req.org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
body{margin:0;font-family:var(--font-ui);background:var(--bg);color:var(--ink);min-height:100vh;line-height:1.55}
main{max-width:560px;margin:0 auto;padding:2rem 1rem}
h1{font-family:var(--font-display);font-weight:400;letter-spacing:-.02em;margin-bottom:.25rem}
.muted{color:var(--ink-muted);font-size:.92rem}
.org-back{color:var(--ink-muted);text-decoration:none;font-size:.86rem}
.compose{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:1.5rem;margin-top:1.5rem}
textarea{display:block;width:100%;min-height:140px;margin-top:.4rem;padding:.6rem .8rem;border:1.5px solid var(--line);border-radius:var(--radius-button);font:inherit;background:var(--surface);color:var(--ink);resize:vertical}
textarea:focus{outline:2px solid var(--ink);outline-offset:1px;border-color:var(--ink)}
.btn-primary{background:var(--ink);color:var(--bg);border:1.5px solid var(--ink);padding:.65rem 1.1rem;border-radius:var(--radius-button);font-weight:600;cursor:pointer}
.btn-ghost{color:var(--ink-muted);text-decoration:none;margin-left:.75rem}
</style></head><body>
<main>
<a class="org-back" href="/members">← Member directory</a>
<h1>Message ${escape(target.firstName)} ${escape(target.lastName)}</h1>
<p class="muted">They'll get a notification in Compass right away. If they don't read it within 30 minutes, we'll email them too.</p>
<form class="compose" method="post" action="/messages/${escape(target.id)}">
  ${csrf}
  <label>Message<textarea name="body" required maxlength="4000" placeholder="Hi ${escape(target.firstName)} —"></textarea></label>
  <div style="margin-top:.75rem">
    <button class="btn-primary" type="submit">Send</button>
    <a class="btn-ghost" href="/members">Cancel</a>
  </div>
</form>
</main></body></html>`);
});

app.post("/messages/:memberId", csrfProtect, async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) return res.status(401).type("text/plain").send("Sign in first.");
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) return res.status(403).type("text/plain").send("Members-only.");
  const target = await prisma.member.findFirst({
    where: { id: req.params.memberId, orgId: req.org.id, isYouth: false },
    select: { id: true, email: true },
  });
  if (!target?.email) return res.status(404).type("text/plain").send("No such member.");
  const targetUser = await prisma.user.findUnique({
    where: { email: target.email.toLowerCase() },
    select: { id: true },
  });
  if (!targetUser || targetUser.id === req.user.id) {
    return res.status(400).type("text/plain").send("Can't deliver to that member.");
  }
  const body = String(req.body?.body || "").trim();
  if (!body) return res.redirect(`/messages/${target.id}`);
  if (body.length > 4000) return res.status(413).type("text/plain").send("Message too long.");

  const { findOrCreateDmChannel } = await import("../lib/chat.js");
  const channel = await findOrCreateDmChannel(req.org.id, req.user.id, targetUser.id, {
    prismaClient: prisma,
  });
  await prisma.message.create({
    data: { channelId: channel.id, authorId: req.user.id, body },
  });
  // Hand the user back to /chat with the conversation focused.
  res.redirect(`/chat?channel=${encodeURIComponent(channel.id)}`);
});

// Members-only directory. A signed-in user with any membership in this
// org sees the roster; everyone else gets a sign-in prompt.
app.get("/members", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) {
    return res
      .status(401)
      .type("html")
      .send(renderDirectory(req.org, null, { needsSignIn: true }));
  }
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) {
    return res
      .status(403)
      .type("html")
      .send(renderDirectory(req.org, null, { notAMember: true }));
  }
  const members = await prisma.member.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ isYouth: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  // "Messagable" set = adult members whose email matches a User
  // account and who are themselves a member of this org. The
  // directory's "Message in Compass" button appears only for these
  // — DM channels need a User on both ends. Self-message is also
  // hidden.
  const memberEmails = members
    .filter((m) => !m.isYouth && m.email && m.status !== "alumni")
    .map((m) => m.email.toLowerCase());
  const messagableIds = new Set();
  if (memberEmails.length) {
    const users = await prisma.user.findMany({
      where: { email: { in: memberEmails }, NOT: { id: req.user.id } },
      select: { id: true, email: true, memberships: { where: { orgId: req.org.id }, select: { id: true } } },
    });
    const usersByEmail = new Map(users.map((u) => [u.email, u]));
    for (const m of members) {
      if (m.isYouth || !m.email) continue;
      const u = usersByEmail.get(m.email.toLowerCase());
      if (u && u.memberships.length) messagableIds.add(m.id);
    }
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderDirectory(req.org, members, { role, messagableIds }));
});

// Parent web chat fallback. Browser client talks to /api/v1 over the
// existing Lucia session cookie. Mobile-app users get the same channels
// via the bearer-token path.
app.get("/chat", async (req, res, next) => {
  if (!req.org) return next();
  if (!req.user) {
    return res
      .status(401)
      .type("html")
      .send(renderChatPage(req.org, { needsSignIn: true }));
  }
  const role = await roleInOrg(req.user.id, req.org.id);
  if (!role) {
    return res
      .status(403)
      .type("html")
      .send(renderChatPage(req.org, { notAMember: true }));
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderChatPage(req.org));
});

// Public event detail.
app.get("/events/:id", async (req, res, next) => {
  if (!req.org) return next();
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Event not found");

  const ctx = await loadEventContext(ev, req.user);
  if (req.query.rsvp === "saved") ctx.flash = { type: "ok", message: "RSVP saved." };
  switch (req.query.slot) {
    case "taken":
      ctx.slotFlash = { type: "ok", message: "You're signed up — thanks!" };
      break;
    case "waitlisted":
      ctx.slotFlash = {
        type: "ok",
        message: "Slot is full — you're on the waitlist. We'll bump you up if a spot opens.",
      };
      break;
    case "released":
      ctx.slotFlash = { type: "ok", message: "Slot released." };
      break;
    case "full":
      ctx.slotFlash = { type: "err", message: "That slot just filled up — sorry." };
      break;
    case "dupe":
      ctx.slotFlash = { type: "err", message: "You already signed up for that slot." };
      break;
    case "missing":
      ctx.slotFlash = { type: "err", message: "We need your name and email." };
      break;
  }
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderEventDetail(req.org, ev, { ...ctx, apexDomain: APEX_DOMAIN }));
});

async function loadEventContext(ev, user) {
  const [grouped, myRsvp, slots] = await Promise.all([
    prisma.rsvp.groupBy({
      by: ["response"],
      where: { eventId: ev.id },
      _count: { _all: true },
      _sum: { guests: true },
    }),
    user
      ? prisma.rsvp.findUnique({
          where: { eventId_userId: { eventId: ev.id, userId: user.id } },
        })
      : null,
    prisma.signupSlot.findMany({
      where: { eventId: ev.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { assignments: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  const counts = { yes: 0, no: 0, maybe: 0, total: 0, totalGuests: 0 };
  for (const g of grouped) {
    counts[g.response] = g._count._all;
    counts.total += g._count._all;
    if (g.response === "yes") counts.totalGuests += g._sum.guests || 0;
  }
  return { counts, myRsvp, slots, user };
}

// RSVP submit.
// - Signed-in users: idempotent on (eventId, userId).
// - Anonymous users: required name + email; idempotent on (eventId, email).
app.post("/events/:id/rsvp", async (req, res, next) => {
  if (!req.org) return next();
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Event not found");

  const response = ["yes", "no", "maybe"].includes(req.body?.response) ? req.body.response : "yes";
  const guests = Math.max(0, Math.min(20, parseInt(req.body?.guests, 10) || 0));
  const notes = (req.body?.notes || "").toString().trim().slice(0, 500) || null;

  if (req.user) {
    // Signed-in path.
    await prisma.orgMembership.upsert({
      where: { userId_orgId: { userId: req.user.id, orgId: req.org.id } },
      update: {},
      create: { userId: req.user.id, orgId: req.org.id, role: "parent" },
    });
    await prisma.rsvp.upsert({
      where: { eventId_userId: { eventId: ev.id, userId: req.user.id } },
      update: { response, guests, notes },
      create: {
        orgId: req.org.id,
        eventId: ev.id,
        userId: req.user.id,
        name: req.user.displayName,
        email: req.user.email,
        response,
        guests,
        notes,
      },
    });
    return res.redirect(`/events/${ev.id}?rsvp=saved`);
  }

  // Anonymous path.
  const name = (req.body?.name || "").toString().trim();
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.redirect(`/events/${ev.id}?rsvp=missing`);
  }
  await prisma.rsvp.upsert({
    where: { eventId_email: { eventId: ev.id, email } },
    update: { response, guests, notes, name },
    create: {
      orgId: req.org.id,
      eventId: ev.id,
      name,
      email,
      response,
      guests,
      notes,
    },
  });
  res.redirect(`/events/${ev.id}?rsvp=saved`);
});

// Take a sign-up slot (drivers, food, gear). Anyone can claim — login is
// optional. Capacity enforced inside a transaction so two simultaneous
// claims can't oversubscribe. When a slot is full and waitlisting is
// allowed, additional claims are queued; auto-promoted on release.
app.post("/events/:id/slots/:slotId/take", async (req, res, next) => {
  if (!req.org) return next();
  const slot = await prisma.signupSlot.findFirst({
    where: { id: req.params.slotId, orgId: req.org.id, eventId: req.params.id },
  });
  if (!slot) return res.status(404).send("Slot not found");

  const name = req.user
    ? req.user.displayName
    : (req.body?.name || "").toString().trim();
  const email = (req.user
    ? req.user.email
    : (req.body?.email || "").toString().trim().toLowerCase()) || null;
  const notes = (req.body?.notes || "").toString().trim().slice(0, 200) || null;

  if (!name) return res.redirect(`/events/${req.params.id}?slot=missing`);
  if (!req.user && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return res.redirect(`/events/${req.params.id}?slot=missing`);
  }

  let waitlisted = false;
  try {
    await prisma.$transaction(async (tx) => {
      const activeCount = await tx.slotAssignment.count({
        where: { slotId: slot.id, waitlisted: false },
      });
      if (activeCount >= slot.capacity) {
        if (!slot.allowWaitlist) {
          const err = new Error("FULL");
          err.code = "FULL";
          throw err;
        }
        waitlisted = true;
      }
      await tx.slotAssignment.create({
        data: {
          orgId: req.org.id,
          slotId: slot.id,
          userId: req.user?.id ?? null,
          name,
          email,
          notes,
          waitlisted,
        },
      });
    });
  } catch (e) {
    if (e.code === "FULL") {
      return res.redirect(`/events/${req.params.id}?slot=full`);
    }
    if (e.code === "P2002") {
      // Unique constraint — already signed up for this slot.
      return res.redirect(`/events/${req.params.id}?slot=dupe`);
    }
    throw e;
  }

  res.redirect(
    `/events/${req.params.id}?slot=${waitlisted ? "waitlisted" : "taken"}`,
  );
});

// Release a slot assignment. Only the user who claimed it (matching by
// userId or email) can release; admins can manage from /admin. If the
// released row was active, promote the oldest waitlisted entry to active
// in the same transaction.
app.post("/events/:id/slots/:slotId/release", async (req, res, next) => {
  if (!req.org) return next();
  const slot = await prisma.signupSlot.findFirst({
    where: { id: req.params.slotId, orgId: req.org.id, eventId: req.params.id },
    select: { id: true },
  });
  if (!slot) return res.status(404).send("Slot not found");

  const where = { slotId: slot.id };
  if (req.user) {
    where.userId = req.user.id;
  } else {
    const email = (req.body?.email || "").toString().trim().toLowerCase();
    if (!email) return res.redirect(`/events/${req.params.id}?slot=missing`);
    where.email = email;
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.slotAssignment.findFirst({ where });
    if (!target) return;
    await tx.slotAssignment.delete({ where: { id: target.id } });
    if (!target.waitlisted) {
      const next = await tx.slotAssignment.findFirst({
        where: { slotId: slot.id, waitlisted: true },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await tx.slotAssignment.update({
          where: { id: next.id },
          data: { waitlisted: false },
        });
      }
    }
  });
  res.redirect(`/events/${req.params.id}?slot=released`);
});

// Email open tracking pixel. Returns a 1x1 transparent PNG and records
// a "view" event in MailEvent. Errors silently fall through to the PNG
// so a flaky tracker never breaks the user's mail rendering.
const TRACKING_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
  "base64",
);
function sendTrackingPixel(res) {
  res
    .set("Content-Type", "image/png")
    .set("Cache-Control", "no-store, max-age=0")
    .set("Content-Length", TRACKING_PIXEL.length)
    .end(TRACKING_PIXEL);
}
function hashIp(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.ip ||
    "";
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

app.get("/t/o/:token.png", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifyTrackingToken(req.params.token);
  if (!claims || claims.kind !== "open") return sendTrackingPixel(res);
  try {
    const log = await prisma.mailLog.findUnique({
      where: { id: claims.mailLogId },
      select: { id: true, orgId: true },
    });
    if (log && log.orgId === req.org.id) {
      await prisma.mailEvent.create({
        data: {
          orgId: log.orgId,
          mailLogId: log.id,
          recipient: claims.recipient,
          kind: "open",
          userAgent: (req.headers["user-agent"] || "").toString().slice(0, 500),
          ipHash: hashIp(req),
        },
      });
    }
  } catch {
    // never let a logging failure stop the pixel
  }
  sendTrackingPixel(res);
});

app.get("/t/c/:token", async (req, res, next) => {
  if (!req.org) return next();
  const target = (req.query.to || "").toString();
  const claims = verifyTrackingToken(req.params.token, { url: target });
  // On any failure send the user back to home rather than to an
  // unverified destination — protects against open redirect.
  if (!claims || claims.kind !== "click" || !/^https?:\/\//i.test(target)) {
    return res.redirect("/");
  }
  try {
    const log = await prisma.mailLog.findUnique({
      where: { id: claims.mailLogId },
      select: { id: true, orgId: true },
    });
    if (log && log.orgId === req.org.id) {
      await prisma.mailEvent.create({
        data: {
          orgId: log.orgId,
          mailLogId: log.id,
          recipient: claims.recipient,
          kind: "click",
          url: target.slice(0, 2000),
          userAgent: (req.headers["user-agent"] || "").toString().slice(0, 500),
          ipHash: hashIp(req),
        },
      });
    }
  } catch {
    // never let a logging failure block the redirect
  }
  res.redirect(target);
});

// Email-link RSVP. The token encodes (eventId, name, email) + response,
// HMAC-signed with RSVP_SECRET. One click from the inbox records the
// response — no login. Tokens are short-lived (default 60 days) and
// scoped to a single event so a leaked token can't be reused elsewhere.
app.get("/rsvp/:token", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifyRsvpToken(req.params.token);
  if (!claims) {
    return res
      .status(400)
      .type("html")
      .send(rsvpAck(req.org, { ok: false, message: "This RSVP link is invalid or expired." }));
  }
  const ev = await prisma.event.findFirst({
    where: { id: claims.eventId, orgId: req.org.id },
    select: { id: true, title: true, startsAt: true },
  });
  if (!ev) {
    return res
      .status(404)
      .type("html")
      .send(rsvpAck(req.org, { ok: false, message: "That event no longer exists." }));
  }

  const requested = String(req.query.response || "").toLowerCase();
  const response = ["yes", "no", "maybe"].includes(requested) ? requested : "yes";

  await prisma.rsvp.upsert({
    where: { eventId_email: { eventId: ev.id, email: claims.email } },
    update: { response, name: claims.name },
    create: {
      orgId: req.org.id,
      eventId: ev.id,
      name: claims.name,
      email: claims.email,
      response,
    },
  });

  res
    .type("html")
    .send(
      rsvpAck(req.org, {
        ok: true,
        message: `Thanks, ${claims.name}. We've recorded "${response === "yes" ? "Going" : response === "no" ? "Can't make it" : "Maybe"}" for ${ev.title}.`,
        eventId: ev.id,
      })
    );
});

/* ------------------ One-click unsubscribe ------------------------- */

// GET /unsubscribe/:token — confirmation page (or one-click action when
// the inbox sends ?one_click=1 per RFC 8058). POST /unsubscribe/:token
// completes the action so HTML form clicks pass through CSRF.
async function applyUnsubscribe(orgId, claims) {
  await prisma.member.updateMany({
    where: { id: claims.memberId, orgId },
    data: { emailUnsubscribed: true, unsubscribedAt: new Date() },
  });
}

async function applyResubscribe(orgId, claims) {
  await prisma.member.updateMany({
    where: { id: claims.memberId, orgId },
    data: { emailUnsubscribed: false, unsubscribedAt: null },
  });
}

function unsubPage(org, { ok, member, token, message }) {
  const action = member?.emailUnsubscribed ? "resubscribe" : "unsubscribe";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Email preferences · ${escapeForHtml(org.displayName)}</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:1.75rem 2rem;max-width:520px;box-shadow:var(--shadow-card)}
h1{font-family:var(--font-display);font-weight:400;font-size:1.6rem;margin:0 0 .25rem}
.muted{color:var(--ink-muted)}
.btn{display:inline-block;padding:.55rem 1rem;border-radius:var(--radius-button);border:1px solid transparent;font-size:.95rem;cursor:pointer;font-weight:500}
.btn-primary{background:var(--ink);color:var(--bg)}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
form{margin-top:1rem}
</style></head><body><main class="card">
<h1>Email preferences</h1>
<p class="muted">${escapeForHtml(org.displayName)}</p>
${message ? `<p>${escapeForHtml(message)}</p>` : ""}
${
  ok && member
    ? `<form method="post" action="/${action}/${escapeForHtml(token)}">
         <button class="btn btn-primary" type="submit">${
           member.emailUnsubscribed ? "Re-subscribe" : "Unsubscribe me"
         }</button>
       </form>`
    : ""
}
</main></body></html>`;
}

function escapeForHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

app.get("/unsubscribe/:token", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifyUnsubToken(req.params.token, { orgId: req.org.id });
  if (!claims) {
    return res
      .status(400)
      .type("html")
      .send(unsubPage(req.org, { ok: false, message: "This link is invalid or expired." }));
  }
  const member = await prisma.member.findFirst({
    where: { id: claims.memberId, orgId: req.org.id },
    select: { id: true, firstName: true, lastName: true, email: true, emailUnsubscribed: true },
  });
  if (!member) {
    return res
      .status(404)
      .type("html")
      .send(unsubPage(req.org, { ok: false, message: "We couldn't find that recipient." }));
  }
  // RFC 8058 one-click: the mail client POSTs but some implementations
  // still send GET; the ?one_click=1 query lets us recognise the
  // mail-driven path and unsubscribe immediately without the confirm step.
  if (req.query.one_click === "1" && !member.emailUnsubscribed) {
    await applyUnsubscribe(req.org.id, claims);
    return res
      .type("html")
      .send(
        unsubPage(req.org, {
          ok: true,
          member: { ...member, emailUnsubscribed: true },
          token: req.params.token,
          message: `${member.email} has been unsubscribed. You'll no longer get broadcast emails.`,
        }),
      );
  }
  res.type("html").send(
    unsubPage(req.org, {
      ok: true,
      member,
      token: req.params.token,
      message: member.emailUnsubscribed
        ? `${member.email} is currently unsubscribed.`
        : `${member.email} is currently subscribed to broadcasts.`,
    }),
  );
});

// One-click POST per RFC 8058 — the inbox POSTs without HTML, so CSRF
// is not applicable. Same handler answers form submissions from the
// confirmation page.
app.post("/unsubscribe/:token", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifyUnsubToken(req.params.token, { orgId: req.org.id });
  if (!claims) return res.status(400).send("Invalid link");
  await applyUnsubscribe(req.org.id, claims);
  const member = await prisma.member.findFirst({
    where: { id: claims.memberId, orgId: req.org.id },
    select: { id: true, firstName: true, lastName: true, email: true, emailUnsubscribed: true },
  });
  res.type("html").send(
    unsubPage(req.org, {
      ok: true,
      member,
      token: req.params.token,
      message: `${member?.email || "You"} are unsubscribed.`,
    }),
  );
});

app.post("/resubscribe/:token", async (req, res, next) => {
  if (!req.org) return next();
  const claims = verifyUnsubToken(req.params.token, { orgId: req.org.id });
  if (!claims) return res.status(400).send("Invalid link");
  await applyResubscribe(req.org.id, claims);
  const member = await prisma.member.findFirst({
    where: { id: claims.memberId, orgId: req.org.id },
    select: { id: true, firstName: true, lastName: true, email: true, emailUnsubscribed: true },
  });
  res.type("html").send(
    unsubPage(req.org, {
      ok: true,
      member,
      token: req.params.token,
      message: `${member?.email || "You"} are subscribed again. Welcome back.`,
    }),
  );
});

/* ------------------ Photo serving (org-scoped) -------------------- */

// Photos live at /uploads/<filename>. Filename is a random cuid + extension
// generated at upload time and stored on the Photo row. We resolve the
// photo through Prisma to confirm:
//   1. it belongs to the current req.org (no cross-org reads)
//   2. it's still active (no deleted-but-orphaned files served)
//   3. the album visibility allows the request (members-only requires login)
app.get("/uploads/:filename", async (req, res) => {
  if (!req.org) return res.status(404).send("Not found");
  const { filename } = req.params;
  if (!/^[a-z0-9._-]+$/i.test(filename)) return res.status(400).send("Bad request");

  // Org logo — public, no auth needed.
  if (req.org.logoFilename === filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "svg" ? "image/svg+xml"
      : ext === "webp" ? "image/webp"
      : "application/octet-stream";
    res.set("Content-Type", mime);
    res.set("Cache-Control", "public, max-age=3600");
    return storage.readStream(req.org.id, filename).pipe(res);
  }

  // Photos first.
  const photo = await prisma.photo.findFirst({
    where: { orgId: req.org.id, filename },
    include: {
      album: { select: { visibility: true } },
      message: { select: { id: true, channelId: true } },
    },
  });
  if (photo) {
    // Chat-attached photo — authorize via channel membership rather
    // than album visibility.
    if (photo.message) {
      if (!req.user) return res.redirect(`/login?next=/uploads/${filename}`);
      const role = await roleInOrg(req.user.id, req.org.id);
      if (!role) return res.status(403).send("Members only");
      // Leader-only channels gate by role; everything else is fine
      // for any org member who can read the channel.
      const channel = await prisma.channel.findUnique({
        where: { id: photo.message.channelId },
        select: { kind: true },
      });
      if (channel?.kind === "leaders" && role !== "leader" && role !== "admin") {
        return res.status(403).send("Members only");
      }
    } else if (photo.album) {
      if (photo.album.visibility === "members" && !req.user) {
        return res.status(403).send("Members only");
      }
    } else {
      // Orphan photo (uploaded but never linked). Only the uploader can
      // read it back, and only briefly — should be janitor-ed by a
      // future cron.
      if (!req.user || photo.uploaderUserId !== req.user.id) {
        return res.status(403).send("Members only");
      }
    }
    res.set("Content-Type", photo.mimeType);
    res.set("Cache-Control", photo.message ? "private, max-age=300" : "public, max-age=86400");
    return storage.readStream(req.org.id, photo.filename).pipe(res);
  }

  // PostPhotos.
  const postPhoto = await prisma.postPhoto.findFirst({
    where: { orgId: req.org.id, filename },
    include: { post: { select: { visibility: true } } },
  });
  if (postPhoto) {
    if (postPhoto.post.visibility === "members" && !req.user) {
      return res.status(403).send("Members only");
    }
    res.set("Content-Type", postPhoto.mimeType);
    res.set("Cache-Control", "public, max-age=86400");
    return storage.readStream(req.org.id, postPhoto.filename).pipe(res);
  }

  // Reimbursement receipts — visible to the requester or to leaders/admins.
  const reimb = await prisma.reimbursement.findFirst({
    where: { orgId: req.org.id, receiptFilename: filename },
  });
  if (reimb) {
    if (!req.user) return res.redirect(`/login?next=/uploads/${filename}`);
    const isOwner = reimb.requesterUserId === req.user.id;
    if (!isOwner) {
      const role = await roleInOrg(req.user.id, req.org.id);
      if (role !== "leader" && role !== "admin") {
        return res.status(403).send("Not authorized");
      }
    }
    res.set("Content-Type", reimb.receiptMimeType || "application/octet-stream");
    res.set("Cache-Control", "private, max-age=300");
    return storage.readStream(req.org.id, reimb.receiptFilename).pipe(res);
  }

  // Forms / documents — visibility-gated.
  const form = await prisma.form.findFirst({
    where: { orgId: req.org.id, filename },
  });
  if (form) {
    if (form.visibility !== "public") {
      if (!req.user) return res.redirect(`/login?next=/uploads/${filename}`);
      const role = await roleInOrg(req.user.id, req.org.id);
      if (!role) return res.status(403).send("Members only");
      if (form.visibility === "leaders" && role !== "leader" && role !== "admin") {
        return res.status(403).send("Leaders only");
      }
    }
    res.set("Content-Type", form.mimeType || "application/octet-stream");
    res.set(
      "Content-Disposition",
      `inline; filename="${(form.originalName || form.filename).replace(/[^\w.\-]/g, "_")}"`
    );
    return storage.readStream(req.org.id, form.filename).pipe(res);
  }

  res.status(404).send("Not found");
});

/* ------------------ Tenant site (subdomain) ----------------------- */

app.get("*", async (req, res, next) => {
  if (!req.org) return next();

  // Static assets for the tenant come from /demo/ — this folder is the
  // tenant-asset bucket (styles.css + script.js), not a standalone demo
  // URL. The "see what a unit site looks like" preview lives in unit-site/
  // and the canonical live demo is the seeded "Sample Troop 100" tenant
  // on demo.<APEX_DOMAIN>.
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    // Vendored client libraries served straight from node_modules so we
    // don't duplicate them into the repo. Only an allow-listed set of
    // packages is reachable; the path-traversal regex bars any "../".
    const VENDOR = {
      "/vendor/fullcalendar/": path.join(ROOT, "node_modules", "fullcalendar"),
    };
    for (const [prefix, dir] of Object.entries(VENDOR)) {
      if (req.path.startsWith(prefix)) {
        const sub = req.path.slice(prefix.length);
        if (!/^[a-zA-Z0-9._-]+(\.[a-zA-Z0-9_-]+)*$/.test(sub) || sub.includes("..")) {
          return res.status(404).send("Not found");
        }
        const file = path.join(dir, sub);
        if (fs.existsSync(file)) {
          // Long-cache vendored libs since they're versioned by npm.
          res.setHeader("Cache-Control", "public, max-age=604800, immutable");
          return res.sendFile(file);
        }
        return res.status(404).send("Not found");
      }
    }
    const file = path.join(ROOT, "demo", req.path);
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.status(404).send("Not found");
  }

  // Pull CMS content alongside the org so a single render call has everything.
  const [page, announcements, albums, heroPhotos, events, posts, customPages] = await Promise.all([
    prisma.page.findUnique({ where: { orgId: req.org.id } }),
    prisma.announcement.findMany({
      where: {
        orgId: req.org.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
    }),
    prisma.album.findMany({
      where: { orgId: req.org.id, visibility: "public" },
      orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
        _count: { select: { photos: true } },
      },
    }),
    // Hero strip: 4 most-recent photos from any public album. Falls
    // back to an empty array; renderSite hides the strip when absent.
    prisma.photo.findMany({
      where: {
        orgId: req.org.id,
        album: { visibility: "public" },
      },
      orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
      take: 4,
      select: { id: true, filename: true, caption: true },
    }),
    prisma.event
      .findMany({
        where: {
          orgId: req.org.id,
          OR: [
            { startsAt: { gte: new Date() } },
            { rrule: { not: null }, recurrenceUntil: null },
            { rrule: { not: null }, recurrenceUntil: { gte: new Date() } },
          ],
        },
        orderBy: { startsAt: "asc" },
        take: 30,
      })
      .then(async (rows) => {
        const horizon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
        const expanded = (
          await Promise.all(rows.map((e) => expandOccurrences(e, { from: new Date(), to: horizon, max: 6 })))
        )
          .flat()
          .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
          .slice(0, 8);
        return expanded;
      }),
    prisma.post.findMany({
      where: { orgId: req.org.id, visibility: "public" },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 4 },
        author: { select: { displayName: true } },
      },
    }),
    prisma.customPage.findMany({
      where: { orgId: req.org.id, showInNav: true, visibility: "public" },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { slug: true, title: true, showInNav: true },
    }),
  ]);

  const role = req.user ? await roleInOrg(req.user.id, req.org.id) : null;
  const html = renderSite(req.org, {
    page,
    announcements,
    albums,
    heroPhotos,
    events,
    posts,
    customPages,
    user: req.user,
    role,
  });
  res.set("Content-Type", "text/html; charset=utf-8").send(html);
});

/* ------------------ 404 fallback ---------------------------------- */

app.use((req, res) => {
  const slug = slugFromHost(req.headers.host);
  if (slug) {
    return res.status(404).type("html").send(orgNotFoundPage(slug));
  }
  res.status(404).send("Not found");
});

/* ------------------ Error handler (last) -------------------------- */
//
// Catches anything thrown by upstream middleware/routes. Backend-
// agnostic — emits structured JSON via lib/log.js with a Cloud Error
// Reporting-compatible @type field. Configure your aggregator of
// choice (GCP Cloud Logging, Grafana Cloud, Honeycomb, …) to ingest
// stdout; errors auto-group with stack + request context.
import { expressErrorHandler, installFatalHandlers } from "../lib/errorTracker.js";
app.use(expressErrorHandler({ service: "compass" }));
installFatalHandlers({ service: "compass" });

function orgNotFoundPage(slug) {
  const apex = process.env.APEX_DOMAIN || "compass.app";
  return `<!doctype html><meta charset="utf-8"><title>Site not found</title>
<link rel="stylesheet" href="https://${apex}/tokens.css">
<style>body{font-family:var(--font-ui,system-ui);max-width:560px;margin:6rem auto;padding:0 1.5rem;color:var(--ink,#0f172a);background:var(--bg,#f7f8fa);line-height:1.55}
a{color:var(--accent,#1d4ed8)}</style>
<h1>No Compass site at <code>${escapeHtml(slug)}</code></h1>
<p>This subdomain isn't registered. If this is your unit's site, it may not have
been provisioned yet — or it may have been moved or deleted.</p>
<p><a href="https://${apex}/">← Back to ${apex}</a> ·
<a href="https://${apex}/signup.html">Start a new site</a></p>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ------------------ Boot ------------------------------------------ */

// Export the Express instance so integration tests can drive it via
// supertest without binding a real port. We only call .listen() when
// this module is the entrypoint (`node server/index.js`).
export { app };

import { fileURLToPath as _fu } from "node:url";
import { startCronLoop } from "../lib/newsletterCron.js";
import { startDmReminderLoop } from "../lib/dmReminderCron.js";
import { startDmDigestLoop } from "../lib/dmDigestCron.js";
import { vapidPublicKey } from "../lib/push.js";
const _isMain = process.argv[1] && path.resolve(process.argv[1]) === _fu(import.meta.url);
if (_isMain) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    log.info("Compass started", {
      port: Number(PORT),
      marketing: `http://localhost:${PORT}/`,
      demoOrg: `http://troop100.localhost:${PORT}/`,
    });
    // Newsletter scheduler + reminder rules. No-op when CRON_DISABLED=1
    // (set on N-1 pods in a multi-pod deployment so only one fires).
    startCronLoop({ prismaClient: prisma });
    // DM "you have a message" email-reminder sweep — same CRON_DISABLED
    // gate. Sends at most one email per Message, 30 minutes after the
    // recipient hasn't read it.
    startDmReminderLoop({ prismaClient: prisma, sendMail });
    // Weekly DM digest — long-tail catch-up for users with unread
    // messages older than 24h. 7 days between digests per user.
    startDmDigestLoop({ prismaClient: prisma, sendMail });
  });
}

