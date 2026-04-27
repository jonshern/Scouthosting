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
    <a href="/admin/content">Page content</a>
    <a href="/admin/announcements">Announcements</a>
    <a href="/admin/albums">Photos &amp; albums</a>
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
      <h2>Photos &amp; albums</h2>
      <p class="muted small">Upload photos to a new album and they'll appear on your public gallery within seconds.</p>
      <p><a class="btn btn-primary" href="/admin/albums">Manage albums</a></p>
    </div>

    <div class="card">
      <h2>Coming soon</h2>
      <ul class="muted small">
        <li>Calendar &amp; events with Google Calendar add-button and Maps directions</li>
        <li>Member directory with text vs email preference, and group email</li>
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
