// CMS admin routes for an org subdomain.
//
// Mounted under /admin on every org host. All routes require:
//   - a signed-in user (from attachSession)
//   - an OrgMembership in the current req.org with role 'leader' or 'admin'
//
// Anything that writes uses an HTML form post (urlencoded). CSRF protection
// is queued as [security] in ROADMAP.md; for now these routes accept
// same-origin posts only.

import express from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";
import { lucia, verifyPassword, roleInOrg } from "../lib/auth.js";
import { moveFromTemp, remove as removeFile } from "../lib/storage.js";
import { googleConfigured } from "../lib/oauth.js";
import { sendBatch, mailDriver } from "../lib/mail.js";
import { makeRsvpToken } from "../lib/rsvpToken.js";

export const adminRouter = express.Router();

/* ------------------------------------------------------------------ */
/* Photo uploads                                                       */
/* ------------------------------------------------------------------ */

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const upload = multer({
  dest: path.resolve(process.env.UPLOAD_TMP || "/tmp/scouthosting-uploads"),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10MB per file, 20 per request
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "album";
}

/* ------------------------------------------------------------------ */
/* HTML helpers                                                        */
/* ------------------------------------------------------------------ */

const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

function layout({ title, org, user, body, flash }) {
  const flashHtml = flash
    ? `<div class="flash flash-${escape(flash.type)}">${escape(flash.message)}</div>`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} — ${escape(org.displayName)} admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--g700:${escape(org.primaryColor || "#1d6b39")};--g900:#0f3a1f;--ink:#15181c;--mute:#6b7280;--line:#e6ebe2;--bg:#f7f8f3;--card:#fff;--shadow:0 1px 2px rgba(0,0,0,.04),0 6px 16px rgba(0,0,0,.04);--gold:${escape(org.accentColor || "#caa54a")}}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
a{color:var(--g700)}
h1,h2,h3{font-family:Fraunces,Georgia,serif;letter-spacing:-.01em;margin:0 0 .4em}
.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.side{background:#fff;border-right:1px solid var(--line);padding:1.25rem}
.brand{display:flex;align-items:center;gap:.6rem;margin-bottom:1.5rem;text-decoration:none;color:inherit}
.brand-mark{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,var(--g700),var(--gold));color:#fff;display:grid;place-items:center;font-weight:800;font-size:.85rem}
.brand strong{font-family:Fraunces,serif;font-size:1rem}
.brand small{display:block;color:var(--mute);font-size:.75rem}
.side nav{display:grid;gap:.1rem}
.side a{display:block;padding:.55rem .75rem;border-radius:8px;text-decoration:none;color:var(--ink);font-size:.93rem}
.side a:hover{background:var(--bg)}
.side a.active{background:var(--g700);color:#fff}
.side .me{margin-top:auto;padding-top:1rem;border-top:1px solid var(--line);font-size:.85rem;color:var(--mute)}
.main{padding:2rem 2.5rem;max-width:880px}
.flash{padding:.7rem 1rem;border-radius:10px;margin-bottom:1.25rem;font-weight:500}
.flash-ok{background:#eaf6ec;border:1px solid #b9dec1;color:#15532b}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.5rem;box-shadow:var(--shadow);margin-bottom:1.25rem}
label{display:block;margin:0 0 1rem;font-size:.9rem;font-weight:500;color:#3a4049}
input[type=text],input[type=email],input[type=password],input[type=date],input[type=datetime-local],textarea{display:block;width:100%;margin-top:.3rem;padding:.65rem .75rem;border:1px solid #c8ccd4;border-radius:8px;font:inherit;background:#fff;color:var(--ink)}
textarea{min-height:8rem;font-family:Inter,system-ui,sans-serif}
input:focus,textarea:focus{outline:2px solid var(--g700);outline-offset:1px;border-color:var(--g700)}
.btn{display:inline-block;padding:.65rem 1.05rem;border-radius:9px;border:1px solid transparent;font-weight:600;font-size:.93rem;cursor:pointer;text-decoration:none}
.btn-primary{background:var(--g700);color:#fff}
.btn-primary:hover{background:var(--g900);color:#fff}
.btn-ghost{background:#fff;color:var(--ink);border-color:#c8ccd4}
.btn-danger{background:#fff;color:#7d2614;border-color:#f0bcb1}
.btn-danger:hover{background:#fbe8e3}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.muted{color:var(--mute)}
.small{font-size:.88rem}
ul.items{list-style:none;padding:0;margin:0;display:grid;gap:.6rem}
ul.items li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem;display:flex;justify-content:space-between;gap:1rem;align-items:center}
ul.items h3{margin:0 0 .15rem;font-size:1rem;font-family:Inter,sans-serif}
ul.items p{margin:0;color:var(--mute);font-size:.92rem;white-space:pre-wrap}
.pinned{background:var(--gold);color:#15181c;font-size:.7rem;font-weight:700;padding:.15rem .45rem;border-radius:5px;letter-spacing:.06em;text-transform:uppercase;margin-right:.4rem}
.tag{display:inline-block;background:var(--bg);border:1px solid var(--line);padding:.1rem .45rem;border-radius:5px;font-size:.78rem;color:var(--mute);margin-right:.25rem}
form.inline{display:inline}
.empty{padding:2rem;text-align:center;color:var(--mute);background:#fff;border:1px dashed var(--line);border-radius:12px}
@media (max-width:780px){.shell{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--line)}.main{padding:1.25rem}}
</style></head>
<body>
<div class="shell">
<aside class="side">
  <a class="brand" href="/admin">
    <span class="brand-mark">${escape(org.unitNumber)}</span>
    <span><strong>${escape(org.displayName)}</strong><small>Admin</small></span>
  </a>
  <nav>
    <a href="/admin">Dashboard</a>
    <a href="/admin/posts">Activity feed</a>
    <a href="/admin/content">Page content</a>
    <a href="/admin/announcements">Announcements</a>
    <a href="/admin/events">Calendar</a>
    <a href="/admin/albums">Photos &amp; albums</a>
    <a href="/admin/members">Members</a>
    <a href="/admin/email">Email broadcast</a>
    <a href="/" target="_blank">View public site ↗</a>
  </nav>
  <div class="me">
    Signed in as <strong>${escape(user.displayName)}</strong><br>
    <span class="small">${escape(user.email)}</span><br>
    <form method="post" action="/admin/logout" style="margin-top:.5rem"><button class="btn btn-ghost small">Log out</button></form>
  </div>
</aside>
<main class="main">
${flashHtml}
${body}
</main>
</div>
</body></html>`;
}

function loginPage({ org, error }) {
  const errHtml = error ? `<div class="flash flash-err">${escape(error)}</div>` : "";
  const apex = escape(process.env.APEX_DOMAIN || "scouthosting.com");
  // Google OAuth lives on the apex (single redirect URI). The callback sets
  // a session cookie scoped to COOKIE_DOMAIN; in production that's
  // `.scouthosting.com` so the cookie is valid on this org subdomain too.
  const googleHtml = googleConfigured
    ? `<a class="btn-google" href="https://${apex}/auth/google/start?next=${encodeURIComponent(`https://${org.slug}.${process.env.APEX_DOMAIN || "scouthosting.com"}/admin`)}">
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

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(org.displayName)} — Admin sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:wght@600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:#15181c;background:#fbf8ee;display:grid;place-items:center;min-height:100vh;padding:2rem}
.card{max-width:420px;width:100%;background:#fff;border:1px solid #e6ebe2;border-radius:14px;padding:2rem;box-shadow:0 12px 30px rgba(0,0,0,.05)}
h1{font-family:Fraunces,Georgia,serif;font-size:1.6rem;margin:0 0 .25rem}
p.lede{color:#6b7280;margin:0 0 1.5rem;font-size:.95rem}
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
<p class="lede">Sign in to manage this site.</p>
${errHtml}
${googleHtml}
<form method="post" action="/admin/login" autocomplete="on">
<label>Email<input name="email" type="email" required autocomplete="email"></label>
<label>Password<input name="password" type="password" required autocomplete="current-password"></label>
<button class="btn" type="submit">Sign in</button>
</form>
<small class="help">Founding leader? <a href="https://${apex}/signup.html">Claim your account</a></small>
</div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Auth gate                                                           */
/* ------------------------------------------------------------------ */

async function requireLeader(req, res, next) {
  if (!req.org) return res.status(404).send("Site not found");
  if (!req.user) return res.redirect("/admin/login");
  const role = await roleInOrg(req.user.id, req.org.id);
  if (role !== "admin" && role !== "leader") {
    return res
      .status(403)
      .type("html")
      .send(
        loginPage({
          org: req.org,
          error: `Your account doesn't have admin access to ${req.org.displayName}. Contact a current admin to be added.`,
        })
      );
  }
  req.role = role;
  next();
}

/* ------------------------------------------------------------------ */
/* Login / logout                                                      */
/* ------------------------------------------------------------------ */

adminRouter.get("/login", (req, res) => {
  if (!req.org) return res.status(404).send("Site not found");
  if (req.user) return res.redirect("/admin");
  res.type("html").send(loginPage({ org: req.org }));
});

adminRouter.post("/login", async (req, res) => {
  if (!req.org) return res.status(404).send("Site not found");
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.type("html").send(loginPage({ org: req.org, error: "Email and password required." }));
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) {
    return res.type("html").send(loginPage({ org: req.org, error: "Invalid credentials." }));
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return res.type("html").send(loginPage({ org: req.org, error: "Invalid credentials." }));
  }
  const role = await roleInOrg(user.id, req.org.id);
  if (role !== "admin" && role !== "leader") {
    return res.type("html").send(
      loginPage({
        org: req.org,
        error: `That account isn't an admin of ${req.org.displayName}.`,
      })
    );
  }
  const session = await lucia.createSession(user.id, {});
  res.appendHeader("Set-Cookie", lucia.createSessionCookie(session.id).serialize());
  res.redirect("/admin");
});

adminRouter.post("/logout", async (req, res) => {
  if (req.session) await lucia.invalidateSession(req.session.id);
  res.appendHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
  res.redirect("/admin/login");
});

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

adminRouter.get("/", requireLeader, async (req, res) => {
  const [annCount, page] = await Promise.all([
    prisma.announcement.count({ where: { orgId: req.org.id } }),
    prisma.page.findUnique({ where: { orgId: req.org.id } }),
  ]);
  const body = `
    <h1>Welcome back, ${escape(req.user.displayName)}.</h1>
    <p class="muted">You're an <strong>${escape(req.role)}</strong> of ${escape(req.org.displayName)}.</p>

    <div class="card">
      <h2>Activity feed</h2>
      <p class="muted small">Post text + photos to your unit's home-page timeline.</p>
      <p><a class="btn btn-primary" href="/admin/posts">Compose a post</a></p>
    </div>

    <div class="card">
      <h2>Page content</h2>
      <p class="muted small">${page ? "Custom content is in place." : "Using the seeded defaults — edit it to make this site your own."}</p>
      <p><a class="btn btn-primary" href="/admin/content">Edit page content</a></p>
    </div>

    <div class="card">
      <h2>Announcements</h2>
      <p class="muted small">${annCount} published.</p>
      <p><a class="btn btn-primary" href="/admin/announcements">Manage announcements</a></p>
    </div>

    <div class="card">
      <h2>Calendar</h2>
      <p class="muted small">Add events with directions and a one-click "Add to Google Calendar" button. Members can subscribe the org feed once and get every event in their phone calendar.</p>
      <p><a class="btn btn-primary" href="/admin/events">Manage events</a></p>
    </div>

    <div class="card">
      <h2>Photos &amp; albums</h2>
      <p class="muted small">Upload photos to a new album and they'll appear on your public gallery within seconds.</p>
      <p><a class="btn btn-primary" href="/admin/albums">Manage albums</a></p>
    </div>

    <div class="card">
      <h2>Members &amp; email</h2>
      <p class="muted small">Maintain the directory and send group emails. Members can opt for email, SMS, both, or none.</p>
      <p>
        <a class="btn btn-primary" href="/admin/members">Manage members</a>
        <a class="btn btn-ghost" href="/admin/email">Send broadcast</a>
      </p>
    </div>

    <div class="card">
      <h2>Coming soon</h2>
      <ul class="muted small">
        <li>SMS broadcasts (Twilio) using the smsOptIn / commPreference fields</li>
        <li>Activity feed with optional Facebook cross-post</li>
        <li>RSVP / sign-up sheets on events</li>
      </ul>
    </div>
  `;
  res.type("html").send(layout({ title: "Dashboard", org: req.org, user: req.user, body }));
});

/* ------------------------------------------------------------------ */
/* Page content                                                        */
/* ------------------------------------------------------------------ */

adminRouter.get("/content", requireLeader, async (req, res) => {
  const page = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const v = (k, fallback = "") => escape(page?.[k] ?? fallback);
  const body = `
    <h1>Page content</h1>
    <p class="muted">Anything you save here replaces the default copy on the public site.</p>
    <form class="card" method="post" action="/admin/content">
      <label>Hero headline
        <input name="heroHeadline" type="text" value="${v("heroHeadline")}" placeholder="e.g. Adventure, leadership, and the outdoors — since 1972.">
      </label>
      <label>Hero lede (1–2 sentences)
        <textarea name="heroLede" placeholder="A short pitch that appears under the headline.">${v("heroLede")}</textarea>
      </label>
      <label>About body (paragraphs separated by blank lines)
        <textarea name="aboutBody" rows="8" placeholder="Tell visitors about the troop.">${v("aboutBody")}</textarea>
      </label>
      <label>"Curious? Come visit." body
        <textarea name="joinBody" rows="5" placeholder="What a visitor can expect at their first meeting.">${v("joinBody")}</textarea>
      </label>
      <label>Contact note
        <textarea name="contactNote" rows="3" placeholder="Optional note above the contact info, e.g. 'Email us anytime.'">${v("contactNote")}</textarea>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin">Cancel</a>
        ${page ? `<a class="btn btn-ghost" style="margin-left:auto" href="/admin/content/reset" onclick="return confirm('Reset to defaults?')">Reset to defaults</a>` : ""}
      </div>
    </form>
  `;
  res.type("html").send(layout({ title: "Page content", org: req.org, user: req.user, body }));
});

adminRouter.post("/content", requireLeader, async (req, res) => {
  const fields = ["heroHeadline", "heroLede", "aboutBody", "joinBody", "contactNote"];
  const data = {};
  for (const f of fields) {
    const v = (req.body?.[f] ?? "").toString().trim();
    data[f] = v === "" ? null : v;
  }
  await prisma.page.upsert({
    where: { orgId: req.org.id },
    update: data,
    create: { orgId: req.org.id, ...data },
  });
  res.redirect("/admin/content?saved=1");
});

adminRouter.get("/content/reset", requireLeader, async (req, res) => {
  await prisma.page.deleteMany({ where: { orgId: req.org.id } });
  res.redirect("/admin/content");
});

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

adminRouter.get("/announcements", requireLeader, async (req, res) => {
  const list = await prisma.announcement.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    include: { author: { select: { displayName: true } } },
  });

  const items = list
    .map(
      (a) => `
    <li>
      <div>
        ${a.pinned ? `<span class="pinned">Pinned</span>` : ""}
        <h3>${escape(a.title)}</h3>
        <p>${escape(a.body)}</p>
        <div style="margin-top:.4rem">
          <span class="tag">${escape(a.publishedAt.toISOString().slice(0, 10))}</span>
          ${a.author ? `<span class="tag">by ${escape(a.author.displayName)}</span>` : ""}
          ${a.expiresAt ? `<span class="tag">expires ${escape(a.expiresAt.toISOString().slice(0, 10))}</span>` : ""}
        </div>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/announcements/${escape(a.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/announcements/${escape(a.id)}/delete" onsubmit="return confirm('Delete this announcement?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`
    )
    .join("");

  const body = `
    <h1>Announcements</h1>
    <p class="muted">Short notes pinned to the top of your public site. Use these for one-off updates between events.</p>

    <form class="card" method="post" action="/admin/announcements">
      <h2>New announcement</h2>
      <label>Title<input name="title" type="text" required maxlength="120"></label>
      <label>Body<textarea name="body" required rows="4"></textarea></label>
      <div class="row">
        <label style="margin:0"><input name="pinned" type="checkbox" value="1" style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Pin to the top</label>
        <label style="margin:0;flex:1">Expires (optional)<input name="expiresAt" type="date"></label>
      </div>
      <button class="btn btn-primary" type="submit">Publish</button>
    </form>

    <h2 style="margin-top:1.5rem">Published</h2>
    ${list.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No announcements yet. Publish your first one above.</div>`}
  `;
  res.type("html").send(layout({ title: "Announcements", org: req.org, user: req.user, body }));
});

adminRouter.post("/announcements", requireLeader, async (req, res) => {
  const { title, body, pinned, expiresAt } = req.body || {};
  if (!title?.trim() || !body?.trim()) return res.redirect("/admin/announcements");
  await prisma.announcement.create({
    data: {
      orgId: req.org.id,
      authorId: req.user.id,
      title: title.trim(),
      body: body.trim(),
      pinned: pinned === "1",
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
  res.redirect("/admin/announcements");
});

adminRouter.get("/announcements/:id/edit", requireLeader, async (req, res) => {
  const a = await prisma.announcement.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!a) return res.status(404).send("Not found");
  const body = `
    <h1>Edit announcement</h1>
    <form class="card" method="post" action="/admin/announcements/${escape(a.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${escape(a.title)}"></label>
      <label>Body<textarea name="body" required rows="6">${escape(a.body)}</textarea></label>
      <div class="row">
        <label style="margin:0"><input name="pinned" type="checkbox" value="1" style="width:auto;display:inline;margin-top:0;margin-right:.4rem"${a.pinned ? " checked" : ""}>Pin to the top</label>
        <label style="margin:0;flex:1">Expires (optional)<input name="expiresAt" type="date" value="${a.expiresAt ? a.expiresAt.toISOString().slice(0, 10) : ""}"></label>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/announcements">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout({ title: "Edit announcement", org: req.org, user: req.user, body }));
});

adminRouter.post("/announcements/:id", requireLeader, async (req, res) => {
  const a = await prisma.announcement.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!a) return res.status(404).send("Not found");
  const { title, body, pinned, expiresAt } = req.body || {};
  await prisma.announcement.update({
    where: { id: a.id },
    data: {
      title: title?.trim() || "Untitled",
      body: body?.trim() || "",
      pinned: pinned === "1",
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
  res.redirect("/admin/announcements");
});

adminRouter.post("/announcements/:id/delete", requireLeader, async (req, res) => {
  await prisma.announcement.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/announcements");
});

/* ------------------------------------------------------------------ */
/* Albums + photos                                                     */
/* ------------------------------------------------------------------ */

adminRouter.get("/albums", requireLeader, async (req, res) => {
  const albums = await prisma.album.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
    include: {
      photos: { take: 1, orderBy: { sortOrder: "asc" } },
      _count: { select: { photos: true } },
    },
  });

  const items = albums
    .map(
      (a) => `
    <li>
      <a href="/admin/albums/${escape(a.id)}" style="display:flex;gap:.85rem;align-items:center;text-decoration:none;color:inherit;flex:1">
        <div style="width:64px;height:48px;border-radius:8px;background:${
          a.photos[0]
            ? `center/cover url('/uploads/${escape(a.photos[0].filename)}')`
            : "linear-gradient(135deg,var(--g700),var(--gold))"
        };flex-shrink:0"></div>
        <div>
          <h3>${escape(a.title)}</h3>
          <p>${a._count.photos} photo${a._count.photos === 1 ? "" : "s"}${
            a.takenAt ? ` · ${escape(a.takenAt.toISOString().slice(0, 10))}` : ""
          }${a.visibility === "members" ? ' · <span class="tag">members only</span>' : ""}</p>
        </div>
      </a>
      <form class="inline" method="post" action="/admin/albums/${escape(a.id)}/delete" onsubmit="return confirm('Delete this album and all its photos?')">
        <button class="btn btn-danger small" type="submit">Delete</button>
      </form>
    </li>`
    )
    .join("");

  const body = `
    <h1>Photos &amp; albums</h1>
    <p class="muted">Group photos by event or trip. Each album shows up on your public site automatically.</p>

    <form class="card" method="post" action="/admin/albums">
      <h2>New album</h2>
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. Spring Camporee"></label>
      <label>Description (optional)<textarea name="description" rows="2" maxlength="500"></textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">Date taken (optional)<input name="takenAt" type="date"></label>
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="public" selected>Public</option>
            <option value="members">Members only</option>
          </select>
        </label>
      </div>
      <button class="btn btn-primary" type="submit">Create album</button>
    </form>

    <h2 style="margin-top:1.5rem">Albums</h2>
    ${albums.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No albums yet. Create your first one above.</div>`}
  `;
  res.type("html").send(layout({ title: "Photos & albums", org: req.org, user: req.user, body }));
});

adminRouter.post("/albums", requireLeader, async (req, res) => {
  const { title, description, takenAt, visibility } = req.body || {};
  if (!title?.trim()) return res.redirect("/admin/albums");

  // Derive a unique slug per org.
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let n = 1;
  while (await prisma.album.findUnique({ where: { orgId_slug: { orgId: req.org.id, slug } } })) {
    n++;
    slug = `${baseSlug}-${n}`;
  }

  const album = await prisma.album.create({
    data: {
      orgId: req.org.id,
      title: title.trim(),
      slug,
      description: description?.trim() || null,
      takenAt: takenAt ? new Date(takenAt) : null,
      visibility: visibility === "members" ? "members" : "public",
    },
  });
  res.redirect(`/admin/albums/${album.id}`);
});

adminRouter.get("/albums/:id", requireLeader, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!album) return res.status(404).send("Not found");

  const photos = album.photos
    .map(
      (p) => `
    <figure style="margin:0;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden">
      <img src="/uploads/${escape(p.filename)}" alt="${escape(p.caption ?? "")}" style="display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#eef0e7">
      <figcaption style="padding:.55rem .7rem;font-size:.85rem;display:flex;justify-content:space-between;gap:.5rem;align-items:center">
        <span>${escape(p.caption || p.originalName || "")}</span>
        <form class="inline" method="post" action="/admin/photos/${escape(p.id)}/delete" onsubmit="return confirm('Delete this photo?')">
          <button class="btn btn-danger small" type="submit">×</button>
        </form>
      </figcaption>
    </figure>`
    )
    .join("");

  const body = `
    <h1>${escape(album.title)}</h1>
    <p class="muted small">${album.photos.length} photo${album.photos.length === 1 ? "" : "s"} · ${
      album.visibility === "members" ? "Members only" : "Public"
    } · <a href="/admin/albums">All albums</a></p>

    <form class="card" method="post" action="/admin/albums/${escape(album.id)}/photos" enctype="multipart/form-data">
      <h2>Add photos</h2>
      <label>Choose images (JPEG, PNG, WebP, HEIC; up to 10 MB each, 20 at a time)
        <input name="files" type="file" accept="image/*" multiple required>
      </label>
      <button class="btn btn-primary" type="submit">Upload</button>
    </form>

    <h2 style="margin-top:1.5rem">Photos</h2>
    ${album.photos.length
      ? `<div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem">${photos}</div>`
      : `<div class="empty">No photos yet. Add some above.</div>`}

    <h2 style="margin-top:2rem">Album settings</h2>
    <form class="card" method="post" action="/admin/albums/${escape(album.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${escape(album.title)}"></label>
      <label>Description<textarea name="description" rows="2" maxlength="500">${escape(album.description ?? "")}</textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">Date taken<input name="takenAt" type="date" value="${
          album.takenAt ? album.takenAt.toISOString().slice(0, 10) : ""
        }"></label>
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="public"${album.visibility === "public" ? " selected" : ""}>Public</option>
            <option value="members"${album.visibility === "members" ? " selected" : ""}>Members only</option>
          </select>
        </label>
      </div>
      <button class="btn btn-primary" type="submit">Save settings</button>
    </form>
  `;
  res.type("html").send(layout({ title: album.title, org: req.org, user: req.user, body }));
});

adminRouter.post("/albums/:id", requireLeader, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!album) return res.status(404).send("Not found");
  const { title, description, takenAt, visibility } = req.body || {};
  await prisma.album.update({
    where: { id: album.id },
    data: {
      title: title?.trim() || "Untitled",
      description: description?.trim() || null,
      takenAt: takenAt ? new Date(takenAt) : null,
      visibility: visibility === "members" ? "members" : "public",
    },
  });
  res.redirect(`/admin/albums/${album.id}`);
});

adminRouter.post("/albums/:id/delete", requireLeader, async (req, res) => {
  const album = await prisma.album.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: { photos: { select: { filename: true } } },
  });
  if (!album) return res.status(404).send("Not found");
  // Remove files first, then DB rows (DB cascade handles Photo rows).
  await Promise.all(album.photos.map((p) => removeFile(req.org.id, p.filename)));
  await prisma.album.delete({ where: { id: album.id } });
  res.redirect("/admin/albums");
});

adminRouter.post(
  "/albums/:id/photos",
  requireLeader,
  upload.array("files", 20),
  async (req, res) => {
    const album = await prisma.album.findFirst({
      where: { id: req.params.id, orgId: req.org.id },
      select: { id: true },
    });
    if (!album) return res.status(404).send("Not found");

    const files = req.files || [];
    const lastOrder =
      (await prisma.photo.findFirst({
        where: { albumId: album.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      }))?.sortOrder ?? 0;

    let i = 1;
    for (const f of files) {
      const ext = (path.extname(f.originalname) || ".bin").toLowerCase().slice(0, 8);
      const filename = `${crypto.randomBytes(12).toString("hex")}${ext}`;
      await moveFromTemp(req.org.id, filename, f.path);
      await prisma.photo.create({
        data: {
          orgId: req.org.id,
          albumId: album.id,
          filename,
          originalName: f.originalname,
          mimeType: f.mimetype,
          sizeBytes: f.size,
          sortOrder: lastOrder + i,
        },
      });
      i++;
    }
    res.redirect(`/admin/albums/${album.id}`);
  }
);

adminRouter.post("/photos/:id/delete", requireLeader, async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!photo) return res.status(404).send("Not found");
  await removeFile(photo.orgId, photo.filename);
  await prisma.photo.delete({ where: { id: photo.id } });
  res.redirect(`/admin/albums/${photo.albumId}`);
});

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

const EVENT_CATEGORIES = [
  "Meeting",
  "PLC",
  "Committee",
  "Campout",
  "Service",
  "Court of Honor",
  "Trip",
  "Training",
  "Other",
];

function dtLocal(d) {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(
    x.getHours()
  )}:${pad(x.getMinutes())}`;
}

function parseDtLocal(s) {
  return s ? new Date(s) : null;
}

function eventForm({ event, action, submitLabel }) {
  const v = (k) => escape(event?.[k] ?? "");
  const addr = escape(event?.locationAddress ?? "");
  const startVal = escape(dtLocal(event?.startsAt));
  const endVal = escape(dtLocal(event?.endsAt));
  const cats = EVENT_CATEGORIES.map(
    (c) =>
      `<option value="${escape(c)}"${event?.category === c ? " selected" : ""}>${escape(c)}</option>`
  ).join("");
  return `
    <form class="card" method="post" action="${escape(action)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${v("title")}"></label>
      <label>Description<textarea name="description" rows="4" placeholder="What is this, who's it for, what to bring.">${v("description")}</textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">Starts at<input name="startsAt" type="datetime-local" required value="${startVal}"></label>
        <label style="margin:0;flex:1">Ends at (optional)<input name="endsAt" type="datetime-local" value="${endVal}"></label>
      </div>
      <label style="margin:0"><input name="allDay" type="checkbox" value="1"${event?.allDay ? " checked" : ""} style="width:auto;display:inline;margin-top:0;margin-right:.4rem">All-day event</label>
      <label>Location name<input name="location" type="text" placeholder="e.g. Holy Nativity Lutheran Church" value="${v("location")}"></label>
      <label>Address (used for directions)
        <input name="locationAddress" type="text" placeholder="e.g. 123 Main St, Anytown MN 55400" value="${addr}">
      </label>
      <div class="row">
        <label style="margin:0;flex:1">Category
          <select name="category">
            <option value="">—</option>
            ${cats}
          </select>
        </label>
        <label style="margin:0;flex:1">Cost ($)<input name="cost" type="number" min="0" max="9999" value="${v("cost")}"></label>
        <label style="margin:0;flex:1">Capacity<input name="capacity" type="number" min="0" max="9999" value="${v("capacity")}"></label>
      </div>
      <label style="margin:0"><input name="signupRequired" type="checkbox" value="1"${event?.signupRequired ? " checked" : ""} style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Sign-up required</label>
      <div class="row">
        <button class="btn btn-primary" type="submit">${escape(submitLabel)}</button>
        <a class="btn btn-ghost" href="/admin/events">Cancel</a>
      </div>
    </form>`;
}

function eventDataFromBody(body) {
  const cost = body?.cost ? parseInt(body.cost, 10) : null;
  const capacity = body?.capacity ? parseInt(body.capacity, 10) : null;
  return {
    title: body?.title?.trim() || "Untitled",
    description: body?.description?.trim() || null,
    startsAt: parseDtLocal(body?.startsAt) || new Date(),
    endsAt: parseDtLocal(body?.endsAt),
    allDay: body?.allDay === "1",
    location: body?.location?.trim() || null,
    locationAddress: body?.locationAddress?.trim() || null,
    cost: Number.isFinite(cost) ? cost : null,
    capacity: Number.isFinite(capacity) ? capacity : null,
    signupRequired: body?.signupRequired === "1",
    category: body?.category?.trim() || null,
  };
}

adminRouter.get("/events", requireLeader, async (req, res) => {
  const upcoming = await prisma.event.findMany({
    where: { orgId: req.org.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
  const past = await prisma.event.findMany({
    where: { orgId: req.org.id, startsAt: { lt: new Date() } },
    orderBy: { startsAt: "desc" },
    take: 20,
  });

  const renderRow = (e) => `
    <li>
      <div>
        <h3>${escape(e.title)}</h3>
        <p>${escape(
          e.startsAt.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        )}${e.location ? ` · ${escape(e.location)}` : ""}${
    e.category ? ` <span class="tag">${escape(e.category)}</span>` : ""
  }</p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/rsvps">RSVPs</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/slots">Sign-up sheet</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/events/${escape(e.id)}/delete" onsubmit="return confirm('Delete this event?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`;

  const body = `
    <h1>Calendar</h1>
    <p class="muted">Members can <strong>subscribe</strong> to your event feed and have it on their phone calendar automatically.</p>
    <p class="muted small">Subscription URL: <code>${escape(`https://${req.org.slug}.${process.env.APEX_DOMAIN || "scouthosting.com"}/calendar.ics`)}</code></p>

    <h2 style="margin-top:1.25rem">New event</h2>
    ${eventForm({ event: null, action: "/admin/events", submitLabel: "Create event" })}

    <h2 style="margin-top:1.5rem">Upcoming</h2>
    ${upcoming.length ? `<ul class="items">${upcoming.map(renderRow).join("")}</ul>` : `<div class="empty">Nothing on the calendar yet.</div>`}

    ${
      past.length
        ? `<h2 style="margin-top:2rem">Past (last 20)</h2><ul class="items">${past.map(renderRow).join("")}</ul>`
        : ""
    }
  `;
  res.type("html").send(layout({ title: "Calendar", org: req.org, user: req.user, body }));
});

adminRouter.post("/events", requireLeader, async (req, res) => {
  const data = eventDataFromBody(req.body || {});
  await prisma.event.create({ data: { orgId: req.org.id, ...data } });
  res.redirect("/admin/events");
});

adminRouter.get("/events/:id/edit", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");
  const body = `
    <h1>Edit event</h1>
    ${eventForm({ event: ev, action: `/admin/events/${escape(ev.id)}`, submitLabel: "Save" })}
  `;
  res.type("html").send(layout({ title: "Edit event", org: req.org, user: req.user, body }));
});

adminRouter.post("/events/:id", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");
  const data = eventDataFromBody(req.body || {});
  await prisma.event.update({ where: { id: ev.id }, data });
  res.redirect("/admin/events");
});

adminRouter.post("/events/:id/delete", requireLeader, async (req, res) => {
  await prisma.event.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/events");
});

adminRouter.get("/events/:id/rsvps", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const rsvps = await prisma.rsvp.findMany({
    where: { eventId: ev.id },
    orderBy: [{ response: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { displayName: true, email: true } } },
  });

  const counts = { yes: 0, no: 0, maybe: 0, totalGuests: 0 };
  for (const r of rsvps) {
    counts[r.response]++;
    if (r.response === "yes") counts.totalGuests += r.guests || 0;
  }

  const renderGroup = (label, list) =>
    list.length
      ? `<h2 style="margin-top:1.5rem">${escape(label)} (${list.length})</h2>
        <ul class="items">${list
          .map(
            (r) => `
          <li>
            <div>
              <h3>${escape(r.name)}${r.guests ? ` <span class="tag">+${r.guests} guest${r.guests === 1 ? "" : "s"}</span>` : ""}</h3>
              <p class="muted small">${escape(r.email || "")}${r.notes ? ` · ${escape(r.notes)}` : ""}</p>
            </div>
            <div class="muted small">${escape(r.createdAt.toLocaleDateString("en-US"))}</div>
          </li>`
          )
          .join("")}</ul>`
      : "";

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--mute);text-decoration:none">← Calendar</a>
    <h1>RSVPs · ${escape(ev.title)}</h1>
    <p class="muted">${escape(ev.startsAt.toLocaleString("en-US"))}${ev.location ? ` · ${escape(ev.location)}` : ""}</p>

    ${
      req.query.reminder
        ? `<div class="flash flash-ok">Reminder sent to ${escape(String(req.query.reminder))} member${req.query.reminder === "1" ? "" : "s"}.</div>`
        : ""
    }

    <div class="card" style="display:flex;gap:2rem;align-items:center;margin-top:1rem;flex-wrap:wrap">
      <div><strong style="font-size:1.5rem">${counts.yes}</strong> <span class="muted">going${counts.totalGuests ? ` (+${counts.totalGuests} guests)` : ""}</span></div>
      <div><strong style="font-size:1.5rem">${counts.maybe}</strong> <span class="muted">maybe</span></div>
      <div><strong style="font-size:1.5rem">${counts.no}</strong> <span class="muted">can't make it</span></div>
      <a class="btn btn-ghost small" style="margin-left:auto" href="/admin/events/${escape(ev.id)}/rsvps.csv">Export CSV</a>
    </div>

    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/reminder" style="margin-top:1rem">
      <h2 style="margin-top:0">Send one-click RSVP reminder</h2>
      <p class="muted small">Each recipient gets a personalized email with Yes / Maybe / Can't-make-it buttons that record their response in one click — no login.</p>
      <div class="row">
        <label style="margin:0;flex:1">Audience
          <select name="audience">
            <option value="everyone">Everyone</option>
            <option value="adults">Adults only</option>
            <option value="youth">Youth only</option>
          </select>
        </label>
        <button class="btn btn-primary" type="submit">Send reminder</button>
      </div>
    </form>

    ${renderGroup("Going", rsvps.filter((r) => r.response === "yes"))}
    ${renderGroup("Maybe", rsvps.filter((r) => r.response === "maybe"))}
    ${renderGroup("Can't make it", rsvps.filter((r) => r.response === "no"))}

    ${rsvps.length === 0 ? `<div class="empty" style="margin-top:1rem">No responses yet.</div>` : ""}
  `;
  res.type("html").send(layout({ title: `RSVPs · ${ev.title}`, org: req.org, user: req.user, body }));
});

// Send a one-click-RSVP reminder for an event. Composes a personalized
// email per member with HMAC-signed Yes/No/Maybe links so recipients can
// respond directly from their inbox without logging in.
adminRouter.post("/events/:id/reminder", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const audience = req.body?.audience || "everyone";
  const where = { orgId: req.org.id, email: { not: null } };
  if (audience === "adults") where.isYouth = false;
  else if (audience === "youth") where.isYouth = true;
  else if (audience === "patrol" && req.body?.patrol) where.patrol = req.body.patrol;

  const all = await prisma.member.findMany({ where });
  const recipients = all.filter(
    (m) => m.email && (m.commPreference === "email" || m.commPreference === "both")
  );

  const apex = process.env.APEX_DOMAIN || "scouthosting.com";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const base = `${protocol}://${req.org.slug}.${apex}${
    process.env.PORT && process.env.NODE_ENV !== "production" ? `:${process.env.PORT}` : ""
  }`;

  const when = ev.startsAt.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const messages = recipients.map((m) => {
    const name = `${m.firstName} ${m.lastName}`;
    const token = makeRsvpToken({ eventId: ev.id, name, email: m.email });
    const yesUrl = `${base}/rsvp/${token}?response=yes`;
    const noUrl = `${base}/rsvp/${token}?response=no`;
    const maybeUrl = `${base}/rsvp/${token}?response=maybe`;
    const eventUrl = `${base}/events/${ev.id}`;
    const text = `Hi ${m.firstName},

Quick RSVP for ${ev.title} — ${when}${ev.location ? ` at ${ev.location}` : ""}.

  Going:        ${yesUrl}
  Maybe:        ${maybeUrl}
  Can't make it: ${noUrl}

Event details: ${eventUrl}

— ${req.org.displayName}`;
    return {
      to: m.email,
      subject: `RSVP: ${ev.title}`,
      text,
      from: `${req.org.displayName} <noreply@${req.org.slug}.${apex}>`,
      replyTo: req.user.email,
    };
  });

  const result = await sendBatch(messages);

  await prisma.mailLog.create({
    data: {
      orgId: req.org.id,
      authorId: req.user.id,
      subject: `RSVP: ${ev.title}`,
      body: `Reminder with one-click Yes/No/Maybe links for ${ev.title}.`,
      channel: "email",
      audienceLabel:
        audience === "patrol"
          ? `Patrol: ${req.body?.patrol || "—"}`
          : audience === "adults"
          ? "Adults only"
          : audience === "youth"
          ? "Youth only"
          : "Everyone",
      recipientCount: result.sent,
      status: result.errors.length === 0 ? "sent" : result.sent > 0 ? "partial" : "failed",
      errors: result.errors.length ? JSON.stringify(result.errors) : null,
      recipients: recipients.map((m) => ({
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        channel: "email",
      })),
    },
  });

  res.redirect(`/admin/events/${ev.id}/rsvps?reminder=${result.sent}`);
});

adminRouter.get("/events/:id/rsvps.csv", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, title: true },
  });
  if (!ev) return res.status(404).send("Not found");
  const rsvps = await prisma.rsvp.findMany({
    where: { eventId: ev.id },
    orderBy: [{ response: "asc" }, { createdAt: "asc" }],
  });
  const csvEscape = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Name", "Email", "Response", "Guests", "Notes", "RSVP'd at"]];
  for (const r of rsvps) {
    rows.push([r.name, r.email || "", r.response, r.guests, r.notes || "", r.createdAt.toISOString()]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  const safeTitle = ev.title.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60);
  res
    .set("Content-Type", "text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="rsvps-${safeTitle}.csv"`)
    .send(csv);
});

/* ------------------------------------------------------------------ */
/* Sign-up slots (drivers, food, gear)                                 */
/* ------------------------------------------------------------------ */

adminRouter.get("/events/:id/slots", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const slots = await prisma.signupSlot.findMany({
    where: { eventId: ev.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { assignments: { orderBy: { createdAt: "asc" } } },
  });

  const renderSlot = (s) => `
    <li>
      <div style="flex:1">
        <h3>${escape(s.title)}${
          s.capacity > 1 ? ` <span class="tag">${s.assignments.length} of ${s.capacity}</span>` : ""
        }${s.capacity === 1 && s.assignments.length === 1 ? ` <span class="tag">filled</span>` : ""}</h3>
        ${s.description ? `<p class="muted small">${escape(s.description)}</p>` : ""}
        ${
          s.assignments.length
            ? `<p class="muted small">${s.assignments
                .map((a) => escape(a.name))
                .join(", ")}</p>`
            : `<p class="muted small">No takers yet.</p>`
        }
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/events/${escape(ev.id)}/slots/${escape(s.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/slots/${escape(s.id)}/delete" onsubmit="return confirm('Delete this slot?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`;

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--mute);text-decoration:none">← Calendar</a>
    <h1>Sign-up sheet · ${escape(ev.title)}</h1>
    <p class="muted">Add slots for what your unit needs covered: drivers, food items, gear. Anyone who can see the event can claim a slot — no login required.</p>

    <h2 style="margin-top:1.25rem">Add a slot</h2>
    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/slots">
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. Drive 2 scouts, Bring drinks for 30"></label>
      <label>Description (optional)<textarea name="description" rows="2" maxlength="500"></textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">How many people needed
          <input name="capacity" type="number" required min="1" max="50" value="1">
        </label>
      </div>
      <button class="btn btn-primary" type="submit">Add slot</button>
    </form>

    <h2 style="margin-top:1.5rem">Slots</h2>
    ${slots.length ? `<ul class="items">${slots.map(renderSlot).join("")}</ul>` : `<div class="empty">No slots yet. Add one above.</div>`}
  `;
  res.type("html").send(layout({ title: `Sign-up sheet · ${ev.title}`, org: req.org, user: req.user, body }));
});

adminRouter.post("/events/:id/slots", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");

  const last = await prisma.signupSlot.findFirst({
    where: { eventId: ev.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.signupSlot.create({
    data: {
      orgId: req.org.id,
      eventId: ev.id,
      title: req.body?.title?.trim() || "Untitled",
      description: req.body?.description?.trim() || null,
      capacity: Math.max(1, Math.min(50, parseInt(req.body?.capacity, 10) || 1)),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  res.redirect(`/admin/events/${ev.id}/slots`);
});

adminRouter.get("/events/:id/slots/:slotId/edit", requireLeader, async (req, res) => {
  const slot = await prisma.signupSlot.findFirst({
    where: { id: req.params.slotId, orgId: req.org.id, eventId: req.params.id },
  });
  if (!slot) return res.status(404).send("Not found");
  const v = (k) => escape(slot[k] ?? "");
  const body = `
    <a class="back" href="/admin/events/${escape(req.params.id)}/slots" style="display:inline-block;margin-bottom:.6rem;color:var(--mute);text-decoration:none">← Sign-up sheet</a>
    <h1>Edit slot</h1>
    <form class="card" method="post" action="/admin/events/${escape(req.params.id)}/slots/${escape(slot.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${v("title")}"></label>
      <label>Description<textarea name="description" rows="2" maxlength="500">${v("description")}</textarea></label>
      <label>How many people needed<input name="capacity" type="number" required min="1" max="50" value="${v("capacity")}"></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/events/${escape(req.params.id)}/slots">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout({ title: "Edit slot", org: req.org, user: req.user, body }));
});

adminRouter.post("/events/:id/slots/:slotId", requireLeader, async (req, res) => {
  const slot = await prisma.signupSlot.findFirst({
    where: { id: req.params.slotId, orgId: req.org.id, eventId: req.params.id },
    select: { id: true },
  });
  if (!slot) return res.status(404).send("Not found");
  await prisma.signupSlot.update({
    where: { id: slot.id },
    data: {
      title: req.body?.title?.trim() || "Untitled",
      description: req.body?.description?.trim() || null,
      capacity: Math.max(1, Math.min(50, parseInt(req.body?.capacity, 10) || 1)),
    },
  });
  res.redirect(`/admin/events/${req.params.id}/slots`);
});

adminRouter.post("/events/:id/slots/:slotId/delete", requireLeader, async (req, res) => {
  await prisma.signupSlot.deleteMany({
    where: { id: req.params.slotId, orgId: req.org.id, eventId: req.params.id },
  });
  res.redirect(`/admin/events/${req.params.id}/slots`);
});

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

const COMM_PREFS = [
  { value: "email", label: "Email only" },
  { value: "sms", label: "Text only" },
  { value: "both", label: "Email and text" },
  { value: "none", label: "Do not contact" },
];

function memberFromBody(body) {
  return {
    firstName: body?.firstName?.trim() || "",
    lastName: body?.lastName?.trim() || "",
    email: body?.email?.trim().toLowerCase() || null,
    phone: body?.phone?.trim() || null,
    patrol: body?.patrol?.trim() || null,
    position: body?.position?.trim() || null,
    isYouth: body?.isYouth === "1",
    commPreference: ["email", "sms", "both", "none"].includes(body?.commPreference)
      ? body.commPreference
      : "email",
    smsOptIn: body?.smsOptIn === "1",
    notes: body?.notes?.trim() || null,
  };
}

function memberForm({ member, action, submitLabel }) {
  const v = (k) => escape(member?.[k] ?? "");
  const checked = (cond) => (cond ? " checked" : "");
  const sel = (cond) => (cond ? " selected" : "");
  return `
    <form class="card" method="post" action="${escape(action)}">
      <div class="row">
        <label style="margin:0;flex:1">First name<input name="firstName" type="text" required maxlength="60" value="${v("firstName")}"></label>
        <label style="margin:0;flex:1">Last name<input name="lastName" type="text" required maxlength="60" value="${v("lastName")}"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Email<input name="email" type="email" maxlength="120" value="${v("email")}"></label>
        <label style="margin:0;flex:1">Phone<input name="phone" type="tel" maxlength="40" value="${v("phone")}"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Patrol<input name="patrol" type="text" maxlength="40" value="${v("patrol")}"></label>
        <label style="margin:0;flex:1">Position<input name="position" type="text" maxlength="60" placeholder="e.g. SPL, Scoutmaster" value="${v("position")}"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Communication preference
          <select name="commPreference">
            ${COMM_PREFS.map(
              (o) =>
                `<option value="${escape(o.value)}"${sel(member?.commPreference === o.value)}>${escape(o.label)}</option>`
            ).join("")}
          </select>
        </label>
        <label style="margin:0;flex:1;align-self:end">
          <input name="smsOptIn" type="checkbox" value="1"${checked(member?.smsOptIn)} style="width:auto;display:inline;margin-top:0;margin-right:.4rem">SMS opt-in
        </label>
      </div>
      <label style="margin:0"><input name="isYouth" type="checkbox" value="1"${checked(
        member ? member.isYouth : true
      )} style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Youth member (otherwise adult)</label>
      <label>Notes<textarea name="notes" rows="2">${v("notes")}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">${escape(submitLabel)}</button>
        <a class="btn btn-ghost" href="/admin/members">Cancel</a>
      </div>
    </form>`;
}

adminRouter.get("/members", requireLeader, async (req, res) => {
  const members = await prisma.member.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ isYouth: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
  const youth = members.filter((m) => m.isYouth);
  const adults = members.filter((m) => !m.isYouth);

  const renderRow = (m) => `
    <li>
      <div>
        <h3>${escape(m.firstName)} ${escape(m.lastName)}</h3>
        <p>${m.patrol ? `<span class="tag">${escape(m.patrol)}</span>` : ""}${
    m.position ? `<span class="tag">${escape(m.position)}</span>` : ""
  } ${m.email ? `<span class="muted small">${escape(m.email)}</span>` : ""}${
    m.phone ? ` <span class="muted small">· ${escape(m.phone)}</span>` : ""
  }${m.commPreference !== "email" ? ` <span class="tag">${escape(m.commPreference)}</span>` : ""}</p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/members/${escape(m.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/members/${escape(m.id)}/delete" onsubmit="return confirm('Remove this member from the directory?')">
          <button class="btn btn-danger small" type="submit">Remove</button>
        </form>
      </div>
    </li>`;

  const body = `
    <h1>Members</h1>
    <p class="muted">${members.length} on the roster · ${youth.length} youth · ${adults.length} adults</p>

    <h2 style="margin-top:1rem">Add a member</h2>
    ${memberForm({ member: null, action: "/admin/members", submitLabel: "Add member" })}

    <p style="margin-top:1rem"><a class="btn btn-ghost" href="/admin/members/import">Bulk import from CSV →</a></p>

    ${
      youth.length
        ? `<h2 style="margin-top:2rem">Youth</h2><ul class="items">${youth.map(renderRow).join("")}</ul>`
        : ""
    }
    ${
      adults.length
        ? `<h2 style="margin-top:2rem">Adults</h2><ul class="items">${adults.map(renderRow).join("")}</ul>`
        : ""
    }
    ${members.length === 0 ? `<div class="empty" style="margin-top:1rem">No members yet. Add one above or import a CSV.</div>` : ""}
  `;
  res.type("html").send(layout({ title: "Members", org: req.org, user: req.user, body }));
});

adminRouter.post("/members", requireLeader, async (req, res) => {
  const data = memberFromBody(req.body || {});
  if (!data.firstName || !data.lastName) return res.redirect("/admin/members");
  await prisma.member.create({ data: { orgId: req.org.id, ...data } });
  res.redirect("/admin/members");
});

adminRouter.get("/members/import", requireLeader, async (req, res) => {
  const body = `
    <h1>Bulk import members</h1>
    <p class="muted">Paste CSV with a header row. Recognized column names (case-insensitive):</p>
    <p class="muted small"><code>firstName, lastName, email, phone, patrol, position, isYouth, commPreference, smsOptIn, notes</code></p>
    <form class="card" method="post" action="/admin/members/import">
      <label>CSV
        <textarea name="csv" rows="10" required placeholder="firstName,lastName,email,patrol,isYouth&#10;Alex,Park,alex@example.com,Eagles,1&#10;Pat,Adams,pat@example.com,,0"></textarea>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Import</button>
        <a class="btn btn-ghost" href="/admin/members">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout({ title: "Import members", org: req.org, user: req.user, body }));
});

// Tiny CSV parser — handles quoted fields and embedded commas/quotes.
function parseCsv(text) {
  const rows = [];
  let cur = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

adminRouter.post("/members/import", requireLeader, async (req, res) => {
  const text = String(req.body?.csv || "").trim();
  if (!text) return res.redirect("/admin/members");
  const rows = parseCsv(text);
  if (rows.length < 2) return res.redirect("/admin/members");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (k) => header.indexOf(k.toLowerCase());
  const truthy = (v) => /^(1|true|yes|y)$/i.test(String(v || "").trim());

  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => {
      const i = idx(k);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const firstName = get("firstName") || get("first_name") || get("first");
    const lastName = get("lastName") || get("last_name") || get("last");
    if (!firstName || !lastName) continue;
    const pref = get("commPreference") || get("comm") || "email";
    data.push({
      orgId: req.org.id,
      firstName,
      lastName,
      email: (get("email") || "").toLowerCase() || null,
      phone: get("phone") || null,
      patrol: get("patrol") || null,
      position: get("position") || null,
      isYouth: get("isYouth") ? truthy(get("isYouth")) : true,
      commPreference: ["email", "sms", "both", "none"].includes(pref.toLowerCase())
        ? pref.toLowerCase()
        : "email",
      smsOptIn: truthy(get("smsOptIn") || get("sms_opt_in")),
      notes: get("notes") || null,
    });
  }
  if (data.length) {
    await prisma.member.createMany({ data });
  }
  res.redirect("/admin/members");
});

adminRouter.get("/members/:id/edit", requireLeader, async (req, res) => {
  const member = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!member) return res.status(404).send("Not found");
  const body = `
    <h1>Edit member</h1>
    ${memberForm({ member, action: `/admin/members/${escape(member.id)}`, submitLabel: "Save" })}
  `;
  res.type("html").send(layout({ title: "Edit member", org: req.org, user: req.user, body }));
});

adminRouter.post("/members/:id", requireLeader, async (req, res) => {
  const member = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!member) return res.status(404).send("Not found");
  const data = memberFromBody(req.body || {});
  if (!data.firstName || !data.lastName) return res.redirect(`/admin/members/${member.id}/edit`);
  await prisma.member.update({ where: { id: member.id }, data });
  res.redirect("/admin/members");
});

adminRouter.post("/members/:id/delete", requireLeader, async (req, res) => {
  await prisma.member.deleteMany({ where: { id: req.params.id, orgId: req.org.id } });
  res.redirect("/admin/members");
});

/* ------------------------------------------------------------------ */
/* Email broadcast                                                     */
/* ------------------------------------------------------------------ */

const AUDIENCES = [
  { value: "everyone", label: "Everyone" },
  { value: "adults", label: "Adults only" },
  { value: "youth", label: "Youth only" },
  { value: "patrol", label: "Specific patrol…" },
];

async function audienceFor(orgId, kind, patrol) {
  const where = { orgId };
  if (kind === "adults") where.isYouth = false;
  else if (kind === "youth") where.isYouth = true;
  else if (kind === "patrol" && patrol) where.patrol = patrol;
  return prisma.member.findMany({ where });
}

adminRouter.get("/email", requireLeader, async (req, res) => {
  const patrols = await prisma.member.findMany({
    where: { orgId: req.org.id, patrol: { not: null } },
    distinct: ["patrol"],
    select: { patrol: true },
    orderBy: { patrol: "asc" },
  });
  const patrolOptions = patrols
    .map((p) => `<option value="${escape(p.patrol)}">${escape(p.patrol)}</option>`)
    .join("");

  const body = `
    <h1>Send a broadcast</h1>
    <p class="muted">Compose once and we'll fan out to every member based on their communication preference. SMS isn't wired yet — for now this sends email to anyone whose preference is <em>email</em> or <em>both</em>.</p>
    <p class="muted small">Mail driver: <code>${escape(mailDriver)}</code>${
    mailDriver === "console"
      ? ` — sends are logged to the server console (no real email leaves your machine).`
      : ""
  }</p>

    <form class="card" method="post" action="/admin/email">
      <div class="row">
        <label style="margin:0;flex:1">Audience
          <select name="audience">
            ${AUDIENCES.map(
              (a) => `<option value="${escape(a.value)}">${escape(a.label)}</option>`
            ).join("")}
          </select>
        </label>
        <label style="margin:0;flex:1">Patrol (if "Specific patrol")
          <select name="patrol">
            <option value="">—</option>
            ${patrolOptions}
          </select>
        </label>
      </div>
      <label>Subject<input name="subject" type="text" required maxlength="200"></label>
      <label>Body
        <textarea name="body" rows="8" required placeholder="What you want to tell them. Plain text — paragraphs are preserved."></textarea>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit" name="action" value="preview">Preview audience</button>
        <button class="btn btn-primary" type="submit" name="action" value="send">Send now</button>
        <a class="btn btn-ghost" href="/admin/email/sent" style="margin-left:auto">History →</a>
      </div>
    </form>
  `;
  res.type("html").send(layout({ title: "Email broadcast", org: req.org, user: req.user, body }));
});

adminRouter.post("/email", requireLeader, async (req, res) => {
  const { audience, patrol, subject, body, action } = req.body || {};
  const orgId = req.org.id;

  const all = await audienceFor(orgId, audience, patrol);
  // Filter by communication preference for the email channel.
  const recipients = all.filter(
    (m) => m.email && (m.commPreference === "email" || m.commPreference === "both")
  );

  if (action === "preview") {
    const list = all
      .map(
        (m) =>
          `<li>${escape(m.firstName)} ${escape(m.lastName)}${m.patrol ? ` <span class="tag">${escape(m.patrol)}</span>` : ""} <span class="muted small">${escape(m.email || "(no email)")} · pref:${escape(m.commPreference)}</span></li>`
      )
      .join("");
    const willGetEmail = recipients.length;
    const noEmailReachable =
      all.length -
      all.filter(
        (m) => m.email && (m.commPreference === "email" || m.commPreference === "both")
      ).length;

    const previewBody = `
      <h1>Audience preview</h1>
      <p class="muted">${all.length} member${all.length === 1 ? "" : "s"} match. Of those, <strong>${willGetEmail}</strong> will receive this email — ${noEmailReachable} will be skipped (no email on file or pref disables it).</p>
      <ul class="items">${list || `<li class="empty">Nobody matches this audience.</li>`}</ul>
      <p style="margin-top:1.25rem"><a class="btn btn-ghost" href="/admin/email">← Back to compose</a></p>
    `;
    return res
      .type("html")
      .send(layout({ title: "Audience preview", org: req.org, user: req.user, body: previewBody }));
  }

  if (!subject?.trim() || !body?.trim()) return res.redirect("/admin/email");

  const messages = recipients.map((m) => ({
    to: m.email,
    subject: subject.trim(),
    text: body.trim(),
    from: `${req.org.displayName} <noreply@${req.org.slug}.${process.env.APEX_DOMAIN || "scouthosting.com"}>`,
    replyTo: req.user.email,
  }));

  const result = await sendBatch(messages);

  const audienceLabel =
    audience === "patrol"
      ? `Patrol: ${patrol || "—"}`
      : (AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone");

  await prisma.mailLog.create({
    data: {
      orgId,
      authorId: req.user.id,
      subject: subject.trim(),
      body: body.trim(),
      channel: "email",
      audienceLabel,
      recipientCount: result.sent,
      status: result.errors.length === 0 ? "sent" : result.sent > 0 ? "partial" : "failed",
      errors: result.errors.length ? JSON.stringify(result.errors) : null,
      recipients: recipients.map((m) => ({
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        channel: "email",
      })),
    },
  });

  const ack = `
    <h1>Sent</h1>
    <p>Delivered to <strong>${result.sent}</strong> recipient${result.sent === 1 ? "" : "s"}${
    result.errors.length ? ` (${result.errors.length} failed)` : ""
  }.</p>
    ${
      result.errors.length
        ? `<details class="card"><summary>Errors</summary><pre>${escape(JSON.stringify(result.errors, null, 2))}</pre></details>`
        : ""
    }
    <p style="margin-top:1.25rem">
      <a class="btn btn-primary" href="/admin/email">Send another</a>
      <a class="btn btn-ghost" href="/admin/email/sent">View history</a>
    </p>
  `;
  res.type("html").send(layout({ title: "Sent", org: req.org, user: req.user, body: ack }));
});

adminRouter.get("/email/sent", requireLeader, async (req, res) => {
  const log = await prisma.mailLog.findMany({
    where: { orgId: req.org.id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  const items = log
    .map(
      (m) => `
    <li>
      <div>
        <h3>${escape(m.subject)}</h3>
        <p>
          <span class="tag">${escape(m.audienceLabel)}</span>
          <span class="tag">${escape(m.channel)}</span>
          <span class="tag">${escape(m.status)}</span>
          <span class="muted small">${escape(m.sentAt.toLocaleString("en-US"))}</span>
          <span class="muted small">· ${m.recipientCount} sent</span>
        </p>
      </div>
    </li>`
    )
    .join("");

  const body = `
    <h1>Email history</h1>
    <p class="muted">Last 50 broadcasts.</p>
    ${log.length ? `<ul class="items">${items}</ul>` : `<div class="empty">Nothing has been sent yet.</div>`}
    <p style="margin-top:1.25rem"><a class="btn btn-ghost" href="/admin/email">← Compose</a></p>
  `;
  res.type("html").send(layout({ title: "Email history", org: req.org, user: req.user, body }));
});

/* ------------------------------------------------------------------ */
/* Activity feed (Posts)                                               */
/* ------------------------------------------------------------------ */

adminRouter.get("/posts", requireLeader, async (req, res) => {
  const posts = await prisma.post.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: {
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      _count: { select: { photos: true } },
      author: { select: { displayName: true } },
    },
  });

  const items = posts
    .map(
      (p) => `
    <li>
      <div style="flex:1">
        ${p.pinned ? `<span class="pinned">Pinned</span>` : ""}
        <h3>${escape(p.title || p.body.slice(0, 60))}</h3>
        <p class="muted small">
          <span class="tag">${escape(p.visibility === "members" ? "Members only" : "Public")}</span>
          <span class="tag">${p._count.photos} photo${p._count.photos === 1 ? "" : "s"}</span>
          ${p.author ? `by ${escape(p.author.displayName)} · ` : ""}${escape(p.publishedAt.toLocaleDateString("en-US"))}
        </p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/posts/${escape(p.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/posts/${escape(p.id)}/delete" onsubmit="return confirm('Delete this post?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`
    )
    .join("");

  const body = `
    <h1>Activity feed</h1>
    <p class="muted">A timeline post can carry text, photos, or both. Posts show up on your public home page; older Announcements + Albums still render in their own sections.</p>

    <form class="card" method="post" action="/admin/posts" enctype="multipart/form-data">
      <h2 style="margin-top:0">New post</h2>
      <label>Headline (optional)<input name="title" type="text" maxlength="120" placeholder="e.g. Camporee recap"></label>
      <label>Body<textarea name="body" rows="4" required placeholder="What happened? Plain text — paragraphs preserved."></textarea></label>
      <label>Photos (optional, JPEG/PNG/WebP up to 10 MB each)
        <input name="files" type="file" accept="image/*" multiple>
      </label>
      <div class="row">
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="public">Public</option>
            <option value="members">Members only</option>
          </select>
        </label>
        <label style="margin:0"><input name="pinned" type="checkbox" value="1" style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Pin to the top</label>
      </div>
      <button class="btn btn-primary" type="submit">Publish</button>
    </form>

    <h2 style="margin-top:1.25rem">Published</h2>
    ${posts.length ? `<ul class="items">${items}</ul>` : `<div class="empty">Nothing posted yet.</div>`}
  `;
  res.type("html").send(layout({ title: "Activity feed", org: req.org, user: req.user, body }));
});

adminRouter.post("/posts", requireLeader, upload.array("files", 12), async (req, res) => {
  const { title, body, visibility, pinned } = req.body || {};
  if (!body?.trim()) return res.redirect("/admin/posts");

  const post = await prisma.post.create({
    data: {
      orgId: req.org.id,
      authorId: req.user.id,
      title: title?.trim() || null,
      body: body.trim(),
      visibility: visibility === "members" ? "members" : "public",
      pinned: pinned === "1",
    },
  });

  const files = req.files || [];
  let i = 1;
  for (const f of files) {
    const ext = (path.extname(f.originalname) || ".bin").toLowerCase().slice(0, 8);
    const filename = `${crypto.randomBytes(12).toString("hex")}${ext}`;
    await moveFromTemp(req.org.id, filename, f.path);
    await prisma.postPhoto.create({
      data: {
        orgId: req.org.id,
        postId: post.id,
        filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        sizeBytes: f.size,
        sortOrder: i,
      },
    });
    i++;
  }
  res.redirect("/admin/posts");
});

adminRouter.get("/posts/:id/edit", requireLeader, async (req, res) => {
  const post = await prisma.post.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: { photos: { orderBy: { sortOrder: "asc" } } },
  });
  if (!post) return res.status(404).send("Not found");
  const v = (k) => escape(post[k] ?? "");
  const checked = (cond) => (cond ? " checked" : "");

  const photoTiles = post.photos
    .map(
      (ph) => `
      <figure style="margin:0;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden">
        <img src="/uploads/${escape(ph.filename)}" style="display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#eef0e7">
        <figcaption style="padding:.5rem .65rem;font-size:.85rem;display:flex;justify-content:space-between;gap:.5rem;align-items:center">
          <span class="muted small">${escape(ph.originalName ?? "")}</span>
          <form class="inline" method="post" action="/admin/posts/${escape(post.id)}/photos/${escape(ph.id)}/delete" onsubmit="return confirm('Remove this photo?')">
            <button class="btn btn-danger small" type="submit">×</button>
          </form>
        </figcaption>
      </figure>`
    )
    .join("");

  const body = `
    <a class="back" href="/admin/posts" style="display:inline-block;margin-bottom:.6rem;color:var(--mute);text-decoration:none">← Activity feed</a>
    <h1>Edit post</h1>
    <form class="card" method="post" action="/admin/posts/${escape(post.id)}" enctype="multipart/form-data">
      <label>Headline<input name="title" type="text" maxlength="120" value="${v("title")}"></label>
      <label>Body<textarea name="body" rows="6" required>${v("body")}</textarea></label>
      <label>Add more photos<input name="files" type="file" accept="image/*" multiple></label>
      <div class="row">
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="public"${post.visibility === "public" ? " selected" : ""}>Public</option>
            <option value="members"${post.visibility === "members" ? " selected" : ""}>Members only</option>
          </select>
        </label>
        <label style="margin:0"><input name="pinned" type="checkbox" value="1"${checked(post.pinned)} style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Pin to the top</label>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/posts">Cancel</a>
      </div>
    </form>

    ${
      post.photos.length
        ? `<h2 style="margin-top:1.5rem">Attached photos</h2>
           <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem">${photoTiles}</div>`
        : ""
    }
  `;
  res.type("html").send(layout({ title: "Edit post", org: req.org, user: req.user, body }));
});

adminRouter.post("/posts/:id", requireLeader, upload.array("files", 12), async (req, res) => {
  const post = await prisma.post.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!post) return res.status(404).send("Not found");
  const { title, body, visibility, pinned } = req.body || {};
  await prisma.post.update({
    where: { id: post.id },
    data: {
      title: title?.trim() || null,
      body: body?.trim() || "",
      visibility: visibility === "members" ? "members" : "public",
      pinned: pinned === "1",
    },
  });

  const last = await prisma.postPhoto.findFirst({
    where: { postId: post.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let i = (last?.sortOrder ?? 0) + 1;
  for (const f of req.files || []) {
    const ext = (path.extname(f.originalname) || ".bin").toLowerCase().slice(0, 8);
    const filename = `${crypto.randomBytes(12).toString("hex")}${ext}`;
    await moveFromTemp(req.org.id, filename, f.path);
    await prisma.postPhoto.create({
      data: {
        orgId: req.org.id,
        postId: post.id,
        filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        sizeBytes: f.size,
        sortOrder: i++,
      },
    });
  }
  res.redirect("/admin/posts");
});

adminRouter.post("/posts/:id/photos/:photoId/delete", requireLeader, async (req, res) => {
  const photo = await prisma.postPhoto.findFirst({
    where: { id: req.params.photoId, orgId: req.org.id, postId: req.params.id },
  });
  if (!photo) return res.status(404).send("Not found");
  await removeFile(photo.orgId, photo.filename);
  await prisma.postPhoto.delete({ where: { id: photo.id } });
  res.redirect(`/admin/posts/${req.params.id}/edit`);
});

adminRouter.post("/posts/:id/delete", requireLeader, async (req, res) => {
  const post = await prisma.post.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: { photos: { select: { filename: true } } },
  });
  if (!post) return res.status(404).send("Not found");
  await Promise.all(post.photos.map((p) => removeFile(req.org.id, p.filename)));
  await prisma.post.delete({ where: { id: post.id } });
  res.redirect("/admin/posts");
});

/* ------------------------------------------------------------------ */
/* Multer error handler — turns oversized/wrong-type into a flash      */
/* ------------------------------------------------------------------ */

adminRouter.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError || /Unsupported file type/.test(err.message)) {
    const back = req.get("Referer") || "/admin/albums";
    return res.status(400).type("html").send(
      `<!doctype html><meta charset="utf-8"><title>Upload error</title>
<style>body{font-family:system-ui;max-width:520px;margin:4rem auto;padding:0 1.25rem;color:#15181c}
a{color:#1d6b39}</style>
<h1>Upload error</h1>
<p>${escape(err.message)}</p>
<p><a href="${escape(back)}">← Back</a></p>`
    );
  }
  throw err;
});
