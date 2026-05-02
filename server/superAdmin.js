// Super-admin console at /__super on the apex.
//
// Provision orgs, suspend / unsuspend, toggle feature flags per org,
// triage SupportTickets, issue Refunds, and inspect billing snapshots.
//
// Auth: User.isSuperAdmin must be true. The flag is granted out of
// band — there is no HTTP form that sets it, anywhere. A super-admin
// session uses the regular Lucia cookie (compass_session), so they
// log in at /login.html on the apex like anyone else and the gate
// here just checks the flag.
//
// Routes are wrapped by a single requireSuperAdmin middleware. All
// state-changing routes write an AuditLog row with action prefixed
// "super:" so the trail of operator actions is searchable.

import express from "express";
import { prisma } from "../lib/db.js";
import { lucia } from "../lib/auth.js";
import { logger } from "../lib/log.js";
import {
  FEATURE_FLAGS,
  resolveAll,
  mergeUpdate,
} from "../lib/featureFlags.js";
import { recordAudit } from "../lib/audit.js";
import {
  summarize,
  topPaths,
  topClicks,
  recentErrors,
  recentFetchFails,
  pageViewsByDay,
  topOrgs,
} from "../lib/analytics.js";
import { provisionOrg, validateProvisionInput } from "./provision.js";

const log = logger.child("super");

export const superAdminRouter = express.Router();

const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

async function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.redirect("/login.html?next=/__super");
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, isSuperAdmin: true, email: true, displayName: true },
  });
  if (!u?.isSuperAdmin) {
    return res.status(404).type("text/plain").send("Not found");
  }
  req.superUser = u;
  next();
}

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

