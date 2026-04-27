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
import { prisma } from "../lib/db.js";
import { lucia, verifyPassword, roleInOrg } from "../lib/auth.js";

export const adminRouter = express.Router();

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
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.65rem 1rem;border-radius:9px;margin-bottom:1rem;font-size:.92rem}
small.help{display:block;color:#6b7280;margin-top:1rem;font-size:.85rem;text-align:center}
small.help a{color:${escape(org.primaryColor || "#1d6b39")}}
</style></head><body>
<form class="card" method="post" action="/admin/login" autocomplete="on">
<h1>${escape(org.displayName)}</h1>
<p class="lede">Sign in to manage this site.</p>
${errHtml}
<label>Email<input name="email" type="email" required autocomplete="email"></label>
<label>Password<input name="password" type="password" required autocomplete="current-password"></label>
<button class="btn" type="submit">Sign in</button>
<small class="help">Founding leader? <a href="https://${escape(process.env.APEX_DOMAIN || "scouthosting.com")}/signup.html">Claim your account</a></small>
</form></body></html>`;
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
      <h2>Coming soon</h2>
      <ul class="muted small">
        <li>Photos &amp; albums</li>
        <li>Calendar &amp; events with Google Calendar add-button and Maps directions</li>
        <li>Member directory and group email</li>
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
