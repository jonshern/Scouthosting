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
import { renderSite } from "./render.js";
import { adminRouter } from "./admin.js";

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

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false });
  res.json({
    ok: true,
    user: { id: req.user.id, email: req.user.email, displayName: req.user.displayName },
  });
});

/* ------------------ Admin (org subdomain only) -------------------- */

app.use("/admin", (req, res, next) => {
  if (!req.org) return res.status(404).send("Site not found");
  return adminRouter(req, res, next);
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
  const [page, announcements] = await Promise.all([
    prisma.page.findUnique({ where: { orgId: req.org.id } }),
    prisma.announcement.findMany({
      where: {
        orgId: req.org.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
    }),
  ]);

  const html = renderSite(req.org, { page, announcements });
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