function shell(req, { title, body }) {
  const u = req.superUser;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} — Compass super-admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{--bg:#020617;--surface:#0f172a;--surface-alt:#1e293b;--ink:#f7f8fa;--ink-muted:#94a3b8;--line:#334155;--accent:#1d4ed8;--danger:#f59e0b;--font-display:"Newsreader",serif;--font-ui:"Inter Tight",sans-serif}
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);background:var(--bg);color:var(--ink);line-height:1.5}
a{color:var(--accent)} a:hover{color:#fff}
header{padding:1rem 1.75rem;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem}
header strong{font-family:var(--font-display);font-size:1.15rem;font-weight:500;letter-spacing:-.01em}
header strong em{font-style:italic;color:var(--accent)}
nav{display:flex;gap:1rem;flex-wrap:wrap;font-size:.88rem}
nav a{color:var(--ink-muted);text-decoration:none}
nav a:hover,nav a.active{color:#fff;border-bottom:1.5px solid var(--accent);padding-bottom:2px}
.who{font-size:.78rem;color:var(--ink-muted)}
main{max-width:1100px;margin:0 auto;padding:1.5rem 1.75rem}
h1{font-family:var(--font-display);font-size:36px;font-weight:400;letter-spacing:-.025em;margin:0 0 1rem}
h2{font-family:var(--font-display);font-size:22px;font-weight:400;margin:0 0 .8rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:1.1rem 1.25rem;margin-bottom:1rem}
.card h3{font-family:var(--font-ui);font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 .55rem}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th{text-align:left;padding:.5rem .65rem;border-bottom:1px solid var(--line);font-weight:600;font-size:.74rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted)}
td{padding:.6rem .65rem;border-bottom:1px solid var(--line);vertical-align:top}
.tag{display:inline-block;background:var(--surface-alt);border:1px solid var(--line);padding:.1rem .55rem;border-radius:999px;font-size:.7rem;letter-spacing:.04em}
.tag-on{background:var(--accent);color:var(--ink);border-color:var(--accent)}
.tag-warn{background:var(--danger);color:#fff;border-color:var(--danger)}
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .85rem;border-radius:6px;border:1.5px solid var(--line);background:transparent;color:var(--ink);text-decoration:none;font-family:var(--font-ui);font-weight:600;font-size:.82rem;cursor:pointer}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn-accent{background:var(--accent);color:var(--ink);border-color:var(--accent)}
.btn-accent:hover{background:#fff;color:var(--ink);border-color:#fff}
.btn-danger{color:var(--danger);border-color:#5a3a2a}
.btn-danger:hover{background:var(--danger);color:#fff}
input,select,textarea{font:inherit;background:#0e1410;color:var(--ink);border:1.5px solid var(--line);border-radius:6px;padding:.5rem .65rem;width:100%;margin-top:.25rem}
label{display:block;font-size:.84rem;color:var(--ink-muted);margin-bottom:.65rem}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.muted{color:var(--ink-muted);font-size:.82rem}
.empty{padding:1.4rem;text-align:center;color:var(--ink-muted);font-size:.88rem;border:1.5px dashed var(--line);border-radius:8px}
.flag-grid{display:grid;grid-template-columns:1fr;gap:.5rem}
.flag-row{display:flex;align-items:flex-start;gap:.6rem;padding:.55rem .7rem;border:1px solid var(--line);border-radius:6px}
.flag-row input[type=checkbox]{width:auto;margin-top:.18rem}
.flag-row .flag-meta{flex:1}
.flag-row .flag-key{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;color:var(--accent)}
.flag-row .flag-desc{font-size:.78rem;color:var(--ink-muted);margin-top:.18rem}
@media (max-width:780px){header,main{padding-left:1rem;padding-right:1rem}}
</style></head>
<body>
<header>
  <strong>Compass<em>.</em> <span class="muted">super-admin</span></strong>
  <nav>
    <a href="/__super" ${req.path === "/" ? 'class="active"' : ""}>Overview</a>
    <a href="/__super/orgs" ${req.path.startsWith("/orgs") ? 'class="active"' : ""}>Orgs</a>
    <a href="/__super/analytics" ${req.path.startsWith("/analytics") ? 'class="active"' : ""}>Analytics</a>
    <a href="/__super/support" ${req.path.startsWith("/support") ? 'class="active"' : ""}>Support</a>
    <a href="/__super/refunds" ${req.path.startsWith("/refunds") ? 'class="active"' : ""}>Refunds</a>
    <a href="/__super/billing" ${req.path.startsWith("/billing") ? 'class="active"' : ""}>Billing</a>
  </nav>
  <span class="who">${escape(u.email)}</span>
</header>
<main>${body}</main>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

superAdminRouter.get("/", requireSuperAdmin, async (req, res) => {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const [orgCount, demoCount, suspendedCount, ticketsOpen, recentSignups, recentTickets] = await Promise.all([
    prisma.org.count(),
    prisma.org.count({ where: { isDemo: true } }),
    prisma.org.count({ where: { suspendedAt: { not: null } } }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.org.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 30 * day) } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, slug: true, displayName: true, unitType: true, plan: true, isDemo: true, createdAt: true },
    }),
    prisma.supportTicket.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, subject: true, fromEmail: true, category: true, priority: true, createdAt: true, orgId: true },
    }),
  ]);

  const body = `
    <h1>Overview</h1>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.5rem">
      ${statCard("Orgs", orgCount, `${demoCount} demos · ${suspendedCount} suspended`)}
      ${statCard("Open tickets", ticketsOpen, ticketsOpen ? "needs triage" : "all clear")}
      ${statCard("Signups (30d)", recentSignups.length, "")}
      ${statCard("You", req.superUser.displayName, "super-admin")}
    </div>

    <div class="card">
      <h2>Recent signups</h2>
      ${recentSignups.length
        ? `<table><thead><tr><th>Org</th><th>Type</th><th>Plan</th><th>When</th></tr></thead><tbody>
            ${recentSignups.map((o) => `<tr>
              <td><a href="/__super/orgs/${escape(o.id)}"><strong>${escape(o.displayName)}</strong></a> ${o.isDemo ? '<span class="tag">demo</span>' : ""}</td>
              <td>${escape(o.unitType)}</td>
              <td>${escape(o.plan)}</td>
              <td class="muted">${escape(new Date(o.createdAt).toISOString().slice(0, 10))}</td>
            </tr>`).join("")}
          </tbody></table>`
        : `<div class="empty">No new orgs in the last 30 days.</div>`}
    </div>

    <div class="card">
      <h2>Open support tickets</h2>
      ${recentTickets.length
        ? `<table><thead><tr><th>Subject</th><th>From</th><th>Category</th><th>When</th></tr></thead><tbody>
            ${recentTickets.map((t) => `<tr>
              <td><a href="/__super/support/${escape(t.id)}">${escape(t.subject)}</a> ${t.priority === "urgent" ? '<span class="tag tag-warn">urgent</span>' : ""}</td>
              <td class="muted">${escape(t.fromEmail)}</td>
              <td>${escape(t.category)}</td>
              <td class="muted">${escape(new Date(t.createdAt).toISOString().slice(0, 10))}</td>
            </tr>`).join("")}
          </tbody></table>`
        : `<div class="empty">All quiet on the support front.</div>`}
    </div>
  `;
  res.type("html").send(shell(req, { title: "Overview", body }));
});

