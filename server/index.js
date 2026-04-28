import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import { prisma } from "../lib/db.js";
import { lucia, attachSession, hashPassword, verifyPassword, roleInOrg } from "../lib/auth.js";
import { originAuth } from "../lib/originAuth.js";
import {
  provisionOrg,
  validateProvisionInput,
} from "./provision.js";
import {
  renderSite,
  renderEventDetail,
  renderEventsList,
  renderDirectory,
  renderPostsList,
  renderPostDetail,
  renderTripPlan,
  renderForms,
} from "./render.js";
import { adminRouter } from "./admin.js";
import * as storage from "../lib/storage.js";
import { googleOAuth, googleConfigured, fetchGoogleProfile } from "../lib/oauth.js";
import { generateState, generateCodeVerifier } from "arctic";
import { icsFor, icsForOrg, expandOccurrences } from "../lib/calendar.js";
import { verifyRsvpToken } from "../lib/rsvpToken.js";
import { makeSignedToken, verifySignedToken } from "../lib/signedToken.js";
import { send as sendMail } from "../lib/mail.js";

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
app.use(originAuth);
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

function rsvpAck(org, { ok, message, eventId }) {
  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const back = eventId ? `<p style="margin-top:1rem"><a href="/events/${escape(eventId)}">View event details →</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? "Thanks!" : "RSVP error"} — ${escape(org.displayName)}</title>
<link rel="stylesheet" href="/styles.css">
<style>
body{display:grid;place-items:center;min-height:100vh;padding:2rem;background:#fbf8ee}
.card{max-width:480px;background:#fff;border:1px solid #eef0e7;border-radius:14px;padding:2rem;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.05)}
.card h1{font-family:Fraunces,serif;font-size:1.6rem;margin-top:0;color:${ok ? escape(org.primaryColor || "#1d6b39") : "#7d2614"}}
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
  const apex = (process.env.APEX_DOMAIN || "scouthosting.com").toLowerCase();
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:wght@600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:#15181c;background:#fbf8ee;display:grid;place-items:center;min-height:100vh;padding:2rem}
.card{max-width:420px;width:100%;background:#fff;border:1px solid #e6ebe2;border-radius:14px;padding:2rem;box-shadow:0 12px 30px rgba(0,0,0,.05)}
h1{font-family:Fraunces,Georgia,serif;font-size:1.6rem;margin:0 0 .25rem}
p.lede{color:#6b7280;margin:0 0 1.25rem;font-size:.95rem}
label{display:block;margin:0 0 1rem;font-size:.9rem;font-weight:500}
input{display:block;width:100%;margin-top:.3rem;padding:.65rem .75rem;border:1px solid #c8ccd4;border-radius:8px;font:inherit}
.btn{display:block;width:100%;padding:.75rem;border-radius:9px;border:0;background:${escape(org.primaryColor || "#1d6b39")};color:#fff;font-weight:600;cursor:pointer;font-size:.95rem;margin-top:.5rem}
.btn-google{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.75rem;border-radius:9px;border:1px solid #c8ccd4;background:#fff;color:#15181c;text-decoration:none;font-weight:500;font-size:.95rem}
.btn-google:hover{border-color:#15181c;background:#f7f8f3}
.divider{display:flex;align-items:center;gap:.75rem;color:#6b7280;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;margin:1.1rem 0}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:#eef0e7}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.65rem 1rem;border-radius:9px;margin-bottom:1rem;font-size:.92rem}
small.help{display:block;color:#6b7280;margin-top:1rem;font-size:.85rem;text-align:center}
small.help a{color:${escape(org.primaryColor || "#1d6b39")}}
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

app.post("/login", async (req, res, next) => {
  if (!req.org) return next();
  const { email, password } = req.body || {};
  const nextUrl = safeNext(req.query.next);
  if (!email || !password) {
    return res.type("html").send(
      publicLoginPage(req.org, { error: "Email and password required.", next: nextUrl, googleConfigured, mode: "login" })
    );
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) {
    return res.type("html").send(
      publicLoginPage(req.org, { error: "Invalid credentials.", next: nextUrl, googleConfigured, mode: "login" })
    );
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    return res.type("html").send(
      publicLoginPage(req.org, { error: "Invalid credentials.", next: nextUrl, googleConfigured, mode: "login" })
    );
  }
  await ensureMembership(user.id, req.org.id, "parent");
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect(nextUrl);
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

app.post("/signup", async (req, res, next) => {
  if (!req.org) return next();
  const { email, password, displayName } = req.body || {};
  const nextUrl = safeNext(req.query.next);
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
  }
  await ensureMembership(user.id, req.org.id, ownedOrgs.some((o) => o.id === req.org.id) ? "admin" : "parent");

  // Fire-and-forget verify email; failure shouldn't block signup.
  sendVerifyEmail(req.org, user).catch((err) => console.warn("verify email failed:", err.message));

  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect(nextUrl);
});

app.post("/logout", async (req, res, next) => {
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
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:#15181c;background:#fbf8ee;display:grid;place-items:center;min-height:100vh;padding:2rem}
.card{max-width:420px;width:100%;background:#fff;border:1px solid #e6ebe2;border-radius:14px;padding:2rem;box-shadow:0 12px 30px rgba(0,0,0,.05)}
h1{font-family:Georgia,serif;font-size:1.5rem;margin:0 0 .35rem}
p{color:#3a4049;font-size:.95rem;margin:0 0 1.25rem}
label{display:block;margin:0 0 1rem;font-size:.9rem;font-weight:500}
input{display:block;width:100%;margin-top:.3rem;padding:.65rem .75rem;border:1px solid #c8ccd4;border-radius:8px;font:inherit}
.btn{display:block;width:100%;padding:.75rem;border-radius:9px;border:0;background:${escape(org.primaryColor || "#1d6b39")};color:#fff;font-weight:600;cursor:pointer;font-size:.95rem;margin-top:.5rem}
.flash{background:#eaf6ec;border:1px solid #b9dec1;color:#15532b;padding:.65rem 1rem;border-radius:9px;margin-bottom:1rem;font-size:.92rem}
.muted{color:#6b7280;font-size:.85rem;text-align:center;margin-top:1rem}
.muted a{color:${escape(org.primaryColor || "#1d6b39")}}
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
  const apex = process.env.APEX_DOMAIN || "scouthosting.com";
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

app.post("/forgot", async (req, res, next) => {
  if (!req.org) return next();
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  // Do the DB lookup whether or not we'll send, so timing leaks less.
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user) {
    const token = makeSignedToken(
      { kind: "reset", uid: user.id, email: user.email, h: user.passwordHash?.slice(-12) || "" },
      { secret: AUTH_SECRET, ttlSeconds: 60 * 60 }
    );
    const apex = process.env.APEX_DOMAIN || "scouthosting.com";
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

app.post("/reset/:token", async (req, res, next) => {
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

app.post("/magic", async (req, res, next) => {
  if (!req.org) return next();
  const email = (req.body?.email || "").toString().trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user) {
    const token = makeSignedToken(
      { kind: "magic", uid: user.id, email: user.email },
      { secret: AUTH_SECRET, ttlSeconds: 60 * 15 }
    );
    const apex = process.env.APEX_DOMAIN || "scouthosting.com";
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
    .send(renderEventsList(req.org, expanded));
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
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderPostsList(req.org, posts));
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

// Post a comment. Sign-in required; auto-creates a parent membership
// on first interaction so a brand-new user comment lands without
// extra setup.
app.post("/posts/:id/comments", async (req, res, next) => {
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

app.post("/posts/:id/comments/:cid/hide", async (req, res, next) => {
  if (!req.org) return next();
  if (!(await gateLeader(req, res))) return;
  await prisma.comment.updateMany({
    where: { id: req.params.cid, orgId: req.org.id, postId: req.params.id },
    data: { hidden: true },
  });
  res.redirect(`/posts/${req.params.id}`);
});

app.post("/posts/:id/comments/:cid/show", async (req, res, next) => {
  if (!req.org) return next();
  if (!(await gateLeader(req, res))) return;
  await prisma.comment.updateMany({
    where: { id: req.params.cid, orgId: req.org.id, postId: req.params.id },
    data: { hidden: false },
  });
  res.redirect(`/posts/${req.params.id}`);
});

app.post("/posts/:id/comments/:cid/delete", async (req, res, next) => {
  if (!req.org) return next();
  if (!(await gateLeader(req, res))) return;
  await prisma.comment.deleteMany({
    where: { id: req.params.cid, orgId: req.org.id, postId: req.params.id },
  });
  res.redirect(`/posts/${req.params.id}`);
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
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .send(renderDirectory(req.org, members, { role }));
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
    .send(renderEventDetail(req.org, ev, ctx));
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
// claims can't oversubscribe.
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

  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.slotAssignment.count({ where: { slotId: slot.id } });
      if (count >= slot.capacity) {
        const err = new Error("FULL");
        err.code = "FULL";
        throw err;
      }
      await tx.slotAssignment.create({
        data: {
          orgId: req.org.id,
          slotId: slot.id,
          userId: req.user?.id ?? null,
          name,
          email,
          notes,
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

  res.redirect(`/events/${req.params.id}?slot=taken`);
});

// Release a slot assignment. Only the user who claimed it (matching by
// userId or email) can release; admins can manage from /admin.
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
  await prisma.slotAssignment.deleteMany({ where });
  res.redirect(`/events/${req.params.id}?slot=released`);
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

  // Photos first.
  const photo = await prisma.photo.findFirst({
    where: { orgId: req.org.id, filename },
    include: { album: { select: { visibility: true } } },
  });
  if (photo) {
    if (photo.album.visibility === "members" && !req.user) {
      return res.status(403).send("Members only");
    }
    res.set("Content-Type", photo.mimeType);
    res.set("Cache-Control", "public, max-age=86400");
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

  // Static assets for the tenant come from /demo/ — same look, neutral content.
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    const file = path.join(ROOT, "demo", req.path);
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.status(404).send("Not found");
  }

  // Pull CMS content alongside the org so a single render call has everything.
  const [page, announcements, albums, events, posts] = await Promise.all([
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
  ]);

  const role = req.user ? await roleInOrg(req.user.id, req.org.id) : null;
  const html = renderSite(req.org, {
    page,
    announcements,
    albums,
    events,
    posts,
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
