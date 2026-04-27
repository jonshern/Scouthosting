import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import { prisma } from "../lib/db.js";
import { lucia, attachSession, hashPassword, verifyPassword } from "../lib/auth.js";
import {
  provisionOrg,
  validateProvisionInput,
} from "./provision.js";
import { renderSite, renderEventDetail, renderEventsList } from "./render.js";
import { adminRouter } from "./admin.js";
import * as storage from "../lib/storage.js";
import { googleOAuth, googleConfigured, fetchGoogleProfile } from "../lib/oauth.js";
import { generateState, generateCodeVerifier } from "arctic";
import { icsFor, icsForOrg } from "../lib/calendar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ */
/* Hostname → org slug                                                 */
/* ------------------------------------------------------------------ */

const APEX_HOSTS = new Set([
  (process.env.APEX_DOMAIN || "scouthosting.com").toLowerCase(),
  `www.${process.env.APEX_DOMAIN || "scouthosting.com"}`.toLowerCase(),
  "scouthosting.local",
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachSession);

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

/* ------------------ Marketing site (apex / www) ------------------- */

app.use((req, res, next) => {
  // Only serve the marketing site for true apex/www requests, never for an
  // unrecognized subdomain (those should 404 below).
  if (req.slugFromHost || req.org) return next();
  return express.static(ROOT, {
    extensions: ["html"],
    index: "index.html",
  })(req, res, next);
});

/* ------------------ Provisioning API ------------------------------ */

app.post("/api/provision", async (req, res) => {
  const errors = validateProvisionInput(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }
  try {
    const org = await provisionOrg(req.body);
    res.status(201).json({
      ok: true,
      tenant: {
        slug: org.slug,
        displayName: org.displayName,
        scoutmasterEmail: org.scoutmasterEmail,
      },
      url: `https://${org.slug}.${process.env.APEX_DOMAIN || "scouthosting.com"}`,
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

app.post("/api/auth/signup", async (req, res) => {
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
  }

  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.status(201).json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "email and password required" });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } });
});

app.post("/api/auth/logout", async (req, res) => {
  if (req.session) await lucia.invalidateSession(req.session.id);
  res.appendHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
  res.json({ ok: true });
});

app.get("/api/auth/providers", (_req, res) => {
  res.json({ ok: true, providers: { google: googleConfigured } });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false });
  res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email, displayName: req.user.displayName },
  });
});

/* ------------------ Google OAuth --------------------------------- */

const OAUTH_STATE_COOKIE = "scouthosting_oauth_state";
const OAUTH_VERIFIER_COOKIE = "scouthosting_oauth_verifier";
const OAUTH_NEXT_COOKIE = "scouthosting_oauth_next";

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
  // recognized scouthosting hosts are honored at callback time.
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

/* ------------------ Admin (org subdomain only) -------------------- */

app.use("/admin", (req, res, next) => {
  if (!req.org) return res.status(404).send("Site not found");
  return adminRouter(req, res, next);
});

/* ------------------ Calendar feeds + event pages ------------------ */

// Subscribable feed for the org. Calendar apps poll this; updates in our
// admin show up automatically in the user's Google/Apple/Outlook calendar.
app.get("/calendar.ics", async (req, res) => {
  if (!req.org) return res.status(404).send("Not found");
  const events = await prisma.event.findMany({
    where: { orgId: req.org.id, startsAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) } },
    orderBy: { startsAt: "asc" },
  });
  res
    .set("Content-Type", "text/calendar; charset=utf-8")
    .set("Content-Disposition", `inline; filename="${req.org.slug}.ics"`)
    .send(icsForOrg(events, { orgSlug: req.org.slug, displayName: req.org.displayName }));
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

// Public events list (full page).
app.get("/events", async (req, res, next) => {
  if (!req.org) return next();
  const events = await prisma.event.findMany({
    where: { orgId: req.org.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderEventsList(req.org, events));
});

// Public event detail.
app.get("/events/:id", async (req, res, next) => {
  if (!req.org) return next();
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Event not found");
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderEventDetail(req.org, ev));
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

  const photo = await prisma.photo.findFirst({
    where: { orgId: req.org.id, filename },
    include: { album: { select: { visibility: true } } },
  });
  if (!photo) return res.status(404).send("Not found");

  if (photo.album.visibility === "members" && !req.user) {
    return res.status(403).send("Members only");
  }

  res.set("Content-Type", photo.mimeType);
  res.set("Cache-Control", "public, max-age=86400");
  storage.readStream(req.org.id, photo.filename).pipe(res);
});

/* ------------------ Tenant site (subdomain) ----------------------- */

app.get("*", async (req, res, next) => {
  if (!req.org) return next();

  // Static assets for the tenant come from /demo/ — same look, neutral content.
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    const file = path.join(ROOT, "demo", req.path);
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.status(404).send("Not found");
  }

  // Pull CMS content alongside the org so a single render call has everything.
  const [page, announcements, albums, events] = await Promise.all([
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
    prisma.event.findMany({
      where: { orgId: req.org.id, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
  ]);

  const html = renderSite(req.org, { page, announcements, albums, events });
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

function orgNotFoundPage(slug) {
  const apex = process.env.APEX_DOMAIN || "scouthosting.com";
  return `<!doctype html><meta charset="utf-8"><title>Site not found</title>
<style>body{font-family:system-ui;max-width:560px;margin:6rem auto;padding:0 1.5rem;color:#15181c}
a{color:#1d6b39}</style>
<h1>No Scouthosting site at <code>${escapeHtml(slug)}</code></h1>
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Scouthosting running on http://localhost:${PORT}`);
  console.log(`Marketing:  http://localhost:${PORT}/`);
  console.log(`Demo org:   http://troop100.localhost:${PORT}/`);
});