function statCard(label, value, hint) {
  return `<div class="card" style="margin:0">
    <h3>${escape(label)}</h3>
    <div style="font-family:var(--font-display);font-size:34px;font-weight:400;letter-spacing:-.025em;line-height:1">${escape(String(value))}</div>
    <div class="muted" style="margin-top:.4rem">${escape(hint || "")}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Orgs                                                                */
/* ------------------------------------------------------------------ */

superAdminRouter.get("/orgs", requireSuperAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const where = q
    ? {
        OR: [
          { slug: { contains: q.toLowerCase() } },
          { displayName: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const orgs = await prisma.org.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, slug: true, displayName: true, unitType: true, plan: true,
      isDemo: true, suspendedAt: true, city: true, state: true, createdAt: true,
      _count: { select: { members: true } },
    },
  });

  const body = `
    <h1>Orgs <span class="muted" style="font-size:14px">(${orgs.length})</span></h1>
    <form method="get" action="/__super/orgs" style="margin-bottom:1rem">
      <div class="row">
        <input name="q" placeholder="search slug / name / city" value="${escape(q)}" style="flex:1">
        <button class="btn" type="submit">Search</button>
        ${q ? `<a class="btn" href="/__super/orgs">Clear</a>` : ""}
        <a class="btn btn-accent" href="/__super/orgs/new">+ Provision org</a>
      </div>
    </form>
    <div class="card">
      <table>
        <thead><tr><th>Slug</th><th>Name</th><th>Members</th><th>Type</th><th>Plan</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>${orgs.map((o) => `<tr>
          <td><code>${escape(o.slug)}</code></td>
          <td><a href="/__super/orgs/${escape(o.id)}"><strong>${escape(o.displayName)}</strong></a> <span class="muted">${escape(o.city || "")}, ${escape(o.state || "")}</span></td>
          <td>${o._count.members}</td>
          <td>${escape(o.unitType)}</td>
          <td>${escape(o.plan)}</td>
          <td>${o.isDemo ? '<span class="tag">demo</span>' : ""} ${o.suspendedAt ? '<span class="tag tag-warn">suspended</span>' : '<span class="tag tag-on">active</span>'}</td>
          <td class="muted">${escape(new Date(o.createdAt).toISOString().slice(0, 10))}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>
  `;
  res.type("html").send(shell(req, { title: "Orgs", body }));
});

superAdminRouter.get("/orgs/new", requireSuperAdmin, async (req, res) => {
  const body = `
    <h1>Provision a new org</h1>
    <form method="post" action="/__super/orgs/new" class="card">
      <div class="row">
        <label style="flex:1">Unit type
          <select name="unitType">
            <option value="Troop">Troop (Scouts BSA)</option>
            <option value="Pack">Pack (Cub Scouts)</option>
            <option value="Crew">Crew (Venturing)</option>
            <option value="Ship">Ship (Sea Scouts)</option>
            <option value="Post">Post (Exploring)</option>
            <option value="GirlScoutTroop">Girl Scout Troop</option>
          </select>
        </label>
        <label style="flex:1">Unit number<input name="unitNumber" required></label>
      </div>
      <label>Charter org<input name="charterOrg" required></label>
      <div class="row">
        <label style="flex:1">City<input name="city" required></label>
        <label style="flex:1">State<input name="state" required maxlength="2" placeholder="WI"></label>
      </div>
      <label>Scoutmaster name<input name="scoutmasterName" required></label>
      <label>Scoutmaster email<input name="scoutmasterEmail" type="email" required></label>
      <label>Plan
        <select name="plan">
          <option value="patrol">Patrol — $12/mo</option>
          <option value="troop">Troop — $20/mo</option>
          <option value="council">Council — custom</option>
        </select>
      </label>
      <button class="btn btn-accent" type="submit">Provision</button>
    </form>`;
  res.type("html").send(shell(req, { title: "Provision org", body }));
});

superAdminRouter.post("/orgs/new", requireSuperAdmin, async (req, res) => {
  const errors = validateProvisionInput(req.body);
  if (errors.length) {
    return res.status(400).type("text/plain").send("Validation errors:\n" + errors.join("\n"));
  }
  const org = await provisionOrg(req.body);
  await recordAudit({
    org,
    user: req.superUser,
    entityType: "Org",
    entityId: org.id,
    action: "super:provision",
    summary: `Super-admin provisioned ${org.displayName}`,
  });
  res.redirect(`/__super/orgs/${org.id}`);
});

superAdminRouter.get("/orgs/:id", requireSuperAdmin, async (req, res) => {
  const org = await prisma.org.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { members: true, events: true, posts: true, channels: true, photos: true } } },
  });
  if (!org) return res.status(404).type("text/plain").send("Not found");
  const flagState = resolveAll(org);

  const body = `
    <a href="/__super/orgs" style="color:var(--ink-muted);text-decoration:none">← Orgs</a>
    <h1>${escape(org.displayName)} <span class="muted" style="font-size:14px"><code>${escape(org.slug)}</code></span></h1>

    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.75rem;margin-bottom:1rem">
      ${statCard("Members", org._count.members, "")}
      ${statCard("Events", org._count.events, "")}
      ${statCard("Posts", org._count.posts, "")}
      ${statCard("Channels", org._count.channels, "")}
      ${statCard("Photos", org._count.photos, "")}
    </div>

    <div class="card">
      <h2>Status</h2>
      <p class="muted">Created ${escape(new Date(org.createdAt).toISOString().slice(0, 10))} · Plan <strong>${escape(org.plan)}</strong> · Type <strong>${escape(org.unitType)}</strong></p>
      ${org.suspendedAt
        ? `<p style="background:#3d1d10;border:1px solid #5a3a2a;border-radius:6px;padding:.6rem .8rem;color:#f0bcb1">
            <strong>Suspended</strong> ${escape(new Date(org.suspendedAt).toISOString().slice(0, 10))} — ${escape(org.suspendedReason || "no reason on file")}
          </p>`
        : ""}
      <form method="post" action="/__super/orgs/${escape(org.id)}/${org.suspendedAt ? "unsuspend" : "suspend"}" class="row">
        ${org.suspendedAt
          ? `<button class="btn btn-accent">Unsuspend</button>`
          : `<input name="reason" placeholder="reason (shown on org's site)" required style="flex:1"><button class="btn btn-danger">Suspend</button>`}
      </form>
    </div>

    <div class="card">
      <h2>Feature flags</h2>
      <form method="post" action="/__super/orgs/${escape(org.id)}/features" class="flag-grid">
        ${Object.entries(FEATURE_FLAGS).map(([key, meta]) => `
          <label class="flag-row" style="margin:0">
            <input type="checkbox" name="${escape(key)}" value="1" ${flagState[key] ? "checked" : ""}>
            <span class="flag-meta">
              <span class="flag-key">${escape(key)}</span> <span class="muted">(default: ${meta.default ? "on" : "off"})</span>
              <div class="flag-desc">${escape(meta.description)}</div>
            </span>
          </label>`).join("")}
        <button class="btn btn-accent" style="align-self:flex-start;margin-top:.5rem">Save flags</button>
      </form>
    </div>

    <div class="card">
      <h2>Quick links</h2>
      <p>
        <a class="btn" href="https://${escape(org.slug)}.${escape(process.env.APEX_DOMAIN || "compass.app")}/" target="_blank" rel="noopener">Public site ↗</a>
        <a class="btn" href="https://${escape(org.slug)}.${escape(process.env.APEX_DOMAIN || "compass.app")}/admin" target="_blank" rel="noopener">Admin ↗</a>
      </p>
    </div>
  `;
  res.type("html").send(shell(req, { title: org.displayName, body }));
});

superAdminRouter.post("/orgs/:id/suspend", requireSuperAdmin, async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).type("text/plain").send("Reason required");
  const org = await prisma.org.update({
    where: { id: req.params.id },
    data: { suspendedAt: new Date(), suspendedReason: reason },
  });
  await recordAudit({
    org,
    user: req.superUser,
    entityType: "Org",
    entityId: org.id,
    action: "super:suspend",
    summary: `Suspended: ${reason}`,
  });
  log.warn("org suspended", { orgSlug: org.slug, reason });
  res.redirect(`/__super/orgs/${org.id}`);
});

superAdminRouter.post("/orgs/:id/unsuspend", requireSuperAdmin, async (req, res) => {
  const org = await prisma.org.update({
    where: { id: req.params.id },
    data: { suspendedAt: null, suspendedReason: null },
  });
  await recordAudit({
    org,
    user: req.superUser,
    entityType: "Org",
    entityId: org.id,
    action: "super:unsuspend",
    summary: "Unsuspended",
  });
  res.redirect(`/__super/orgs/${org.id}`);
});

superAdminRouter.post("/orgs/:id/features", requireSuperAdmin, async (req, res) => {
  const org = await prisma.org.findUnique({
    where: { id: req.params.id },
    select: { id: true, slug: true, displayName: true, features: true },
  });
  if (!org) return res.status(404).type("text/plain").send("Not found");
  // The form submits only checked boxes. Compute the patch over every
  // known flag so unchecked = false (the default registry handles
  // unknown flags loudly via mergeUpdate).
  const patch = {};
  for (const key of Object.keys(FEATURE_FLAGS)) {
    patch[key] = !!req.body?.[key];
  }
  let next;
  try {
    next = mergeUpdate(org.features, patch);
  } catch (e) {
    return res.status(400).type("text/plain").send(e.message);
  }
  await prisma.org.update({ where: { id: org.id }, data: { features: next } });
  await recordAudit({
    org,
    user: req.superUser,
    entityType: "Org",
    entityId: org.id,
    action: "super:features",
    summary: `Feature flags updated`,
  });
  res.redirect(`/__super/orgs/${org.id}`);
});

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Analytics dashboard                                                  */
/* ------------------------------------------------------------------ */
//
// Reads AuditLog rows with action LIKE 'analytics:%' and renders a
// summary view: page-views by surface, top paths, top click labels,
// recent client errors + fetch failures, top orgs by activity, and a
// 30-day sparkline. All queries are bounded by the time-window picker
// so a noisy month doesn't slow the page.

const TIME_WINDOWS = {
  "24h": { ms: 24 * 60 * 60 * 1000, label: "Last 24 hours" },
  "7d":  { ms: 7  * 24 * 60 * 60 * 1000, label: "Last 7 days" },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, label: "Last 30 days" },
  "90d": { ms: 90 * 24 * 60 * 60 * 1000, label: "Last 90 days" },
};

superAdminRouter.get("/analytics", requireSuperAdmin, async (req, res) => {
  const windowKey = TIME_WINDOWS[String(req.query.window || "7d")] ? String(req.query.window || "7d") : "7d";
  const win = TIME_WINDOWS[windowKey];
  const surfaceParam = String(req.query.surface || "all");
  const surface = ["marketing", "tenant", "admin"].includes(surfaceParam) ? surfaceParam : null;
  const since = new Date(Date.now() - win.ms);

  const [summary, paths, clicks, errors, fails, perDay, orgs] = await Promise.all([
    summarize({ since }, prisma),
    topPaths({ surface, since, limit: 12 }, prisma),
    topClicks({ surface, since, limit: 12 }, prisma),
    recentErrors({ since, limit: 15 }, prisma),
    recentFetchFails({ since, limit: 15 }, prisma),
    pageViewsByDay({ since }, prisma),
    topOrgs({ since, limit: 10 }, prisma),
  ]);

  const days = bucketDays(since, new Date(), perDay);
  const sparkMax = days.reduce((m, d) => Math.max(m, d.count), 1);

  const surfaceTotal =
    summary.pageViewsBySurface.marketing +
    summary.pageViewsBySurface.tenant +
    summary.pageViewsBySurface.admin +
    summary.pageViewsBySurface.unknown;

  function windowLink(k) {
    const cls = k === windowKey ? 'class="tag tag-on"' : 'class="tag"';
    const q = surface ? `&surface=${encodeURIComponent(surface)}` : "";
    return `<a href="/__super/analytics?window=${k}${q}" ${cls}>${escape(TIME_WINDOWS[k].label)}</a>`;
  }
  function surfaceLink(s, label) {
    const active = (s === null && !surface) || s === surface;
    const cls = active ? 'class="tag tag-on"' : 'class="tag"';
    const q = s ? `?window=${windowKey}&surface=${encodeURIComponent(s)}` : `?window=${windowKey}`;
    return `<a href="/__super/analytics${q}" ${cls}>${escape(label)}</a>`;
  }
  function surfaceTag(s) {
    const colors = { marketing: "#1d4ed8", tenant: "#0891b2", admin: "#f59e0b" };
    const c = colors[s] || "#94a3b8";
    return `<span class="tag" style="background:${c};color:#0f172a;border-color:${c}">${escape(s)}</span>`;
  }
  function surfaceBar(s, label, count) {
    const pct = surfaceTotal ? (count / surfaceTotal) * 100 : 0;
    return `<div style="margin:.5rem 0">
      <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-bottom:.25rem">
        <span>${escape(label)}</span>
        <span class="muted">${count} · ${pct.toFixed(0)}%</span>
      </div>
      <div style="height:8px;background:var(--surface-alt);border-radius:4px;overflow:hidden">
        <div style="width:${pct.toFixed(2)}%;height:100%;background:var(--accent)"></div>
      </div>
    </div>`;
  }

  const sparkline = `<div style="display:flex;align-items:flex-end;gap:2px;height:60px;margin:.5rem 0">
    ${days.map((d) => `<div title="${escape(d.day)} · ${d.count}" style="flex:1;height:${Math.max(2, (d.count / sparkMax) * 100).toFixed(2)}%;background:var(--accent);border-radius:2px 2px 0 0"></div>`).join("")}
  </div>
  <div class="muted" style="display:flex;justify-content:space-between;font-size:.7rem">
    <span>${escape(days[0]?.day || "")}</span>
    <span>${escape(days[days.length - 1]?.day || "")}</span>
  </div>`;

  const body = `
    <h1>Analytics</h1>
    <div class="muted" style="margin-top:-.5rem;margin-bottom:1rem">
      Page views, clicks, errors, and signups across <strong>marketing</strong>,
      <strong>tenant</strong>, and <strong>admin</strong> surfaces.
      Reads from <code>AuditLog</code> rows with <code>action LIKE 'analytics:%'</code>.
    </div>

    <div class="row" style="gap:.4rem;margin-bottom:1rem">
      ${windowLink("24h")} ${windowLink("7d")} ${windowLink("30d")} ${windowLink("90d")}
      <span class="muted" style="margin-left:1rem">Surface:</span>
      ${surfaceLink(null, "all")}
      ${surfaceLink("marketing", "marketing")}
      ${surfaceLink("tenant", "tenant")}
      ${surfaceLink("admin", "admin")}
    </div>

    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:.75rem;margin-bottom:1.5rem">
      ${statCard("Events", summary.totals.events, win.label.toLowerCase())}
      ${statCard("Page views", summary.totals.pageViews, "")}
      ${statCard("Clicks", summary.totals.clicks, "[data-track]")}
      ${statCard("Errors", summary.totals.errors, summary.totals.errors > 0 ? "needs a look" : "all clear")}
      ${statCard("Fetch fails", summary.totals.fetchFails, "non-2xx responses")}
      ${statCard("Signups", summary.totals.signups, "via beacon")}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <h2>Page views by surface</h2>
        ${surfaceTotal === 0
          ? `<div class="empty">No page views in this window.</div>`
          : `${surfaceBar("marketing", "Marketing (apex)", summary.pageViewsBySurface.marketing)}
             ${surfaceBar("tenant", "Tenant (org subdomain)", summary.pageViewsBySurface.tenant)}
             ${surfaceBar("admin", "Admin (/admin)", summary.pageViewsBySurface.admin)}
             ${summary.pageViewsBySurface.unknown ? surfaceBar("unknown", "Unknown", summary.pageViewsBySurface.unknown) : ""}`}
      </div>

      <div class="card">
        <h2>Page views per day</h2>
        ${sparkline}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <h2>Top paths${surface ? ` · ${escape(surface)}` : ""}</h2>
        ${paths.length === 0
          ? `<div class="empty">No page views in this window.</div>`
          : `<table><thead><tr><th>Path</th><th style="text-align:right">Views</th></tr></thead><tbody>
              ${paths.map((p) => `<tr>
                <td><code style="font-size:.78rem">${escape(p.path)}</code></td>
                <td style="text-align:right;font-variant-numeric:tabular-nums">${p.count}</td>
              </tr>`).join("")}
            </tbody></table>`}
      </div>

      <div class="card">
        <h2>Top clicks${surface ? ` · ${escape(surface)}` : ""}</h2>
        <div class="muted" style="font-size:.74rem;margin-bottom:.5rem">
          Add <code>data-track="label"</code> on a button or link to land here.
        </div>
        ${clicks.length === 0
          ? `<div class="empty">No tracked clicks in this window.</div>`
          : `<table><thead><tr><th>Label</th><th style="text-align:right">Clicks</th></tr></thead><tbody>
              ${clicks.map((c) => `<tr>
                <td><code style="font-size:.78rem">${escape(c.label)}</code></td>
                <td style="text-align:right;font-variant-numeric:tabular-nums">${c.count}</td>
              </tr>`).join("")}
            </tbody></table>`}
      </div>
    </div>

    <div class="card">
      <h2>Top orgs by activity</h2>
      ${orgs.length === 0
        ? `<div class="empty">No org-attributed events in this window.</div>`
        : `<table><thead><tr><th>Org</th><th>Plan</th><th style="text-align:right">Events</th></tr></thead><tbody>
            ${orgs.map((row) => `<tr>
              <td>${row.org
                ? `<a href="/__super/orgs/${escape(row.orgId)}"><strong>${escape(row.org.displayName)}</strong></a> <span class="muted">${escape(row.org.slug)}</span>`
                : `<span class="muted">${escape(row.orgId)}</span>`}</td>
              <td>${escape(row.org?.plan || "—")}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${row.count}</td>
            </tr>`).join("")}
          </tbody></table>`}
    </div>

    <div class="card">
      <h2>Recent client errors</h2>
      ${errors.length === 0
        ? `<div class="empty">No client errors in this window. 🎉</div>`
        : `<table><thead><tr><th>Message</th><th>Surface</th><th>Path</th><th>Where</th><th>When</th></tr></thead><tbody>
            ${errors.map((e) => `<tr>
              <td>
                <strong>${escape(e.message)}</strong>
                ${e.kind && e.kind !== "error" ? `<span class="tag tag-warn" style="margin-left:.4rem">${escape(e.kind)}</span>` : ""}
              </td>
              <td>${surfaceTag(e.surface)}</td>
              <td><code style="font-size:.74rem">${escape(e.path)}</code></td>
              <td class="muted" style="font-size:.74rem">${escape(e.source ? trimSource(e.source) : "")}${e.line ? ":" + e.line : ""}</td>
              <td class="muted" style="font-size:.74rem">${escape(new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " "))}</td>
            </tr>`).join("")}
          </tbody></table>`}
    </div>

    <div class="card">
      <h2>Recent failed fetches</h2>
      ${fails.length === 0
        ? `<div class="empty">No non-2xx fetches in this window.</div>`
        : `<table><thead><tr><th>Status</th><th>URL</th><th>Surface</th><th>From</th><th>When</th></tr></thead><tbody>
            ${fails.map((f) => `<tr>
              <td><span class="tag ${f.status >= 500 ? "tag-warn" : ""}">${f.status}</span></td>
              <td><code style="font-size:.78rem">${escape(f.url)}</code></td>
              <td>${surfaceTag(f.surface)}</td>
              <td><code style="font-size:.74rem">${escape(f.path)}</code></td>
              <td class="muted" style="font-size:.74rem">${escape(new Date(f.createdAt).toISOString().slice(0, 16).replace("T", " "))}</td>
            </tr>`).join("")}
          </tbody></table>`}
    </div>
  `;
  res.type("html").send(shell(req, { title: "Analytics", body }));
});

function bucketDays(since, until, perDay) {
  // Fill missing days with zero so the sparkline doesn't lie about
  // gaps in coverage.
  const sinceDay = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const untilDay = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));
  const dayMs = 24 * 60 * 60 * 1000;
  const byDay = Object.fromEntries(perDay.map((p) => [p.day, p.count]));
  const out = [];
  for (let t = sinceDay.getTime(); t <= untilDay.getTime(); t += dayMs) {
    const d = new Date(t).toISOString().slice(0, 10);
    out.push({ day: d, count: byDay[d] || 0 });
  }
  return out;
}

function trimSource(src) {
  // Strip the protocol + host so the column doesn't dominate the
  // table on long URLs; show only the path tail.
  try {
    const u = new URL(src);
    return u.pathname + (u.search || "");
  } catch {
    return src.length > 60 ? "…" + src.slice(-60) : src;
  }
}

superAdminRouter.get("/support", requireSuperAdmin, async (req, res) => {
  const status = String(req.query.status || "open");
  const tickets = await prisma.supportTicket.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { org: { select: { slug: true, displayName: true } } },
  });
  const body = `
    <h1>Support</h1>
    <div class="row" style="margin-bottom:1rem">
      ${["open", "acked", "resolved", "closed", "all"].map((s) => `<a class="btn ${s === status ? "btn-accent" : ""}" href="/__super/support?status=${s}">${s}</a>`).join("")}
    </div>
    <div class="card">
      ${tickets.length
        ? `<table><thead><tr><th>Subject</th><th>From</th><th>Org</th><th>Category</th><th>Status</th><th>When</th></tr></thead><tbody>
            ${tickets.map((t) => `<tr>
              <td><a href="/__super/support/${escape(t.id)}">${escape(t.subject)}</a> ${t.priority === "urgent" ? '<span class="tag tag-warn">urgent</span>' : ""}</td>
              <td class="muted">${escape(t.fromEmail)}</td>
              <td>${t.org ? `<a href="/__super/orgs/${escape(t.org.slug)}">${escape(t.org.displayName)}</a>` : '<span class="muted">apex</span>'}</td>
              <td>${escape(t.category)}</td>
              <td><span class="tag">${escape(t.status)}</span></td>
              <td class="muted">${escape(new Date(t.createdAt).toISOString().slice(0, 10))}</td>
            </tr>`).join("")}
          </tbody></table>`
        : `<div class="empty">No tickets in this state.</div>`}
    </div>`;
  res.type("html").send(shell(req, { title: "Support", body }));
});

superAdminRouter.get("/support/:id", requireSuperAdmin, async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: { org: { select: { id: true, slug: true, displayName: true } } },
  });
  if (!ticket) return res.status(404).type("text/plain").send("Not found");
  const body = `
    <a href="/__super/support" style="color:var(--ink-muted);text-decoration:none">← Support</a>
    <h1>${escape(ticket.subject)}</h1>
    <p class="muted">From <strong>${escape(ticket.fromEmail)}</strong>${ticket.fromName ? ` (${escape(ticket.fromName)})` : ""} · ${escape(ticket.category)} · ${escape(ticket.priority)} · status <span class="tag">${escape(ticket.status)}</span></p>
    ${ticket.org ? `<p class="muted">Org: <a href="/__super/orgs/${escape(ticket.org.id)}">${escape(ticket.org.displayName)}</a></p>` : ""}
    <div class="card" style="white-space:pre-wrap;font-family:var(--font-ui);font-size:.92rem">${escape(ticket.body)}</div>
    <form method="post" action="/__super/support/${escape(ticket.id)}/status" class="card">
      <div class="row">
        <label style="flex:1">Status
          <select name="status">
            ${["open", "acked", "resolved", "closed"].map((s) => `<option value="${s}" ${s === ticket.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <label style="flex:1">Priority
          <select name="priority">
            ${["low", "normal", "high", "urgent"].map((p) => `<option value="${p}" ${p === ticket.priority ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </label>
      </div>
      <label>Resolution note<textarea name="resolutionNote" rows="3">${escape(ticket.resolutionNote || "")}</textarea></label>
      <button class="btn btn-accent" type="submit">Update ticket</button>
    </form>`;
  res.type("html").send(shell(req, { title: ticket.subject, body }));
});

superAdminRouter.post("/support/:id/status", requireSuperAdmin, async (req, res) => {
  const status = String(req.body?.status || "open");
  const priority = String(req.body?.priority || "normal");
  const note = String(req.body?.resolutionNote || "").trim() || null;
  const data = { status, priority, resolutionNote: note };
  if (status === "acked" || status === "resolved" || status === "closed") {
    data.acknowledgedAt = new Date();
  }
  if (status === "resolved" || status === "closed") {
    data.resolvedAt = new Date();
  }
  const ticket = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data,
  });
  await recordAudit({
    org: ticket.orgId ? { id: ticket.orgId } : null,
    user: req.superUser,
    entityType: "SupportTicket",
    entityId: ticket.id,
    action: `super:support-${status}`,
    summary: `${ticket.subject} → ${status}${note ? ` (${note.slice(0, 80)})` : ""}`,
  });
  res.redirect(`/__super/support/${ticket.id}`);
});

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

superAdminRouter.get("/refunds", requireSuperAdmin, async (req, res) => {
  const refunds = await prisma.refund.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { org: { select: { slug: true, displayName: true } } },
  });
  const body = `
    <h1>Refunds</h1>
    <p class="muted">Operator-issued credit or refund against the unit's SaaS fee. Recorded here + emitted to the audit log; the paymentRef is a free-form pointer to the source invoice or note.</p>
    <a class="btn btn-accent" href="/__super/refunds/new" style="margin-bottom:1rem">+ Issue refund</a>
    <div class="card">
      ${refunds.length
        ? `<table><thead><tr><th>Org</th><th>Amount</th><th>Reason</th><th>Status</th><th>When</th></tr></thead><tbody>
            ${refunds.map((r) => `<tr>
              <td>${r.org ? `<a href="/__super/orgs/${escape(r.org.slug)}">${escape(r.org.displayName)}</a>` : '<span class="muted">—</span>'}</td>
              <td>$${(r.amountCents / 100).toFixed(2)}</td>
              <td>${escape(r.reason)}</td>
              <td><span class="tag">${escape(r.status)}</span></td>
              <td class="muted">${escape(new Date(r.createdAt).toISOString().slice(0, 10))}</td>
            </tr>`).join("")}
          </tbody></table>`
        : `<div class="empty">No refunds issued.</div>`}
    </div>`;
  res.type("html").send(shell(req, { title: "Refunds", body }));
});

superAdminRouter.get("/refunds/new", requireSuperAdmin, async (req, res) => {
  const orgs = await prisma.org.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, slug: true, displayName: true },
    take: 500,
  });
  const body = `
    <a href="/__super/refunds" style="color:var(--ink-muted);text-decoration:none">← Refunds</a>
    <h1>Issue refund</h1>
    <form method="post" action="/__super/refunds/new" class="card">
      <label>Org
        <select name="orgId" required>
          <option value="">Choose…</option>
          ${orgs.map((o) => `<option value="${escape(o.id)}">${escape(o.displayName)} · ${escape(o.slug)}</option>`).join("")}
        </select>
      </label>
      <div class="row">
        <label style="flex:1">Amount (USD)<input name="amount" type="number" step="0.01" min="0" required></label>
        <label style="flex:1">Payment ref (optional)<input name="paymentRef" placeholder="invoice id / manual:…"></label>
      </div>
      <label>Reason<input name="reason" required></label>
      <label>Notes (internal)<textarea name="notes" rows="3"></textarea></label>
      <button class="btn btn-accent" type="submit">Record refund</button>
    </form>`;
  res.type("html").send(shell(req, { title: "Issue refund", body }));
});

superAdminRouter.post("/refunds/new", requireSuperAdmin, async (req, res) => {
  const orgId = String(req.body?.orgId || "");
  const amountCents = Math.round(Number(req.body?.amount) * 100);
  const reason = String(req.body?.reason || "").trim();
  if (!orgId || !reason || !amountCents || amountCents < 1) {
    return res.status(400).type("text/plain").send("orgId, amount, and reason are required");
  }
  const refund = await prisma.refund.create({
    data: {
      orgId,
      amountCents,
      reason,
      paymentRef: String(req.body?.paymentRef || "").trim() || null,
      notes: String(req.body?.notes || "").trim() || null,
      issuedBy: req.superUser.id,
    },
  });
  await recordAudit({
    org: { id: orgId },
    user: req.superUser,
    entityType: "Refund",
    entityId: refund.id,
    action: "super:refund",
    summary: `Refund $${(amountCents / 100).toFixed(2)} — ${reason}`,
  });
  res.redirect(`/__super/refunds`);
});

/* ------------------------------------------------------------------ */
/* Billing — read-only summary for now                                 */
/* ------------------------------------------------------------------ */

superAdminRouter.get("/billing", requireSuperAdmin, async (req, res) => {
  const byPlan = await prisma.org.groupBy({
    by: ["plan"],
    where: { isDemo: false, suspendedAt: null },
    _count: { _all: true },
  });
  const PLAN_PRICES = { patrol: 12, troop: 20, council: 0 };
  const rows = byPlan.map((r) => ({
    plan: r.plan,
    orgs: r._count._all,
    mrr: r._count._all * (PLAN_PRICES[r.plan] || 0),
  }));
  const totalMrr = rows.reduce((s, r) => s + r.mrr, 0);

  const body = `
    <h1>Billing snapshot</h1>
    <p class="muted">Read-only roll-up. Counts active, non-demo orgs at list-price; whatever billing system actually invoices (manual today) is the source of truth for collected revenue.</p>
    <div class="card">
      <table>
        <thead><tr><th>Plan</th><th>Orgs</th><th>List MRR</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td><strong>${escape(r.plan)}</strong></td>
            <td>${r.orgs}</td>
            <td>$${r.mrr.toLocaleString("en-US")}/mo</td>
          </tr>`).join("")}
          <tr style="border-top:2px solid var(--accent)">
            <td><strong>Total</strong></td>
            <td><strong>${rows.reduce((s, r) => s + r.orgs, 0)}</strong></td>
            <td><strong>$${totalMrr.toLocaleString("en-US")}/mo</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted small">Council-tier MRR is custom-priced and excluded from this list-price total.</p>`;
  res.type("html").send(shell(req, { title: "Billing", body }));
});
