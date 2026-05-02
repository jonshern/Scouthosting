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
import { googleConfigured, appleConfigured } from "../lib/oauth.js";
import { sendBatch, mailDriver } from "../lib/mail.js";
import { sendSmsBatch, smsDriver, normalisePhone } from "../lib/sms.js";
import { trackEmail, trackSmsBody } from "../lib/trackedMessage.js";

// Returns a stable id we can stamp into both the outbound tracking
// tokens and the MailLog row created after the send. Format mirrors
// cuid (string + hex) so dashboards that group by id-prefix keep
// working.
function newMailLogId() {
  return "ml_" + crypto.randomBytes(12).toString("hex");
}

function trackingBaseUrl(req) {
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const portSuffix =
    process.env.PORT && process.env.NODE_ENV !== "production"
      ? `:${process.env.PORT}`
      : "";
  return `${protocol}://${req.org.slug}.${apex}${portSuffix}`;
}
import { MEAL_DIETARY_TAGS, sanitizeMealTags, mealConflicts } from "../lib/dietary.js";
import { reconcilePositionTerm as reconcileTerm } from "../lib/positionTerms.js";
import { makeUnsubToken } from "../lib/unsubToken.js";
import { scoutbookUrl } from "../lib/scoutbook.js";
import { composeNewsletter, renderNewsletterHtml } from "../lib/newsletter.js";
import {
  checkChannelTwoDeep,
  suspendChannel,
  unsuspendChannel,
  provisionStandingChannels,
  archiveEndedEventChannels,
  CHANNEL_KINDS,
} from "../lib/chat.js";
import { tallyCredits, formatCsvRow } from "../lib/credits.js";
import { recordAudit } from "../lib/audit.js";
import { deriveBillingStatus, billingBanner } from "../lib/billingState.js";
import {
  isConfigured as stripeConfigured,
  createCheckoutSession,
  cancelAtPeriodEnd as stripeCancel,
  reactivateSubscription as stripeReactivate,
} from "../lib/stripe.js";
import {
  matchSubgroup,
  buildCurrentTrainingsMap,
  describeSubgroup,
} from "../lib/subgroups.js";
import { buildDashboardModel } from "../lib/dashboard.js";
import {
  subgroupVocab,
  subgroupPresets,
  positionOptions,
} from "../lib/orgRoles.js";
import { SCOPES, scopesForPosition, requireScope } from "../lib/permissions.js";
import {
  rollup as rollupAnalytics,
  summarize,
  topPaths,
  topClicks,
  recentErrors,
  recentFetchFails,
  pageViewsByDay,
  track,
  EVENTS,
} from "../lib/analytics.js";
import { parseRoster, mapMemberRows } from "../lib/rosterImport.js";
import {
  POST_POLICIES,
  POST_POLICY_LABELS,
  normalisePostPolicy,
} from "../lib/chatPermissions.js";
import {
  makeInviteToken,
  inviteSecret,
  INVITABLE_ROLES,
  INVITE_ROLE_LABELS,
} from "../lib/inviteToken.js";
import {
  SECTIONS as HOMEPAGE_SECTIONS,
  BLOCK_TYPES as HOMEPAGE_BLOCK_TYPES,
  resolvePlan as resolveHomepagePlan,
  normaliseSectionPatch as normaliseHomepageSectionPatch,
  readTestimonials as readHomepageTestimonials,
  readCustomBlocks as readHomepageCustomBlocks,
  normaliseCustomBlock as normaliseHomepageCustomBlock,
  isCustomBlockKey as isHomepageBlockKey,
  customBlockId as homepageBlockId,
  customBlockKey as homepageBlockKey,
} from "../lib/homepageSections.js";
import { categoryMeta as eventCategoryMeta } from "../lib/eventCategories.js";

const MARKDOWN_HINT =
  'Markdown supported: <code>**bold**</code>, <code>*italic*</code>, <code># Heading</code>, <code>- list</code>, <code>[link](https://…)</code>.';
import { makeRsvpToken } from "../lib/rsvpToken.js";
import { buildShoppingList, CATEGORY_ORDER } from "../lib/shoppingList.js";

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
  dest: path.resolve(process.env.UPLOAD_TMP || "/tmp/compass-uploads"),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10MB per file, 20 per request
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

const ALLOWED_DOC_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "application/zip",
]);

// Roster uploads (CSV or Excel). Held in memory — files are small by
// definition (member rosters cap at a few hundred rows), so we skip
// the temp-file dance.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/octet-stream"; // some browsers
    if (ok) cb(null, true);
    else cb(new Error(`Unsupported roster type: ${file.mimetype}`));
  },
});

const documentUpload = multer({
  dest: path.resolve(process.env.UPLOAD_TMP || "/tmp/compass-uploads"),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }, // 25MB single document
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported document type: ${file.mimetype}`));
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

// Sentinel option value emitted by the den/level <select> when the
// admin wants to type a name not on the canonical list. Both the form
// renderer and the body parser key off this string.
const OTHER_PRESET = "__other__";

function resolvePatrolFromBody(body) {
  const preset = (body?.patrolPreset || "").trim();
  if (preset && preset !== OTHER_PRESET) return preset;
  return body?.patrol?.trim() || null;
}

function sectionPlannerRows(page) {
  const order = resolveHomepagePlan(page);
  const knownSet = new Set(order);
  const blocks = readHomepageCustomBlocks(page);
  const blocksById = new Map(blocks.map((b) => [b.id, b]));
  // Include hidden sections at the bottom so the admin can re-show them.
  const hiddenBuiltins = Object.keys(HOMEPAGE_SECTIONS).filter((k) => !knownSet.has(k));
  const hiddenBlocks = blocks
    .map((b) => homepageBlockKey(b.id))
    .filter((k) => !knownSet.has(k));
  const all = [...order, ...hiddenBuiltins, ...hiddenBlocks];
  const vis = page?.sectionVisibility || {};
  return all
    .map((key, idx) => {
      let label;
      let description;
      if (isHomepageBlockKey(key)) {
        const b = blocksById.get(homepageBlockId(key));
        if (!b) return ""; // backing block was deleted; skip silently
        const typeMeta = HOMEPAGE_BLOCK_TYPES[b.type];
        const title =
          (b.type === "image" ? b.caption : b.title) ||
          `Untitled ${typeMeta?.label || "block"}`;
        label = `${title} <span class="tag">Custom · ${escape(typeMeta?.label || b.type)}</span>`;
        description = typeMeta?.description || "";
      } else {
        const meta = HOMEPAGE_SECTIONS[key];
        if (!meta) return "";
        label = escape(meta.label);
        description = meta.description;
      }
      const visible = vis[key] !== false;
      return `
      <li draggable="true" style="cursor:grab" data-key="${escape(key)}">
        <input type="hidden" name="order[]" value="${escape(key)}">
        <span style="font-family:'JetBrains Mono',ui-monospace,monospace;color:var(--ink-muted);font-size:.75rem;width:1.4rem">${idx + 1}.</span>
        <div style="flex:1">
          <strong>${label}</strong>
          <p>${escape(description)}</p>
        </div>
        <label style="margin:0;display:flex;align-items:center;gap:.4rem;flex:0 0 auto">
          <input type="checkbox" name="visible[${escape(key)}]" value="1" ${visible ? "checked" : ""} style="width:auto">
          Show
        </label>
      </li>`;
    })
    .join("");
}

// Render the "Custom blocks" section of the editor — list of existing
// blocks with edit/delete actions, plus an "Add a block" picker.
function customBlockRows(page) {
  const blocks = readHomepageCustomBlocks(page);
  if (!blocks.length) {
    return `<p class="muted small">No custom blocks yet. Add one below to drop a text snippet, photo, or call-to-action onto your homepage.</p>`;
  }
  return `<ul class="items" style="margin:0 0 .8rem">${blocks
    .map((b) => {
      const typeMeta = HOMEPAGE_BLOCK_TYPES[b.type];
      const heading =
        (b.type === "image" ? b.caption : b.title) ||
        `Untitled ${typeMeta?.label || "block"}`;
      const preview =
        b.type === "text"
          ? (b.body || "").slice(0, 120)
          : b.type === "image"
          ? b.filename
            ? `Image: ${b.filename}`
            : "No image uploaded yet"
          : b.type === "cta"
          ? `${b.buttonLabel || "Button"} → ${b.buttonLink || "(no link)"}`
          : "";
      return `
        <li>
          <div style="flex:1">
            <h3 style="margin:0">${escape(heading)} <span class="tag">${escape(typeMeta?.label || b.type)}</span></h3>
            <p class="muted small" style="margin:.2rem 0 0">${escape(preview)}</p>
          </div>
          <div class="row">
            <a class="btn btn-ghost small" href="/admin/content/blocks/${escape(b.id)}/edit">Edit</a>
            <form class="inline" method="post" action="/admin/content/blocks/${escape(b.id)}/delete" onsubmit="return confirm('Delete this block?')">
              <button class="btn btn-danger small" type="submit">Delete</button>
            </form>
          </div>
        </li>`;
    })
    .join("")}</ul>`;
}

function testimonialFormRows(page) {
  const rows = readHomepageTestimonials(page);
  // Always render at least one empty row so admins can add their first.
  const slots = rows.length ? [...rows, { quote: "", attribution: "" }] : [{ quote: "", attribution: "" }];
  return slots
    .map(
      (t, i) => `
    <div class="card" style="background:var(--bg);margin-bottom:.5rem">
      <label style="margin-bottom:.4rem">Quote
        <textarea name="quote[]" rows="2" placeholder="My son loves it.">${escape(t.quote)}</textarea>
      </label>
      <label style="margin-bottom:0">Attribution (optional)
        <input name="attribution[]" type="text" value="${escape(t.attribution)}" placeholder="— Megan O'Brien, Den 4 parent">
      </label>
    </div>`,
    )
    .join("");
}

function memberPositionField({ unitType, current, formId }) {
  const listId = `position-options-${formId}`;
  const datalist = positionOptions(unitType)
    .filter((o) => o !== "Other")
    .map((o) => `<option value="${escape(o)}">`)
    .join("");
  return `<label style="margin:0;flex:1">Position<input name="position" type="text" maxlength="60" placeholder="Pick or type a custom title" list="${escape(listId)}" value="${escape(current)}"><datalist id="${escape(listId)}">${datalist}</datalist></label>`;
}

function memberSubgroupField({ unitType, current, formId }) {
  const vocab = subgroupVocab(unitType);
  const heading = vocab.heading.replace(/s$/, "");
  const presets = subgroupPresets(unitType);
  if (!presets.length) {
    return `<label style="margin:0;flex:1">${escape(heading)}<input name="patrol" type="text" maxlength="40" value="${escape(current)}"></label>`;
  }
  const inList = presets.some((p) => p.label === current);
  const options = [
    `<option value=""${current === "" ? " selected" : ""}>—</option>`,
    ...presets.map(
      (p) =>
        `<option value="${escape(p.label)}"${current === p.label ? " selected" : ""}>${escape(p.label)} <small>(${escape(p.grade)})</small></option>`,
    ),
    `<option value="${OTHER_PRESET}"${!inList && current ? " selected" : ""}>Other…</option>`,
  ].join("");
  return `<label style="margin:0;flex:1" data-form-id="${escape(formId)}">${escape(heading)}
    <select name="patrolPreset" onchange="this.nextElementSibling.style.display=this.value==='${OTHER_PRESET}'?'block':'none'">${options}</select>
    <input name="patrol" type="text" maxlength="40" placeholder="Custom ${escape(vocab.singular)} name" value="${escape(!inList ? current : "")}" style="margin-top:.4rem;display:${!inList && current ? "block" : "none"}">
  </label>`;
}

// IA: 7 top-level sections + a More overflow. Maps each admin page to the
// section it most clearly belongs to. Active section is highlighted in
// the top nav; an in-page secondary nav is rendered by `subnav()` per
// section so leaders get one-click access to sibling pages.
const NAV_SECTIONS = [
  { key: "overview", label: "Overview", href: "/admin", pages: [] },
  {
    key: "site",
    label: "Site",
    href: "/admin/content",
    pages: [
      { href: "/admin/content", label: "Homepage" },
      { href: "/admin/pages", label: "Custom pages" },
    ],
  },
  {
    key: "messages",
    label: "Messages",
    href: "/admin/email",
    pages: [
      { href: "/admin/email", label: "Email broadcast" },
      { href: "/admin/email/sent", label: "Sent history" },
      { href: "/admin/newsletters", label: "Newsletters" },
      { href: "/admin/channels", label: "Channels" },
      { href: "/admin/posts", label: "Activity feed" },
      { href: "/admin/announcements", label: "Announcements" },
      { href: "/admin/ypt", label: "YPT status" },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/admin/events",
    pages: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/credits", label: "Credits" },
    ],
  },
  {
    key: "roster",
    label: "Roster",
    href: "/admin/members",
    pages: [
      { href: "/admin/members", label: "Members" },
      { href: "/admin/positions", label: "Position roster" },
      { href: "/admin/training", label: "Training" },
      { href: "/admin/invites", label: "Invites" },
      { href: "/admin/subgroups", label: "Subgroups" },
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  {
    key: "photos",
    label: "Photos",
    href: "/admin/albums",
    pages: [
      { href: "/admin/albums", label: "Photos & albums" },
      { href: "/admin/videos", label: "Videos" },
    ],
  },
  {
    key: "forms",
    label: "Forms",
    href: "/admin/forms",
    pages: [
      { href: "/admin/forms", label: "Forms & documents" },
      { href: "/admin/surveys", label: "Surveys" },
    ],
  },
  {
    key: "money",
    label: "Money",
    href: "/admin/treasurer",
    pages: [
      { href: "/admin/treasurer", label: "Treasurer report" },
      { href: "/admin/reimbursements", label: "Reimbursements" },
    ],
  },
  {
    key: "more",
    label: "More",
    href: "/admin/equipment",
    pages: [
      { href: "/admin/equipment", label: "Equipment" },
      { href: "/admin/eagle", label: "Eagle Scouts" },
      { href: "/admin/mbc", label: "Merit Badge Counselors" },
      { href: "/admin/oa", label: "OA elections" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/export", label: "Export" },
    ],
  },
];

// Pick the active section by URL prefix match. The longest matching
// section.pages href wins; falls back to overview.
function activeSection(pathname) {
  let best = NAV_SECTIONS[0];
  let bestLen = 0;
  for (const sec of NAV_SECTIONS) {
    for (const page of [{ href: sec.href }, ...sec.pages]) {
      if (pathname === page.href || pathname.startsWith(page.href + "/")) {
        if (page.href.length > bestLen) {
          best = sec;
          bestLen = page.href.length;
        }
      }
    }
  }
  return best;
}

// Render the section-level secondary nav (a row of pill links). Empty
// string when the active section has no sub-pages (e.g. Overview).
function subnav(pathname) {
  const sec = activeSection(pathname);
  if (!sec.pages.length) return "";
  const items = sec.pages
    .map((p) => {
      const active = pathname === p.href || pathname.startsWith(p.href + "/");
      return `<a href="${escape(p.href)}" class="${active ? "subnav-link active" : "subnav-link"}">${escape(p.label)}</a>`;
    })
    .join("");
  return `<nav class="subnav" aria-label="${escape(sec.label)} pages">${items}</nav>`;
}

function layout(req, { title, body, flash }) {
  const { org, user } = req;
  const pathname = (req.baseUrl || "") + (req.path || "/");
  const flashHtml = flash
    ? `<div class="flash flash-${escape(flash.type)}">${escape(flash.message)}</div>`
    : "";
  const active = activeSection(pathname);
  const topNavLinks = NAV_SECTIONS.map((sec) => {
    const isActive = sec.key === active.key;
    return `<a href="${escape(sec.href)}" class="${isActive ? "topnav-link active" : "topnav-link"}">${escape(sec.label)}</a>`;
  }).join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} — ${escape(org.displayName)} admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>${ADMIN_SHELL_CSS}</style></head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/admin">
      <span class="brand-mark">${escape(org.unitNumber)}</span>
      <span><strong>${escape(org.displayName)}</strong><small>Compass admin</small></span>
    </a>
    <nav class="topnav" aria-label="Sections">${topNavLinks}</nav>
    <div class="me">
      <span class="me-name">${escape(user.displayName)}</span>
      <a class="me-public" href="/" target="_blank" rel="noopener" title="View the public site">View site ↗</a>
      <a class="me-public" href="/help" target="_blank" rel="noopener" title="Contact Compass support">Help</a>
      <form method="post" action="/admin/logout" class="inline"><button class="btn btn-ghost small">Log out</button></form>
    </div>
  </div>
  ${subnav(pathname)}
</header>
<main class="main">
${flashHtml}
${body}
</main>
</body></html>`;
}

const ADMIN_SHELL_CSS = `
/* Compass admin shell — Slate & Sky (balanced) tokens.
   Per-org branding lives on the public site; the admin uses the
   single locked Compass palette so leaders across every unit see
   the same chrome.
   Mirrors /tokens.css#balanced exactly — keep them in lockstep
   when the canonical palette moves. */
:root {
  --bg:#f7f8fa;
  --surface:#ffffff;
  --surface-alt:#eef1f5;
  --surface-dark:#0f172a;
  --surface-sand:#eef1f5;
  --ink:#0f172a;
  --ink-soft:#334155;
  --ink-muted:#64748b;
  --line:#e2e8f0;
  --line-soft:#eef1f5;
  --primary:#0f172a;
  --primary-hover:#020617;
  --accent:#1d4ed8;
  --accent-soft:#bcd0f4;
  --danger:#dc2626;
  --success:#059669;
  --sky:#1d4ed8;
  --sky-soft:#bcd0f4;
  --ember:#f59e0b;
  --raspberry:#0f172a;
  --raspberry-soft:#cbd5e1;
  --butter:#f59e0b;
  --plum:#475569;
  --teal:#0891b2;
  --shadow:0 4px 20px rgba(15,23,42,.08);
  --font-display:"Newsreader","Source Serif Pro",Georgia,serif;
  --font-ui:"Inter Tight","Inter",system-ui,-apple-system,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--primary)}
a:hover{color:var(--primary-hover)}
h1,h2,h3,h4{font-family:var(--font-display);font-weight:400;letter-spacing:-.015em;margin:0 0 .4em;color:var(--ink)}
h1{font-size:36px;line-height:1.05;letter-spacing:-.025em}
h2{font-size:24px;line-height:1.15}
h3{font-size:17px;line-height:1.25}

/* Top bar with section nav (replaces the old sidebar). */
.topbar{
  background:var(--surface);
  border-bottom:1.5px solid var(--ink);
  position:sticky;top:0;z-index:10;
}
.topbar-inner{
  display:flex;align-items:center;gap:1.5rem;
  padding:.85rem 2rem;max-width:1280px;margin:0 auto;
}
.brand{display:flex;align-items:center;gap:.6rem;text-decoration:none;color:inherit;flex-shrink:0}
.brand-mark{
  width:34px;height:34px;border-radius:50%;
  background:var(--primary);color:#fff;
  display:grid;place-items:center;
  font-family:var(--font-display);font-style:italic;font-weight:500;font-size:.95rem;
  letter-spacing:-.02em;border:1.5px solid var(--ink);
}
.brand strong{font-family:var(--font-display);font-size:1rem;font-weight:500;letter-spacing:-.015em;display:block}
.brand small{display:block;color:var(--ink-muted);font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;font-weight:600;margin-top:1px}

.topnav{display:flex;gap:.15rem;flex:1;flex-wrap:wrap}
.topnav-link{
  padding:.5rem .85rem;border-radius:6px;
  text-decoration:none;color:var(--ink-soft);font-size:.92rem;font-weight:500;
  border-bottom:2px solid transparent;
  transition:color 120ms ease-out,border-color 120ms ease-out;
}
.topnav-link:hover{color:var(--ink)}
.topnav-link.active{color:var(--ink);font-weight:600;border-bottom-color:var(--accent)}

.me{display:flex;align-items:center;gap:.65rem;font-size:.85rem;color:var(--ink-muted);flex-shrink:0}
.me-name{font-weight:600;color:var(--ink)}
.me-public{color:var(--ink-muted);text-decoration:none;font-size:.82rem}
.me-public:hover{color:var(--ink)}

.subnav{
  display:flex;gap:.25rem;flex-wrap:wrap;
  padding:.55rem 2rem;
  max-width:1280px;margin:0 auto;
  border-top:1px solid var(--line);
}
.subnav-link{
  padding:.3rem .7rem;border-radius:999px;
  text-decoration:none;color:var(--ink-muted);font-size:.82rem;
  border:1px solid transparent;
  transition:background 120ms ease-out,color 120ms ease-out,border-color 120ms ease-out;
}
.subnav-link:hover{background:var(--line-soft);color:var(--ink)}
.subnav-link.active{background:var(--primary);color:#fff;border-color:var(--primary)}

.main{padding:2rem;max-width:1100px;margin:0 auto}

.flash{
  padding:.7rem 1rem;border-radius:10px;margin-bottom:1.25rem;font-weight:500;
  font-size:.92rem;
}
.flash-ok{background:var(--accent-soft);border:1px solid var(--accent);color:var(--primary)}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614}

.card{
  background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:1.5rem;box-shadow:var(--shadow);margin-bottom:1.25rem;
}
label{display:block;margin:0 0 1rem;font-size:.88rem;font-weight:500;color:var(--ink)}
input[type=text],input[type=email],input[type=password],input[type=date],input[type=datetime-local],input[type=tel],input[type=number],input[type=url],select,textarea{
  display:block;width:100%;margin-top:.3rem;
  padding:.6rem .75rem;
  border:1.5px solid var(--line);border-radius:8px;
  font:inherit;background:var(--surface);color:var(--ink);
  font-family:var(--font-ui);
  transition:border-color 120ms ease-out;
}
textarea{min-height:8rem;font-family:var(--font-ui);resize:vertical}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary)}

.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.4rem;
  padding:.6rem 1.05rem;border-radius:8px;border:1.5px solid transparent;
  font-family:var(--font-ui);font-weight:600;font-size:.9rem;
  cursor:pointer;text-decoration:none;
  transition:background 120ms ease-out,color 120ms ease-out,border-color 120ms ease-out;
}
.btn-primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.btn-primary:hover{background:var(--primary-hover);color:var(--accent);border-color:var(--primary-hover)}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--ink)}
.btn-ghost:hover{background:var(--ink);color:var(--bg)}
.btn-secondary{background:var(--accent);color:var(--ink);border-color:var(--accent)}
.btn-secondary:hover{background:var(--ink);color:var(--accent);border-color:var(--ink)}
.btn-danger{background:transparent;color:var(--danger);border-color:#f0bcb1}
.btn-danger:hover{background:#fbe8e3}
.btn.small{padding:.4rem .75rem;font-size:.82rem}

.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.muted{color:var(--ink-muted)}
.small{font-size:.85rem}
.back{color:var(--ink-muted);text-decoration:none;font-size:.85rem}
.back:hover{color:var(--ink)}

ul.items{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
ul.items li{
  background:var(--surface);border:1px solid var(--line);border-radius:10px;
  padding:.85rem 1rem;display:flex;justify-content:space-between;
  gap:1rem;align-items:center;
}
ul.items h3{margin:0 0 .15rem;font-size:.97rem;font-family:var(--font-ui);font-weight:600;letter-spacing:0}
ul.items p{margin:0;color:var(--ink-muted);font-size:.88rem;white-space:pre-wrap}

.pinned{
  background:var(--accent);color:var(--ink);font-size:.65rem;font-weight:700;
  padding:.15rem .5rem;border-radius:4px;letter-spacing:.06em;
  text-transform:uppercase;margin-right:.4rem;
}
.tag{
  display:inline-block;background:var(--surface-sand);border:1px solid var(--line);
  padding:.1rem .55rem;border-radius:999px;font-size:.74rem;color:var(--ink-soft);
  margin-right:.25rem;letter-spacing:.02em;
}
form.inline{display:inline}
.empty{
  padding:2rem;text-align:center;color:var(--ink-muted);
  background:var(--surface);border:1.5px dashed var(--line);border-radius:12px;
}

code{
  font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,monospace;
  background:var(--surface-sand);padding:1px 6px;border-radius:4px;
  font-size:.88em;
}

.diet-grid{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.4rem}
.diet-chip{
  display:inline-flex;align-items:center;gap:.4rem;background:var(--surface);
  border:1px solid var(--line);border-radius:999px;padding:.3rem .75rem;
  font-size:.82rem;cursor:pointer;margin:0;font-family:var(--font-ui);
  transition:border-color 120ms ease-out,background 120ms ease-out;
}
.diet-chip:hover{border-color:var(--primary)}
.diet-chip input{margin:0;width:auto}
.diet-chip:has(input:checked){background:var(--primary);color:#fff;border-color:var(--primary)}

@media (max-width:780px){
  .topbar-inner{padding:.75rem 1rem;flex-wrap:wrap;gap:.85rem}
  .topnav{order:3;flex-basis:100%;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch}
  .topnav-link{white-space:nowrap}
  .subnav{padding:.5rem 1rem;overflow-x:auto;flex-wrap:nowrap}
  .subnav-link{white-space:nowrap}
  .main{padding:1.25rem}
  /* Lists collapse to stacked rows so the right-hand action button
     doesn't push the title off-screen. */
  ul.items li{flex-direction:column;align-items:stretch;gap:.55rem}
  ul.items li > .row{justify-content:flex-start}
  /* Form rows go single-column. */
  .row{flex-direction:column;align-items:stretch}
  .row > label{flex:1 1 auto;width:100%}
}
/* Tables (training roster, audit log, reimbursements, ingredients)
   can be wider than the viewport. Scope a horizontal scroller onto
   the surrounding card so the table doesn't bleed off-screen on
   phones — the rest of the card's content is short enough that the
   horizontal scroll only kicks in for the table itself. */
.card:has(table.ing-table){overflow-x:auto;-webkit-overflow-scrolling:touch}
.ing-table{min-width:520px}
`;

function loginPage({ org, error }) {
  const errHtml = error ? `<div class="flash flash-err">${escape(error)}</div>` : "";
  const apex = escape(process.env.APEX_DOMAIN || "compass.app");
  // Google OAuth lives on the apex (single redirect URI). The callback sets
  // a session cookie scoped to COOKIE_DOMAIN; in production that's
  // `.compass.app` so the cookie is valid on this org subdomain too.
  const adminNext = encodeURIComponent(`https://${org.slug}.${process.env.APEX_DOMAIN || "compass.app"}/admin`);
  const googleHtml = googleConfigured
    ? `<a class="btn-google" href="https://${apex}/auth/google/start?next=${adminNext}">
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.63z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.36 0-4.36-1.6-5.07-3.74H.96v2.34A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.93 10.68A5.4 5.4 0 0 1 3.64 9c0-.58.1-1.15.29-1.68V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l2.97-2.34z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.98l2.97 2.34C4.64 5.18 6.64 3.58 9 3.58z"/>
  </svg>
  <span>Continue with Google</span>
</a>`
    : "";
  const appleHtml = appleConfigured
    ? `<a class="btn-google" style="background:#0f172a;color:#fff;border-color:#0f172a" href="https://${apex}/auth/apple/start?next=${adminNext}">
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
    <path d="M16.4 12.5c0-2.6 2.1-3.9 2.2-3.9-1.2-1.7-3-2-3.7-2-1.6-.2-3 .9-3.8.9-.8 0-2-.9-3.2-.9-1.7 0-3.2 1-4.1 2.5-1.7 3-.4 7.4 1.3 9.8.8 1.2 1.7 2.5 3 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0-.1-2.5-.9-2.4-3.7zM14.2 4.4c.7-.8 1.1-2 1-3.2-1 0-2.2.7-2.9 1.5-.7.7-1.2 1.9-1.1 3 1.2.1 2.4-.5 3-1.3z"/>
  </svg>
  <span>Continue with Apple</span>
</a>`
    : "";
  const oauthHtml = googleHtml || appleHtml
    ? `${googleHtml}${appleHtml}<div class="divider"><span>or with email</span></div>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(org.displayName)} — Admin sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f8fa;--surface:#ffffff;--ink:#0f172a;--ink-soft:#334155;--ink-muted:#64748b;--line:#e2e8f0;--line-soft:#eef1f5;--primary:#0f172a;--primary-hover:#020617;--accent:#1d4ed8;--accent-soft:#bcd0f4}
*{box-sizing:border-box}
body{margin:0;font-family:"Inter Tight","Inter",system-ui,sans-serif;color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.card{max-width:440px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:2.25rem 2rem;box-shadow:0 4px 20px rgba(15,23,42,.08)}
.kicker{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--primary);margin-bottom:.65rem}
h1{font-family:"Newsreader",Georgia,serif;font-size:2rem;font-weight:400;line-height:1.05;letter-spacing:-.025em;margin:0 0 .25rem}
h1 em{font-style:italic;color:var(--primary)}
p.lede{color:var(--ink-soft);margin:0 0 1.6rem;font-size:.95rem}
label{display:block;margin:0 0 1rem;font-size:.86rem;font-weight:600;color:var(--ink)}
input{display:block;width:100%;margin-top:.3rem;padding:.65rem .8rem;border:1.5px solid var(--line);border-radius:10px;font:inherit;background:var(--surface);color:var(--ink);font-family:"Inter Tight",sans-serif}
input:focus{outline:none;border-color:var(--primary)}
.btn{display:block;width:100%;padding:.78rem;border-radius:8px;border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-family:"Inter Tight",sans-serif;font-weight:600;cursor:pointer;font-size:.95rem;margin-top:.5rem;transition:background 120ms ease-out,color 120ms ease-out}
.btn:hover{background:var(--primary-hover);color:var(--accent)}
.btn-google{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.72rem;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none;font-weight:500;font-size:.95rem}
.btn-google:hover{border-color:var(--ink);background:var(--bg)}
.divider{display:flex;align-items:center;gap:.75rem;color:var(--ink-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;font-weight:600;margin:1.2rem 0}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--line)}
.flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.65rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.92rem}
small.help{display:block;color:var(--ink-muted);margin-top:1.1rem;font-size:.85rem;text-align:center}
small.help a{color:var(--primary);font-weight:600}
small.help a:hover{color:var(--primary-hover)}
</style></head><body>
<div class="card">
<div class="kicker">Compass admin</div>
<h1>${escape(org.displayName)}</h1>
<p class="lede">Sign in to manage this <em>${escape(String(org.unitType || "").toLowerCase() || "unit")}</em>.</p>
${errHtml}
${oauthHtml}
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

// Billing-gate. Reads (GET/HEAD/OPTIONS) always pass — leaders can see
// what they had even after a trial ends; only state-changing requests
// are blocked. Mounted as router-level middleware below so we don't
// have to wire it onto every POST individually.
//
// Always-allowed paths: /billing/* (so they can fix it), /logout (so
// they can sign out), /login (already public anyway). Anything else
// gets a 402-flavoured redirect to /admin/billing where the leader can
// subscribe / update card.
const ALWAYS_WRITEABLE_PATHS = [
  /^\/billing(\/|$)/,
  /^\/logout$/,
  /^\/login$/,
];

function billingGateMiddleware(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const path = req.path || "/";
  if (ALWAYS_WRITEABLE_PATHS.some((re) => re.test(path))) return next();
  if (!req.org) return next();
  const state = deriveBillingStatus(req.org);
  if (state.gate === "writeable") return next();
  // For HTML form posts, redirect to /admin/billing with a hint;
  // for JSON callers, return a 402.
  const accept = String(req.headers.accept || "");
  if (accept.includes("application/json")) {
    return res.status(402).json({
      error: "billing_required",
      status: state.status,
      reason: state.reason,
    });
  }
  return res.redirect(`/admin/billing?blocked=${encodeURIComponent(state.status)}`);
}

// Order matters: gate must run AFTER requireLeader (so we have req.org
// + req.user) but before any per-route handler. Express runs router-
// level middleware in declaration order, so this stays effective for
// every POST registered after this point.
adminRouter.use(billingGateMiddleware);

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
  res.type("html").send(layout(req, { title: "Dashboard", body: await renderDashboard(req) }));
});

// AdminBalanced dashboard render. Pulls a single view-model from
// lib/dashboard.js (testable, query-shape lives there) and produces
// the locked four-section layout: greeting band, color-coded stats row,
// two-column body (calendar + activity), roster preview strip.
async function renderDashboard(req) {
  const model = await buildDashboardModel({ prisma, orgId: req.org.id });
  return `
${dashboardCss()}
<section class="dash-greeting">
  <div class="dash-greeting-text">
    <span class="dash-eyebrow">${escape(req.org.displayName)} · This week</span>
    <h1 class="dash-headline">${escape(model.greeting.day)}<span class="dash-headline-italic">, ${escape(model.greeting.phase)}</span></h1>
    <p class="dash-summary">${dashboardSummaryLine(model)}</p>
  </div>
  <div class="dash-greeting-actions">
    <a class="dash-btn-ghost" href="/admin/content">Edit homepage</a>
    <a class="dash-btn-ghost" href="/admin/email">Send a message</a>
    <a class="dash-btn-accent" href="/admin/events">+ New event</a>
  </div>
</section>

<section class="dash-stats">
  ${dashboardStatCard("Scouts active", model.stats.scouts)}
  ${dashboardStatCard("Next event", model.stats.rsvps)}
  ${dashboardStatCard("Treasurer", model.stats.treasurer)}
  ${dashboardStatCard("Messages", model.stats.messages)}
</section>

<section class="dash-body">
  <div class="dash-col-events">
    <div class="dash-section-eyebrow">§ Calendar</div>
    <h2 class="dash-section-h">What's coming up.</h2>
    ${
      model.events.length
        ? model.events.map(dashboardEventRow).join("")
        : `<div class="empty">No upcoming events. <a href="/admin/events">Add one →</a></div>`
    }
  </div>
  <div class="dash-col-activity">
    <div class="dash-section-eyebrow">§ Activity</div>
    <h2 class="dash-section-h">The last few hours.</h2>
    ${
      model.activity.length
        ? model.activity.map(dashboardActivityRow).join("")
        : `<div class="empty muted small">Nothing new yet — when families RSVP, post photos or submit reimbursements they'll show up here.</div>`
    }
  </div>
</section>

<section class="dash-roster">
  <div class="dash-section-eyebrow">§ Roster</div>
  <div class="dash-roster-head">
    <h2 class="dash-section-h" style="margin:0">${model.rosterPreview.length} of your Scouts.</h2>
    <a class="dash-link" href="/admin/members">Manage roster →</a>
  </div>
  <div class="dash-roster-strip">
    ${model.rosterPreview.map(dashboardRosterChip).join("") ||
      `<div class="empty muted small">No youth members yet. <a href="/admin/members">Add or import →</a></div>`}
  </div>
  <div class="dash-photo-line">${escape(String(model.photosThisWeek))} photo${model.photosThisWeek === 1 ? "" : "s"} uploaded this week · <a class="dash-link" href="/admin/albums">browse →</a></div>
</section>
`;
}

function dashboardSummaryLine(model) {
  const parts = [];
  const e = model.events[0];
  if (e) {
    const d = e.startsAt.toISOString().slice(0, 10);
    parts.push(`Next up: <strong>${escape(e.title)}</strong> on ${escape(d)}`);
  }
  if (model.stats.treasurer.value !== "$0") {
    parts.push(`${escape(model.stats.treasurer.value)} ${escape(model.stats.treasurer.hint)}`);
  }
  if (!parts.length) parts.push("Nothing urgent — a quiet week.");
  return parts.join(" · ");
}

// The dashboard model emits semantic colour keys (e.g. "sky"); the
// renderer is the only layer that knows about CSS custom properties.
function paletteVar(key) {
  return `var(--${key})`;
}

function dashboardStatCard(label, stat) {
  const c = paletteVar(stat.color);
  return `
<div class="dash-stat" style="border-top-color:${c}">
  <div class="dash-stat-label" style="color:${c}">${escape(label)}</div>
  <div class="dash-stat-num">${escape(String(stat.value))}</div>
  <div class="dash-stat-hint">${escape(stat.hint)}</div>
</div>`;
}

function dashboardEventRow(e) {
  const c = paletteVar(e.color);
  const month = e.startsAt.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = String(e.startsAt.getUTCDate()).padStart(2, "0");
  const total = e.capacity || e.yes;
  const pct = total ? Math.min(100, Math.round((e.yes / total) * 100)) : 0;
  return `
<a class="dash-event-row" href="/admin/events/${escape(e.id)}/rsvps" style="border-top-color:${c}">
  <div class="dash-event-date" style="color:${c}">${escape(month)} ${escape(day)}</div>
  <div class="dash-event-meta">
    <div class="dash-event-name">${escape(e.title)}</div>
    <div class="dash-event-sub">${escape(e.category || "Event")} · ${escape(e.startsAt.toISOString().slice(0, 16).replace("T", " "))} UTC</div>
  </div>
  <div class="dash-event-rsvp">
    <div class="dash-event-rsvp-line">${e.yes} of ${total || "—"} replied</div>
    <div class="dash-bar"><div class="dash-bar-fill" style="width:${pct}%;background:${c}"></div></div>
  </div>
</a>`;
}

function dashboardActivityRow(a) {
  return `
<div class="dash-activity-row">
  <div class="dash-activity-icon" style="background:${paletteVar(a.color)};color:#fff">${dashboardActivityGlyph(a.icon)}</div>
  <div class="dash-activity-text">
    <div><strong>${escape(a.who)}</strong> <span class="muted">${escape(a.what)}</span></div>
    <div class="dash-activity-when">${escape(relativeTime(a.at))}</div>
  </div>
</div>`;
}

function dashboardActivityGlyph(icon) {
  if (icon === "check") return "✓";
  if (icon === "cash") return "$";
  if (icon === "post") return "✎";
  return "•";
}

function dashboardRosterChip(m) {
  const initials = `${m.firstName[0] || ""}${m.lastName[0] || ""}`.toUpperCase();
  return `
<a class="dash-roster-chip" href="/admin/members/${escape(m.id)}/edit" title="${escape(m.firstName)} ${escape(m.lastName)}">
  <span class="dash-roster-mark">${escape(initials)}</span>
  <span>
    <span class="dash-roster-name">${escape(m.firstName)} ${escape(m.lastName)}</span>
    <span class="dash-roster-patrol">${escape(m.patrol || "no patrol")}</span>
  </span>
</a>`;
}

function relativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d`;
  return new Date(date).toISOString().slice(0, 10);
}

function dashboardCss() {
  return `<style>
.dash-greeting{
  background:var(--surface-dark);color:#fff;border-radius:12px;
  padding:2.25rem 2rem;margin-bottom:1.75rem;
  display:flex;justify-content:space-between;align-items:flex-end;gap:1.5rem;flex-wrap:wrap;
}
.dash-eyebrow{
  display:inline-block;background:var(--accent);color:var(--ink);
  border-radius:999px;padding:.2rem .7rem;font-size:.66rem;
  letter-spacing:.14em;font-weight:700;text-transform:uppercase;margin-bottom:1rem;
}
.dash-headline{
  font-family:var(--font-display);font-size:60px;line-height:.95;
  letter-spacing:-.03em;font-weight:400;margin:0;color:#fff;
}
.dash-headline-italic{color:var(--accent);font-style:italic;font-weight:400}
.dash-summary{font-size:.92rem;color:rgba(255,255,255,.78);margin:.85rem 0 0;max-width:48ch}
.dash-summary strong{color:#fff;font-weight:600}
.dash-greeting-actions{display:flex;gap:.6rem;align-items:center}
.dash-btn-ghost,.dash-btn-accent{
  padding:.6rem 1.1rem;border-radius:999px;font-size:.86rem;
  text-decoration:none;font-weight:600;font-family:var(--font-ui);
  border:1.5px solid transparent;
}
.dash-btn-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
.dash-btn-ghost:hover{border-color:#fff}
.dash-btn-accent{background:var(--accent);color:var(--ink);border-color:var(--accent)}
.dash-btn-accent:hover{background:#fff;color:var(--ink);border-color:#fff}

.dash-stats{
  display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:2.25rem;
}
.dash-stat{
  background:var(--surface);border:1px solid var(--line);
  border-top:4px solid var(--primary);border-radius:8px;
  padding:1.1rem 1.3rem;
}
.dash-stat-label{
  font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;
  font-weight:700;margin-bottom:.5rem;
}
.dash-stat-num{
  font-family:var(--font-display);font-size:44px;font-weight:400;
  letter-spacing:-.025em;line-height:1;color:var(--ink);
}
.dash-stat-hint{font-size:.78rem;color:var(--ink-soft);margin-top:.6rem}

.dash-body{display:grid;grid-template-columns:1.5fr 1fr;gap:2.5rem;margin-bottom:2.25rem}
.dash-section-eyebrow{
  font-family:var(--font-display);font-size:.78rem;font-style:italic;
  color:var(--accent);margin-bottom:.35rem;letter-spacing:-.005em;
}
.dash-section-h{
  font-family:var(--font-display);font-size:26px;font-weight:400;
  margin:0 0 1.1rem;letter-spacing:-.015em;
}

.dash-event-row{
  display:grid;grid-template-columns:90px 1fr 200px;gap:1.25rem;align-items:center;
  padding:1.05rem 0;border-top:2px solid var(--primary);
  text-decoration:none;color:inherit;
}
.dash-event-row:hover{background:rgba(13,19,13,.02)}
.dash-event-date{
  font-family:var(--font-display);font-size:22px;font-weight:500;
  font-style:italic;letter-spacing:-.01em;
}
.dash-event-name{font-size:1rem;font-weight:600;color:var(--ink)}
.dash-event-sub{font-size:.78rem;color:var(--ink-soft);margin-top:.15rem}
.dash-event-rsvp-line{font-size:.78rem;color:var(--ink-soft);margin-bottom:.4rem}
.dash-bar{height:6px;background:var(--line-soft);border-radius:3px;overflow:hidden}
.dash-bar-fill{height:100%}

.dash-activity-row{
  display:flex;gap:.85rem;padding:.7rem 0;border-top:1px solid var(--line-soft);
}
.dash-activity-row:first-child{border-top-color:var(--line)}
.dash-activity-icon{
  width:32px;height:32px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-weight:700;font-size:.92rem;flex-shrink:0;
}
.dash-activity-text{flex:1;font-size:.86rem;line-height:1.4}
.dash-activity-when{font-size:.72rem;color:var(--ink-muted);margin-top:.15rem}

.dash-roster{margin-top:1.25rem}
.dash-roster-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1rem}
.dash-link{color:var(--ink);text-decoration:none;font-size:.84rem;font-weight:600;border-bottom:1.5px solid var(--accent)}
.dash-link:hover{color:var(--primary)}
.dash-roster-strip{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem}
.dash-roster-chip{
  display:inline-flex;align-items:center;gap:.55rem;
  background:var(--surface);border:1px solid var(--line);border-radius:999px;
  padding:.35rem .85rem .35rem .35rem;text-decoration:none;color:inherit;
  transition:border-color 120ms ease-out;
}
.dash-roster-chip:hover{border-color:var(--primary)}
.dash-roster-mark{
  width:30px;height:30px;border-radius:50%;background:var(--accent);
  color:var(--ink);font-weight:700;font-size:.72rem;
  display:grid;place-items:center;letter-spacing:.02em;
}
.dash-roster-name{display:block;font-size:.86rem;font-weight:600;line-height:1.1}
.dash-roster-patrol{display:block;font-size:.7rem;color:var(--ink-muted);margin-top:.1rem}
.dash-photo-line{font-size:.82rem;color:var(--ink-soft)}

@media (max-width:900px){
  .dash-stats{grid-template-columns:repeat(2,1fr)}
  .dash-body{grid-template-columns:1fr}
  .dash-event-row{grid-template-columns:70px 1fr;gap:.75rem}
  .dash-event-rsvp{grid-column:1/-1}
  .dash-headline{font-size:42px}
  .dash-greeting{padding:1.5rem 1.25rem}
}
</style>`;
}

/* ------------------------------------------------------------------ */
/* Page content                                                        */
/* ------------------------------------------------------------------ */

adminRouter.get("/content", requireLeader, async (req, res) => {
  const page = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const v = (k, fallback = "") => escape(page?.[k] ?? fallback);
  const body = `
    <h1>Homepage</h1>
    <p class="muted">Edit the copy and section order on your public site's front page. <a href="/" target="_blank" rel="noopener">View site ↗</a></p>
    <p class="muted small">${MARKDOWN_HINT}</p>
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
      <label>"What we do" body (free-form Markdown — sits between About and Join)
        <textarea name="whatWeDoBody" rows="5" placeholder="Camping, service projects, community partnerships, anything else.">${v("whatWeDoBody")}</textarea>
      </label>
      <h3 style="margin-top:1.25rem;margin-bottom:.4rem">Hero buttons</h3>
      <p class="muted small">Two CTAs on the hero. Leave both blank to show the default "Visit us / Calendar" pair.</p>
      <div class="row">
        <label style="margin:0;flex:1">Primary label<input name="ctaPrimaryLabel" type="text" value="${v("ctaPrimaryLabel")}" placeholder="Visit us"></label>
        <label style="margin:0;flex:1">Primary link<input name="ctaPrimaryLink" type="text" value="${v("ctaPrimaryLink")}" placeholder="/join or https://…"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Secondary label<input name="ctaSecondaryLabel" type="text" value="${v("ctaSecondaryLabel")}" placeholder="Calendar"></label>
        <label style="margin:0;flex:1">Secondary link<input name="ctaSecondaryLink" type="text" value="${v("ctaSecondaryLink")}" placeholder="/events"></label>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin">Cancel</a>
        ${page ? `<a class="btn btn-ghost" style="margin-left:auto" href="/admin/content/reset" onclick="return confirm('Reset to defaults?')">Reset to defaults</a>` : ""}
      </div>
    </form>

    <h2 style="margin-top:1.75rem">Custom blocks</h2>
    <p class="muted small">Drop in your own text, photos, or call-to-action cards. Each block appears in the section order below — drag it wherever you want it on the page.</p>
    ${customBlockRows(page)}
    <form class="card" method="post" action="/admin/content/blocks" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
      <span class="muted small" style="margin-right:.4rem">Add a block:</span>
      ${Object.entries(HOMEPAGE_BLOCK_TYPES)
        .map(
          ([key, meta]) => `
        <button class="btn btn-ghost small" type="submit" name="type" value="${escape(key)}">+ ${escape(meta.label)}</button>`,
        )
        .join("")}
    </form>

    <h2 style="margin-top:1.75rem">Section order &amp; visibility</h2>
    <p class="muted small">Drag the rows to reorder. Untick "Show" to hide a section. New section types added later auto-appear at the bottom.</p>
    <form class="card" method="post" action="/admin/content/sections">
      <ul id="sortable-sections" class="items" style="margin:0">
        ${sectionPlannerRows(page)}
      </ul>
      <button class="btn btn-primary" type="submit" style="margin-top:.6rem">Save layout</button>
    </form>
    <script>
      // Drag-reorder the section planner rows. Native HTML5 DnD is
      // sufficient — no library needed. We refresh the order[] hidden
      // inputs after each drop so the form posts the new order.
      (function () {
        const list = document.getElementById("sortable-sections");
        if (!list) return;
        let dragging = null;

        function getRow(target) {
          while (target && target !== list) {
            if (target.tagName === "LI") return target;
            target = target.parentNode;
          }
          return null;
        }

        list.addEventListener("dragstart", (e) => {
          const row = getRow(e.target);
          if (!row) return;
          dragging = row;
          row.style.opacity = "0.5";
          // Ensure dragover gets fired in Firefox.
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", row.dataset.key || "");
          }
        });

        list.addEventListener("dragend", () => {
          if (dragging) dragging.style.opacity = "1";
          dragging = null;
        });

        list.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (!dragging) return;
          const target = getRow(e.target);
          if (!target || target === dragging) return;
          const rect = target.getBoundingClientRect();
          const before = e.clientY < rect.top + rect.height / 2;
          if (before) target.parentNode.insertBefore(dragging, target);
          else target.parentNode.insertBefore(dragging, target.nextSibling);
        });

        // Touch fallback — promote a long-press into drag mode for
        // phones / tablets where HTML5 DnD doesn't fire.
        list.querySelectorAll("li").forEach((li) => {
          li.style.cursor = "grab";
          li.setAttribute("draggable", "true");
        });
      })();
    </script>

    <h2 style="margin-top:1.75rem">Testimonials</h2>
    <p class="muted small">Parent or alum quotes that appear in the testimonials block. Leave blank to hide the section.</p>
    <form class="card" method="post" action="/admin/content/testimonials">
      <div id="testimonials-list">
        ${testimonialFormRows(page)}
      </div>
      <button class="btn btn-primary" type="submit">Save testimonials</button>
    </form>

    <h2 style="margin-top:1.5rem">Theme</h2>
    <p class="muted small">Pick the colors and logo that show up on your unit's public site, the admin sidebar, and event date badges.</p>
    <form class="card" method="post" action="/admin/theme">
      <div class="row">
        <label style="margin:0;flex:1">Primary color
          <input name="primaryColor" type="color" value="${escape(req.org.primaryColor || "#1d6b39")}">
          <span class="muted small">${escape(req.org.primaryColor || "#1d6b39")}</span>
        </label>
        <label style="margin:0;flex:1">Accent color
          <input name="accentColor" type="color" value="${escape(req.org.accentColor || "#caa54a")}">
          <span class="muted small">${escape(req.org.accentColor || "#caa54a")}</span>
        </label>
      </div>
      <div class="theme-preview">
        <span class="theme-chip" style="background:${escape(req.org.primaryColor || "#1d6b39")}">Primary</span>
        <span class="theme-chip" style="background:${escape(req.org.accentColor || "#caa54a")};color:#15181c">Accent</span>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save theme</button>
        <a class="btn btn-ghost" style="margin-left:auto" href="/admin/theme/reset" onclick="return confirm('Reset to the default Compass evergreen + chartreuse?')">Reset to defaults</a>
      </div>
    </form>

    <h3 style="margin-top:1.25rem">Logo</h3>
    <p class="muted small">Square or wide images both work. Replaces the unit-number badge in the public site header. PNG / JPG / SVG / WebP.</p>
    <div class="card">
      ${
        req.org.logoFilename
          ? `<div class="logo-preview"><img src="/uploads/${escape(req.org.logoFilename)}" alt="Current logo"></div>`
          : `<p class="muted small">No logo uploaded yet — using the unit-number badge.</p>`
      }
      <form method="post" action="/admin/theme/logo" enctype="multipart/form-data">
        <label>Replace logo<input name="logo" type="file" accept="image/*" required></label>
        <button class="btn btn-primary" type="submit">Upload</button>
      </form>
      ${
        req.org.logoFilename
          ? `<form method="post" action="/admin/theme/logo/clear" onsubmit="return confirm('Remove the current logo?')" style="margin-top:.5rem">
               <button class="btn btn-ghost" type="submit">Remove logo</button>
             </form>`
          : ""
      }
    </div>

    <style>
      .theme-preview{display:flex;gap:.6rem;margin:.6rem 0}
      .theme-chip{display:inline-block;padding:.3rem .8rem;border-radius:6px;color:#fff;font-size:.85rem;font-weight:600}
      .logo-preview{margin-bottom:.75rem}
      .logo-preview img{max-height:80px;max-width:240px;border:1px solid #eef0e7;border-radius:8px;background:#fff;padding:.5rem}
    </style>
  `;
  res.type("html").send(layout(req, { title: "Page content", body }));
});

adminRouter.post("/content", requireLeader, async (req, res) => {
  const fields = [
    "heroHeadline",
    "heroLede",
    "aboutBody",
    "joinBody",
    "contactNote",
    "whatWeDoBody",
    "ctaPrimaryLabel",
    "ctaPrimaryLink",
    "ctaSecondaryLabel",
    "ctaSecondaryLink",
  ];
  const data = {};
  const changed = [];
  for (const f of fields) {
    const v = (req.body?.[f] ?? "").toString().trim();
    data[f] = v === "" ? null : v;
    if (v) changed.push(f);
  }
  await prisma.page.upsert({
    where: { orgId: req.org.id },
    update: data,
    create: { orgId: req.org.id, ...data },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Page",
    action: "update",
    summary: `Edited home page (${changed.join(", ") || "cleared"})`,
  });
  res.redirect("/admin/content?saved=1");
});

adminRouter.post("/content/sections", requireLeader, async (req, res) => {
  // Form posts arrive with order[]=hero, order[]=about, etc., and
  // visible[hero]=1, visible[about]=1 for checked rows.
  const order = Array.isArray(req.body?.order) ? req.body.order : [];
  const visMap = req.body?.visible && typeof req.body.visible === "object" ? req.body.visible : {};
  // Every known section key is implicitly hidden if not in visMap; we
  // walk the registry to build a complete map.
  const visibility = {};
  for (const key of order) {
    visibility[key] = visMap[key] === "1" || visMap[key] === true;
  }
  const existing = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const knownBlockIds = readHomepageCustomBlocks(existing).map((b) => b.id);
  let patch;
  try {
    patch = normaliseHomepageSectionPatch({ order, visibility }, { knownBlockIds });
  } catch (e) {
    return res.status(400).type("text/plain").send(e.message);
  }
  await prisma.page.upsert({
    where: { orgId: req.org.id },
    update: patch,
    create: { orgId: req.org.id, ...patch },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Page",
    action: "update",
    summary: "Homepage section layout updated",
  });
  res.redirect("/admin/content?saved=sections");
});

adminRouter.post("/content/testimonials", requireLeader, async (req, res) => {
  const quotes = req.body?.quote;
  const attrs = req.body?.attribution;
  const quoteList = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
  const attrList = Array.isArray(attrs) ? attrs : attrs ? [attrs] : [];
  const testimonials = quoteList
    .map((q, i) => ({
      quote: String(q || "").trim(),
      attribution: String(attrList[i] || "").trim(),
    }))
    .filter((t) => t.quote);
  await prisma.page.upsert({
    where: { orgId: req.org.id },
    update: { testimonialsJson: testimonials.length ? testimonials : null },
    create: { orgId: req.org.id, testimonialsJson: testimonials.length ? testimonials : null },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Page",
    action: "update",
    summary: `Testimonials updated (${testimonials.length})`,
  });
  res.redirect("/admin/content?saved=testimonials");
});

// Custom homepage blocks — Squarespace-style "drop in a text/image/CTA"
// path. POST creates a fresh draft block of the chosen type and
// redirects to its edit page. The block lives in Page.customBlocks
// (JSONB array); section ordering treats it as "block:<id>".
adminRouter.post("/content/blocks", requireLeader, async (req, res) => {
  const type = String(req.body?.type || "");
  if (!HOMEPAGE_BLOCK_TYPES[type]) return res.redirect("/admin/content");

  const id = `cb_${crypto.randomBytes(6).toString("hex")}`;
  const fresh = normaliseHomepageCustomBlock({ id, type });

  const existing = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const blocks = readHomepageCustomBlocks(existing);
  blocks.push(fresh);

  await prisma.page.upsert({
    where: { orgId: req.org.id },
    update: { customBlocks: blocks },
    create: { orgId: req.org.id, customBlocks: blocks },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Page",
    action: "create",
    summary: `Added ${HOMEPAGE_BLOCK_TYPES[type].label} block`,
  });
  res.redirect(`/admin/content/blocks/${id}/edit`);
});

adminRouter.get("/content/blocks/:id/edit", requireLeader, async (req, res) => {
  const page = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const block = readHomepageCustomBlocks(page).find((b) => b.id === req.params.id);
  if (!block) return res.status(404).send("Block not found");
  const typeMeta = HOMEPAGE_BLOCK_TYPES[block.type];

  let fields;
  if (block.type === "text") {
    fields = `
      <label>Heading
        <input name="title" type="text" maxlength="120" value="${escape(block.title || "")}" placeholder="e.g. Our story">
      </label>
      <label>Body (Markdown supported)
        <textarea name="body" rows="8" placeholder="Tell visitors something about your unit.">${escape(block.body || "")}</textarea>
      </label>`;
  } else if (block.type === "image") {
    const preview = block.filename
      ? `<div style="margin-bottom:.6rem"><img src="/uploads/${escape(block.filename)}" alt="" style="max-width:100%;max-height:240px;border-radius:8px;border:1px solid #eef0e7"></div>`
      : `<p class="muted small" style="margin:0 0 .6rem">No image uploaded yet. Upload one below.</p>`;
    fields = `
      ${preview}
      <p class="muted small">Upload a new image from the Photos section first, then paste the filename here. (We'll add a one-click picker in a future polish pass.)</p>
      <label>Image filename
        <input name="filename" type="text" maxlength="200" value="${escape(block.filename || "")}" placeholder="e.g. spring-camporee.jpg">
      </label>
      <label>Caption (optional)
        <input name="caption" type="text" maxlength="200" value="${escape(block.caption || "")}" placeholder="What's in the photo?">
      </label>
      <label>Alt text (for screen readers)
        <input name="alt" type="text" maxlength="200" value="${escape(block.alt || "")}" placeholder="Brief description">
      </label>`;
  } else if (block.type === "cta") {
    fields = `
      <label>Heading
        <input name="title" type="text" maxlength="120" value="${escape(block.title || "")}" placeholder="e.g. Ready to join?">
      </label>
      <label>Body
        <textarea name="body" rows="3" placeholder="A short blurb under the heading.">${escape(block.body || "")}</textarea>
      </label>
      <div class="row">
        <label style="margin:0;flex:1">Button label<input name="buttonLabel" type="text" maxlength="60" value="${escape(block.buttonLabel || "")}" placeholder="Visit us"></label>
        <label style="margin:0;flex:1">Button link<input name="buttonLink" type="text" maxlength="500" value="${escape(block.buttonLink || "")}" placeholder="/join or https://…"></label>
      </div>`;
  }

  const body = `
    <a class="back" href="/admin/content" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Homepage</a>
    <h1>Edit ${escape(typeMeta.label)} block</h1>
    <p class="muted">${escape(typeMeta.description)}</p>

    <form class="card" method="post" action="/admin/content/blocks/${escape(block.id)}">
      ${fields}
      <div class="row" style="margin-top:.4rem">
        <button class="btn btn-primary" type="submit">Save block</button>
        <a class="btn btn-ghost" href="/admin/content">Cancel</a>
        <form class="inline" method="post" action="/admin/content/blocks/${escape(block.id)}/delete" onsubmit="return confirm('Delete this block?')" style="margin-left:auto">
          <button class="btn btn-danger" type="submit">Delete block</button>
        </form>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: `Edit ${typeMeta.label} block`, body }));
});

adminRouter.post("/content/blocks/:id", requireLeader, async (req, res) => {
  const page = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const blocks = readHomepageCustomBlocks(page);
  const idx = blocks.findIndex((b) => b.id === req.params.id);
  if (idx === -1) return res.status(404).send("Block not found");

  let updated;
  try {
    updated = normaliseHomepageCustomBlock({ ...blocks[idx], ...req.body, id: blocks[idx].id, type: blocks[idx].type });
  } catch (e) {
    return res.status(400).type("text/plain").send(e.message);
  }
  blocks[idx] = updated;

  await prisma.page.update({
    where: { orgId: req.org.id },
    data: { customBlocks: blocks },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Page",
    action: "update",
    summary: `Edited ${HOMEPAGE_BLOCK_TYPES[updated.type].label} block`,
  });
  res.redirect("/admin/content?saved=block");
});

adminRouter.post("/content/blocks/:id/delete", requireLeader, async (req, res) => {
  const page = await prisma.page.findUnique({ where: { orgId: req.org.id } });
  const blocks = readHomepageCustomBlocks(page);
  const target = blocks.find((b) => b.id === req.params.id);
  const remaining = blocks.filter((b) => b.id !== req.params.id);

  // Also drop the block's key from sectionOrder / sectionVisibility so
  // the planner doesn't render a stale row.
  const blockKey = homepageBlockKey(req.params.id);
  const order = Array.isArray(page?.sectionOrder)
    ? page.sectionOrder.filter((k) => k !== blockKey)
    : null;
  const vis = page?.sectionVisibility ? { ...page.sectionVisibility } : null;
  if (vis) delete vis[blockKey];

  await prisma.page.update({
    where: { orgId: req.org.id },
    data: {
      customBlocks: remaining,
      ...(order ? { sectionOrder: order } : {}),
      ...(vis ? { sectionVisibility: vis } : {}),
    },
  });
  if (target) {
    await recordAudit({
      org: req.org,
      user: req.user,
      entityType: "Page",
      action: "delete",
      summary: `Removed ${HOMEPAGE_BLOCK_TYPES[target.type]?.label || "custom"} block`,
    });
  }
  res.redirect("/admin/content");
});

adminRouter.get("/content/reset", requireLeader, async (req, res) => {
  await prisma.page.deleteMany({ where: { orgId: req.org.id } });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Page",
    action: "delete",
    summary: "Reset home page to defaults",
  });
  res.redirect("/admin/content");
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
adminRouter.post("/theme", requireLeader, async (req, res) => {
  const primary = (req.body?.primaryColor || "").toString().trim();
  const accent = (req.body?.accentColor || "").toString().trim();
  const data = {};
  if (HEX_COLOR.test(primary)) data.primaryColor = primary;
  if (HEX_COLOR.test(accent)) data.accentColor = accent;
  if (Object.keys(data).length) {
    await prisma.org.update({ where: { id: req.org.id }, data });
  }
  res.redirect("/admin/content");
});

adminRouter.get("/theme/reset", requireLeader, async (req, res) => {
  await prisma.org.update({
    where: { id: req.org.id },
    data: { primaryColor: "#1d6b39", accentColor: "#caa54a" },
  });
  res.redirect("/admin/content");
});

adminRouter.post(
  "/theme/logo",
  requireLeader,
  upload.single("logo"),
  async (req, res) => {
    if (!req.file) return res.redirect("/admin/content");
    const ext = (req.file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || "png").toLowerCase();
    const filename = `logo-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    await moveFromTemp(req.org.id, filename, req.file.path);

    // Clean up the previous logo file (best-effort).
    if (req.org.logoFilename) {
      try {
        await removeFile(req.org.id, req.org.logoFilename);
      } catch (_) {
        // ignore — old file may already be gone
      }
    }

    await prisma.org.update({
      where: { id: req.org.id },
      data: { logoFilename: filename },
    });
    await recordAudit({
      org: req.org,
      user: req.user,
      entityType: "Org",
      entityId: req.org.id,
      action: "update",
      summary: "Uploaded new logo",
    });
    res.redirect("/admin/content");
  },
);

adminRouter.post("/theme/logo/clear", requireLeader, async (req, res) => {
  if (req.org.logoFilename) {
    try {
      await removeFile(req.org.id, req.org.logoFilename);
    } catch (_) {
      // best-effort
    }
  }
  await prisma.org.update({
    where: { id: req.org.id },
    data: { logoFilename: null },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Org",
    entityId: req.org.id,
    action: "delete",
    summary: "Removed logo",
  });
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
      <p class="muted small" style="margin-top:-.4rem">${MARKDOWN_HINT}</p>
      <div class="row">
        <label style="margin:0"><input name="pinned" type="checkbox" value="1" style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Pin to the top</label>
        <label style="margin:0;flex:1">Expires (optional)<input name="expiresAt" type="date"></label>
      </div>
      <button class="btn btn-primary" type="submit">Publish</button>
    </form>

    <h2 style="margin-top:1.5rem">Published</h2>
    ${list.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No announcements yet. Publish your first one above.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Announcements", body }));
});

adminRouter.post("/announcements", requireLeader, async (req, res) => {
  const { title, body, pinned, expiresAt } = req.body || {};
  if (!title?.trim() || !body?.trim()) return res.redirect("/admin/announcements");
  const created = await prisma.announcement.create({
    data: {
      orgId: req.org.id,
      authorId: req.user.id,
      title: title.trim(),
      body: body.trim(),
      pinned: pinned === "1",
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Announcement",
    entityId: created.id,
    action: "create",
    summary: `Published "${created.title}"`,
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
      <p class="muted small" style="margin-top:-.4rem">${MARKDOWN_HINT}</p>
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
  res.type("html").send(layout(req, { title: "Edit announcement", body }));
});

adminRouter.post("/announcements/:id", requireLeader, async (req, res) => {
  const a = await prisma.announcement.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, title: true },
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
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Announcement",
    entityId: a.id,
    action: "update",
    summary: `Edited "${title?.trim() || a.title}"`,
  });
  res.redirect("/admin/announcements");
});

adminRouter.post("/announcements/:id/delete", requireLeader, async (req, res) => {
  const a = await prisma.announcement.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { title: true },
  });
  await prisma.announcement.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Announcement",
    entityId: req.params.id,
    action: "delete",
    summary: a ? `Deleted "${a.title}"` : `Deleted announcement`,
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
            : "linear-gradient(135deg,var(--primary),var(--accent))"
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
  res.type("html").send(layout(req, { title: "Photos & albums", body }));
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
  res.type("html").send(layout(req, { title: album.title, body }));
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
      <h3 style="margin-top:1rem">Recurrence</h3>
      <div class="row">
        <label style="margin:0;flex:1">Repeats
          <select name="recurrence">
            <option value="">Doesn't repeat</option>
            <option value="WEEKLY"${/^FREQ=WEEKLY/.test(event?.rrule || "") ? " selected" : ""}>Weekly</option>
            <option value="BIWEEKLY"${/^FREQ=WEEKLY;INTERVAL=2/.test(event?.rrule || "") ? " selected" : ""}>Every 2 weeks</option>
            <option value="MONTHLY"${/^FREQ=MONTHLY/.test(event?.rrule || "") ? " selected" : ""}>Monthly (same day)</option>
            <option value="CUSTOM"${event?.rrule && !/^FREQ=(WEEKLY|MONTHLY)/.test(event.rrule) ? " selected" : ""}>Custom RRULE…</option>
          </select>
        </label>
        <label style="margin:0;flex:1">Until (optional)
          <input name="recurrenceUntil" type="date" value="${event?.recurrenceUntil ? new Date(event.recurrenceUntil).toISOString().slice(0, 10) : ""}">
        </label>
      </div>
      <label>Custom RRULE (only used when Repeats = Custom)
        <input name="rruleCustom" type="text" maxlength="200" placeholder="e.g. FREQ=MONTHLY;BYDAY=1TU" value="${event?.rrule && !/^FREQ=(WEEKLY|MONTHLY)/.test(event.rrule) ? escape(event.rrule) : ""}">
      </label>
      <h3 style="margin-top:1rem">Credits per attendee</h3>
      <p class="muted small" style="margin-top:-.4rem">Each member with a "yes" RSVP earns these. Service hours feed Eagle / rank requirements; camping nights and hiking miles feed Camping &amp; Hiking awards.</p>
      <div class="row">
        <label style="margin:0;flex:1">Service hours<input name="serviceHours" type="number" step="0.5" min="0" max="999" value="${escape(event?.serviceHours ?? "")}"></label>
        <label style="margin:0;flex:1">Camping nights<input name="campingNights" type="number" min="0" max="60" value="${escape(event?.campingNights ?? "")}"></label>
        <label style="margin:0;flex:1">Hiking miles<input name="hikingMiles" type="number" step="0.1" min="0" max="999" value="${escape(event?.hikingMiles ?? "")}"></label>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">${escape(submitLabel)}</button>
        <a class="btn btn-ghost" href="/admin/events">Cancel</a>
      </div>
    </form>`;
}

function eventDataFromBody(body) {
  const cost = body?.cost ? parseInt(body.cost, 10) : null;
  const capacity = body?.capacity ? parseInt(body.capacity, 10) : null;

  let rrule = null;
  switch (body?.recurrence) {
    case "WEEKLY":
      rrule = "FREQ=WEEKLY";
      break;
    case "BIWEEKLY":
      rrule = "FREQ=WEEKLY;INTERVAL=2";
      break;
    case "MONTHLY":
      rrule = "FREQ=MONTHLY";
      break;
    case "CUSTOM":
      rrule = (body?.rruleCustom || "").trim() || null;
      break;
  }
  const recurrenceUntil = body?.recurrenceUntil ? new Date(body.recurrenceUntil) : null;

  const sh = parseFloat(body?.serviceHours);
  const cn = parseInt(body?.campingNights, 10);
  const hm = parseFloat(body?.hikingMiles);

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
    serviceHours: Number.isFinite(sh) && sh > 0 ? sh : null,
    campingNights: Number.isFinite(cn) && cn > 0 ? cn : null,
    hikingMiles: Number.isFinite(hm) && hm > 0 ? hm : null,
    rrule,
    recurrenceUntil,
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

  const renderRow = (e) => {
    const meta = e.category ? eventCategoryMeta(e.category) : null;
    const tag = meta
      ? `<span class="tag" style="background:var(--${meta.color});${meta.color === "accent" || meta.color === "butter" ? "color:var(--ink)" : "color:#fff"};border-color:var(--${meta.color})">${escape(meta.label)}</span>`
      : "";
    return `
    <li>
      <div>
        <h3>${escape(e.title)} ${tag}</h3>
        <p>${escape(
          e.startsAt.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        )}${e.location ? ` · ${escape(e.location)}` : ""}</p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/rsvps">RSVPs</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/announce">Announce</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/slots">Sign-up sheet</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/plan">Trip plan</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/rides">Carpool</a>
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/report">Report</a>
        ${
          e.category === "Court of Honor"
            ? `<a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/program">Program</a>`
            : ""
        }
        <a class="btn btn-ghost small" href="/admin/events/${escape(e.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/events/${escape(e.id)}/delete" onsubmit="return confirm('Delete this event?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`;
  };

  const subscribeUrl = `https://${req.org.slug}.${process.env.APEX_DOMAIN || "compass.app"}/calendar.ics`;
  const body = `
    <h1>Calendar</h1>
    <p class="muted">Members can <strong>subscribe</strong> to your event feed and have every event you publish show up on their phone calendar automatically.</p>
    <div class="card" style="margin-bottom:1rem;background:#faf3e3;border:1px solid #1d4ed8">
      <div class="row" style="align-items:center;gap:.6rem">
        <code style="flex:1;background:#fff;padding:.45rem .65rem;border-radius:6px;border:1px solid #e2e8f0;overflow:auto;white-space:nowrap">${escape(subscribeUrl)}</code>
        <button type="button" class="btn btn-ghost small" onclick="navigator.clipboard.writeText('${escape(subscribeUrl)}').then(()=>{this.textContent='Copied'},()=>{this.textContent='Copy failed'})">Copy</button>
      </div>
      <p class="muted small" style="margin:.5rem 0 0">Share this URL in a welcome email or post it on your public site. Google Calendar / Apple Calendar / Outlook all accept it via "Subscribe to calendar from URL". Updates fan out automatically when the calendar refreshes (typically every few hours).</p>
    </div>

    <div id="admin-fc" class="admin-fc-host" aria-busy="true">
      <p class="muted small" style="text-align:center;padding:2rem">Loading calendar…</p>
    </div>
    <noscript>
      <p class="muted small" style="text-align:center;padding:1rem;background:#fff;border:1px solid #eef0e7;border-radius:10px;margin-bottom:1rem">
        Calendar control needs JavaScript. The full event list is below.
      </p>
    </noscript>

    <h2 style="margin-top:1.25rem">New event</h2>
    ${eventForm({ event: null, action: "/admin/events", submitLabel: "Create event" })}

    <h2 style="margin-top:1.5rem">Upcoming</h2>
    ${upcoming.length ? `<ul class="items">${upcoming.map(renderRow).join("")}</ul>` : `<div class="empty">Nothing on the calendar yet.</div>`}

    ${
      past.length
        ? `<h2 style="margin-top:2rem">Past (last 20)</h2><ul class="items">${past.map(renderRow).join("")}</ul>`
        : ""
    }

    <script src="/vendor/fullcalendar/index.global.min.js" defer></script>
    <script>
      (function () {
        function init() {
          var host = document.getElementById("admin-fc");
          if (!host) return;
          if (typeof FullCalendar === "undefined") {
            host.removeAttribute("aria-busy");
            host.innerHTML = '<p class="muted small" style="text-align:center;padding:1rem">Calendar control failed to load — see the event lists below.</p>';
            return;
          }
          host.removeAttribute("aria-busy");
          host.innerHTML = "";
          var cal = new FullCalendar.Calendar(host, {
            initialView: "dayGridMonth",
            headerToolbar: {
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,listMonth,multiMonthYear",
            },
            buttonText: { today: "Today", month: "Month", week: "Week", list: "List", multiMonthYear: "Year" },
            height: "auto",
            firstDay: 0,
            nowIndicator: true,
            dayMaxEventRows: 3,
            eventDisplay: "block",
            eventTimeFormat: { hour: "numeric", minute: "2-digit", meridiem: "short" },
            events: "/calendar.json",
            // Click an event in the admin grid → land on the RSVPs page
            // (where the leader can also reach Announce, Trip plan,
            // Carpool, etc. via tabs).
            eventClick: function (info) {
              info.jsEvent.preventDefault();
              window.location.href = "/admin/events/" + info.event.id + "/rsvps";
            },
            // Click an empty cell → pre-fill the New event form's date.
            dateClick: function (info) {
              var input = document.querySelector('input[name="startsAt"]');
              if (input && input.type === "datetime-local") {
                var d = info.date;
                var pad = function (n) { return String(n).padStart(2, "0"); };
                input.value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T19:00";
                input.scrollIntoView({ behavior: "smooth", block: "center" });
                input.focus();
              }
            },
          });
          cal.render();
        }
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", init);
        } else {
          init();
        }
      })();
    </script>

    <style>
      .admin-fc-host{background:#fff;border:1px solid #eef0e7;border-radius:12px;padding:1.1rem;margin-bottom:1.5rem;box-shadow:0 1px 2px rgba(15,58,31,.04)}
      .admin-fc-host.fc{font-family:inherit}
      .fc .fc-toolbar-title{font-family:'Inter Tight',Inter,sans-serif;font-size:1.3rem;font-weight:600;letter-spacing:-0.01em;color:var(--ink-900,#0f172a)}
      .fc .fc-button{background:#f7f4e8;border:1px solid #e2dab8;color:#3a4036;font-weight:600;text-transform:none;box-shadow:none;padding:.4rem .8rem;font-size:.85rem}
      .fc .fc-button:hover{background:#efe9d2;border-color:#cdc093}
      .fc .fc-button:focus{box-shadow:0 0 0 2px rgba(14,51,32,.18)}
      .fc .fc-button-primary:not(:disabled).fc-button-active,
      .fc .fc-button-primary:not(:disabled):active{background:#1d6b39;border-color:#1d6b39;color:#fff}
      .fc .fc-col-header-cell-cushion{font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748b;padding:.55rem 0}
      .fc .fc-day-today{background:#fffbe6 !important}
      .fc .fc-event{cursor:pointer;border-radius:5px;font-size:.78rem;font-weight:500}
      .fc .fc-event:hover{filter:brightness(1.05)}
      @media (max-width:720px){
        .admin-fc-host{padding:.6rem}
        .fc .fc-toolbar{gap:.4rem}
        .fc .fc-toolbar-title{font-size:1.05rem}
        .fc .fc-button{padding:.32rem .55rem;font-size:.78rem}
      }
    </style>
  `;
  res.type("html").send(layout(req, { title: "Calendar", body }));
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
  res.type("html").send(layout(req, { title: "Edit event", body }));
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
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
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
  res.type("html").send(layout(req, { title: `RSVPs · ${ev.title}`, body }));
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

  const apex = process.env.APEX_DOMAIN || "compass.app";
  const base = trackingBaseUrl(req);
  const mailLogId = newMailLogId();

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
    return trackEmail({
      baseUrl: base,
      mailLogId,
      recipient: m.email,
      to: m.email,
      subject: `RSVP: ${ev.title}`,
      text,
      from: `${req.user.displayName.replace(/[<>"]/g, "")} (via ${req.org.displayName.replace(/[<>"]/g, "")}) <noreply@${req.org.slug}.${apex}>`,
      replyTo: req.user.email,
    });
  });

  const result = await sendBatch(messages);

  await prisma.mailLog.create({
    data: {
      id: mailLogId,
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

// Event-announcement composer. Differs from /admin/email in that the
// body is *event-specific* — recipients get a templated email with the
// event title/when/where/description, one-click RSVP buttons, and a
// visible "Sent to:" footer of the audience names so families can
// confirm they were on the list (modeled on the troopwebhost roster
// blast). Reuses audienceFor + emailableMembers + sendBatch + mailLog.
adminRouter.get("/events/:id/announce", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const [patrols, subgroups] = await Promise.all([
    prisma.member.findMany({
      where: { orgId: req.org.id, patrol: { not: null } },
      distinct: ["patrol"],
      select: { patrol: true },
      orderBy: { patrol: "asc" },
    }),
    prisma.subgroup.findMany({ where: { orgId: req.org.id }, orderBy: { name: "asc" } }),
  ]);
  const patrolOptions = patrols
    .map((p) => `<option value="${escape(p.patrol)}">${escape(p.patrol)}</option>`)
    .join("");
  const subgroupOptions = subgroups
    .map(
      (g) => `<option value="subgroup:${escape(g.id)}">${escape(g.name)} — ${escape(describeSubgroup(g))}</option>`,
    )
    .join("");

  const when = ev.startsAt.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
    <h1>Announce event</h1>
    <p class="muted" style="margin:.2rem 0 0">${escape(ev.title)}</p>
    <p class="muted small" style="margin:.2rem 0 .8rem">${escape(when)}${ev.location ? ` · ${escape(ev.location)}` : ""} · Mail driver: <code>${escape(mailDriver)}</code>${
      mailDriver === "console" ? " (logged to console, no real email)" : ""
    }</p>

    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/announce">
      <div class="row">
        <label style="margin:0;flex:1">Audience
          <select name="audience">
            ${AUDIENCES.map(
              (a) => `<option value="${escape(a.value)}">${escape(a.label)}</option>`
            ).join("")}
            ${
              subgroups.length
                ? `<optgroup label="Saved subgroups">${subgroupOptions}</optgroup>`
                : ""
            }
          </select>
        </label>
        <label style="margin:0;flex:1">Patrol (if "Specific patrol")
          <select name="patrol">
            <option value="">—</option>
            ${patrolOptions}
          </select>
        </label>
      </div>
      <p class="muted small" style="margin:.6rem 0 1rem">Build new audiences in <a href="/admin/subgroups">Subgroups</a>.</p>

      <label>Subject
        <input name="subject" type="text" maxlength="200" value="${escape(`Action needed: ${ev.title}`)}">
        <span class="muted small" style="display:block;margin-top:.25rem">Defaults work fine. Edit if you want a different headline.</span>
      </label>

      <label>Extra message <span class="muted small" style="font-weight:400">(optional — appears above the event details)</span>
        <textarea name="intro" rows="4" placeholder="Add context, reminders, what to bring, etc."></textarea>
      </label>

      <label style="display:flex;align-items:center;gap:.55rem;margin:.6rem 0 1rem;font-weight:400">
        <input type="checkbox" name="includeRoster" value="1" checked style="width:auto;margin:0">
        <span>Include the recipient list ("Sent to: …") at the bottom of the email</span>
      </label>

      <div class="row" style="margin-top:.2rem;gap:.5rem">
        <button class="btn btn-primary" type="submit" name="action" value="send">Send announcement</button>
        <button class="btn btn-ghost" type="submit" name="action" value="preview">Preview audience</button>
        <a class="btn btn-ghost" href="/admin/events" style="margin-left:auto">Cancel</a>
      </div>
    </form>

    <details class="card" style="margin-top:1rem;background:#fbf8ee">
      <summary style="cursor:pointer;font-weight:600">What recipients will see</summary>
      <p class="muted small" style="margin:.6rem 0 .4rem">Each recipient gets a personalized email with their own one-click RSVP buttons.</p>
      <ul class="muted small" style="margin:.2rem 0 0;padding-left:1.2rem;line-height:1.6">
        <li>Headline + event title, when, where, and any description</li>
        <li>Yes / Maybe / Can't make it buttons (no login required)</li>
        <li>Link to the full event page</li>
        <li>Optional "Sent to:" roster of names</li>
        <li>Unsubscribe link in the footer (List-Unsubscribe header set)</li>
      </ul>
    </details>
  `;
  res.type("html").send(layout(req, { title: `Announce · ${ev.title}`, body }));
});

adminRouter.post("/events/:id/announce", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const { audience, patrol, subject, intro, action, includeRoster } = req.body || {};
  const orgId = req.org.id;

  const all = await audienceFor(orgId, audience, patrol);
  const recipients = emailableMembers(all);

  let audienceLabel;
  if (audience === "patrol") {
    audienceLabel = `Patrol: ${patrol || "—"}`;
  } else if (typeof audience === "string" && audience.startsWith("subgroup:")) {
    const sg = await prisma.subgroup.findFirst({
      where: { id: audience.slice("subgroup:".length), orgId },
      select: { name: true },
    });
    audienceLabel = sg ? `Subgroup: ${sg.name}` : "Subgroup";
  } else {
    audienceLabel = AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone";
  }

  if (action === "preview") {
    const list = all
      .map(
        (m) =>
          `<li>${escape(m.firstName)} ${escape(m.lastName)}${m.patrol ? ` <span class="tag">${escape(m.patrol)}</span>` : ""} <span class="muted small">${escape(m.email || "(no email)")} · pref:${escape(m.commPreference)}</span></li>`
      )
      .join("");
    const skipped = all.length - recipients.length;
    const previewBody = `
      <a class="back" href="/admin/events/${escape(ev.id)}/announce" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Back to compose</a>
      <h1>Audience preview</h1>
      <p class="muted">${escape(ev.title)} · ${escape(audienceLabel)}</p>
      <p>${all.length} member${all.length === 1 ? "" : "s"} match. Email-eligible: <strong>${recipients.length}</strong> · Skipped (no email / unsubscribed / bounced): <strong>${skipped}</strong></p>
      <ul class="items">${list || `<li class="empty">Nobody matches this audience.</li>`}</ul>
    `;
    return res.type("html").send(layout(req, { title: "Audience preview", body: previewBody }));
  }

  const cleanSubject = (subject || `Action needed: ${ev.title}`).trim().slice(0, 200);
  const cleanIntro = (intro || "").trim();
  const wantRoster = includeRoster === "1" || includeRoster === "on";

  const mailLogId = newMailLogId();
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const base = trackingBaseUrl(req);

  const when = ev.startsAt.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const rosterNames = wantRoster
    ? recipients.map((m) => `${m.firstName} ${m.lastName}`).sort()
    : [];

  const messages = recipients.map((m) => {
    const name = `${m.firstName} ${m.lastName}`;
    const token = makeRsvpToken({ eventId: ev.id, name, email: m.email });
    const yesUrl = `${base}/rsvp/${token}?response=yes`;
    const maybeUrl = `${base}/rsvp/${token}?response=maybe`;
    const noUrl = `${base}/rsvp/${token}?response=no`;
    const eventUrl = `${base}/events/${ev.id}`;
    const unsubToken = makeUnsubToken({ memberId: m.id, orgId });
    const unsubUrl = `${base}/unsubscribe/${unsubToken}`;

    const lines = [`Hi ${m.firstName},`, ""];
    if (cleanIntro) {
      lines.push(cleanIntro, "");
    }
    lines.push(
      `${ev.title}`,
      `When:  ${when}`,
    );
    if (ev.location) lines.push(`Where: ${ev.location}`);
    if (ev.description) {
      lines.push("", ev.description.trim());
    }
    lines.push(
      "",
      "RSVP in one click:",
      `  Going:        ${yesUrl}`,
      `  Maybe:        ${maybeUrl}`,
      `  Can't make it: ${noUrl}`,
      "",
      `Event details: ${eventUrl}`,
    );
    if (rosterNames.length) {
      lines.push(
        "",
        `Sent to: ${rosterNames.join(", ")}`,
      );
    }
    lines.push(
      "",
      "—",
      `${req.org.displayName}`,
      `Unsubscribe: ${unsubUrl}`,
    );

    return trackEmail({
      baseUrl: base,
      mailLogId,
      recipient: m.email,
      to: m.email,
      subject: cleanSubject,
      text: lines.join("\n"),
      from: `${req.user.displayName.replace(/[<>"]/g, "")} (via ${req.org.displayName.replace(/[<>"]/g, "")}) <noreply@${req.org.slug}.${apex}>`,
      replyTo: req.user.email,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}?one_click=1>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  });

  const result = messages.length
    ? await sendBatch(messages)
    : { sent: 0, errors: [] };

  await prisma.mailLog.create({
    data: {
      id: mailLogId,
      orgId,
      authorId: req.user.id,
      subject: cleanSubject,
      body: `Announcement for ${ev.title}${cleanIntro ? `\n\n${cleanIntro}` : ""}`,
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

  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Event",
    entityId: ev.id,
    action: "announce",
    summary: `Announced "${ev.title}" to ${audienceLabel} (${result.sent} sent)`,
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

const SLOT_TEMPLATES = {
  potluck: {
    label: "Potluck",
    description: "Standard potluck — drinks, sides, dessert, setup, cleanup.",
    slots: [
      { title: "Drinks (enough for everyone)", capacity: 1 },
      { title: "Plates, utensils, napkins", capacity: 1 },
      { title: "Main / hot side", capacity: 2 },
      { title: "Cold side / salad", capacity: 2 },
      { title: "Dessert", capacity: 2 },
      { title: "Setup (arrive 15 min early)", capacity: 3 },
      { title: "Cleanup (stay 15 min after)", capacity: 3 },
    ],
  },
  drivers: {
    label: "Drivers / carpool",
    description: "Driver sign-up; each driver covers one carload.",
    slots: [
      { title: "Driver — carload 1 (4 seats)", capacity: 1, notes: "Driver should be YPT-trained adult." },
      { title: "Driver — carload 2 (4 seats)", capacity: 1 },
      { title: "Driver — carload 3 (4 seats)", capacity: 1 },
      { title: "Driver — carload 4 (4 seats)", capacity: 1 },
      { title: "Driver — carload 5 (4 seats)", capacity: 1 },
    ],
  },
  campout: {
    label: "Campout",
    description: "Common campout supports: drivers, gear, first aid.",
    slots: [
      { title: "Driver — patrol box truck", capacity: 1 },
      { title: "Driver — Scouts (4 seats each)", capacity: 4 },
      { title: "First aid kit", capacity: 1 },
      { title: "Patrol cook box", capacity: 2 },
      { title: "Tarp / dining fly", capacity: 1 },
      { title: "Tents (2 per box)", capacity: 3 },
    ],
  },
  court_of_honor: {
    label: "Court of Honor",
    description: "Ceremony coordination — refreshments, setup, ceremony roles.",
    slots: [
      { title: "Refreshments", capacity: 3 },
      { title: "Setup crew (arrive 30 min early)", capacity: 4 },
      { title: "Photographer", capacity: 1 },
      { title: "MC / announcer", capacity: 1 },
      { title: "Awards table runner", capacity: 1 },
      { title: "Cleanup crew", capacity: 4 },
    ],
  },
  service: {
    label: "Service project",
    description: "Service-day logistics: tools, food, drivers.",
    slots: [
      { title: "Tools / supplies", capacity: 2, notes: "Coordinate with project beneficiary." },
      { title: "Snacks + drinks", capacity: 2 },
      { title: "First aid", capacity: 1 },
      { title: "Photos / documentation", capacity: 1 },
      { title: "Driver", capacity: 3 },
    ],
  },
};

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

  const renderSlot = (s) => {
    const active = s.assignments.filter((a) => !a.waitlisted);
    const waiting = s.assignments.filter((a) => a.waitlisted);
    return `
    <li>
      <div style="flex:1">
        <h3>${escape(s.title)}${
          s.capacity > 1 ? ` <span class="tag">${active.length} of ${s.capacity}</span>` : ""
        }${s.capacity === 1 && active.length === 1 ? ` <span class="tag">filled</span>` : ""}${
          waiting.length ? ` <span class="tag">+${waiting.length} waiting</span>` : ""
        }${!s.allowWaitlist ? ` <span class="tag">no waitlist</span>` : ""}</h3>
        ${s.description ? `<p class="muted small">${escape(s.description)}</p>` : ""}
        ${
          active.length
            ? `<p class="muted small">Signed up: ${active.map((a) => escape(a.name)).join(", ")}</p>`
            : `<p class="muted small">No takers yet.</p>`
        }
        ${
          waiting.length
            ? `<p class="muted small">Waitlist: ${waiting.map((a) => escape(a.name)).join(", ")}</p>`
            : ""
        }
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/events/${escape(ev.id)}/slots/${escape(s.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/slots/${escape(s.id)}/delete" onsubmit="return confirm('Delete this slot?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`;
  };

  const templateOpts = Object.entries(SLOT_TEMPLATES)
    .map(([key, t]) => `<option value="${escape(key)}">${escape(t.label)} — ${escape(t.description)}</option>`)
    .join("");

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
    <h1>Sign-up sheet · ${escape(ev.title)}</h1>
    <p class="muted">Add slots for what your unit needs covered: drivers, food items, gear. Anyone who can see the event can claim a slot — no login required.</p>

    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/slots/template">
      <h2 style="margin-top:0">Use a template</h2>
      <p class="muted small">One click creates a sensible set of slots you can edit afterward.</p>
      <div class="row">
        <label style="margin:0;flex:1">Template
          <select name="template" required>
            <option value="">— pick a template —</option>
            ${templateOpts}
          </select>
        </label>
        <button class="btn btn-primary" type="submit">Apply template</button>
      </div>
    </form>

    <h2 style="margin-top:1.25rem">Add a slot</h2>
    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/slots">
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. Drive 2 scouts, Bring drinks for 30"></label>
      <label>Description (optional)<textarea name="description" rows="2" maxlength="500"></textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">How many people needed
          <input name="capacity" type="number" required min="1" max="50" value="1">
        </label>
      </div>
      <label class="row" style="align-items:center;gap:.5rem;margin-top:.5rem">
        <input type="checkbox" name="allowWaitlist" value="1" checked>
        <span>Allow waitlist when full (auto-promotes the next person when a spot opens)</span>
      </label>
      <button class="btn btn-primary" type="submit">Add slot</button>
    </form>

    <h2 style="margin-top:1.5rem">Slots</h2>
    ${slots.length ? `<ul class="items">${slots.map(renderSlot).join("")}</ul>` : `<div class="empty">No slots yet. Add one above.</div>`}
  `;
  res.type("html").send(layout(req, { title: `Sign-up sheet · ${ev.title}`, body }));
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
      allowWaitlist: req.body?.allowWaitlist != null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  res.redirect(`/admin/events/${ev.id}/slots`);
});

adminRouter.post("/events/:id/slots/template", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");
  const tpl = SLOT_TEMPLATES[req.body?.template];
  if (!tpl) return res.redirect(`/admin/events/${ev.id}/slots`);

  const last = await prisma.signupSlot.findFirst({
    where: { eventId: ev.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let order = (last?.sortOrder ?? 0) + 1;
  await prisma.signupSlot.createMany({
    data: tpl.slots.map((s) => ({
      orgId: req.org.id,
      eventId: ev.id,
      title: s.title,
      description: s.notes || null,
      capacity: s.capacity,
      sortOrder: order++,
    })),
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
    <a class="back" href="/admin/events/${escape(req.params.id)}/slots" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Sign-up sheet</a>
    <h1>Edit slot</h1>
    <form class="card" method="post" action="/admin/events/${escape(req.params.id)}/slots/${escape(slot.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${v("title")}"></label>
      <label>Description<textarea name="description" rows="2" maxlength="500">${v("description")}</textarea></label>
      <label>How many people needed<input name="capacity" type="number" required min="1" max="50" value="${v("capacity")}"></label>
      <label class="row" style="align-items:center;gap:.5rem;margin-top:.25rem">
        <input type="checkbox" name="allowWaitlist" value="1"${slot.allowWaitlist ? " checked" : ""}>
        <span>Allow waitlist when full</span>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/events/${escape(req.params.id)}/slots">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit slot", body }));
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
      allowWaitlist: req.body?.allowWaitlist != null,
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
/* Trip & meal planner                                                 */
/* ------------------------------------------------------------------ */

const UNITS = ["lb", "oz", "ea", "cup", "qt", "gal", "pt", "tsp", "tbsp", "pkg", "ct"];

async function loadOrCreatePlan(eventId, orgId) {
  const includes = {
    meals: {
      orderBy: { sortOrder: "asc" },
      include: { ingredients: { orderBy: { name: "asc" } } },
    },
    gear: {
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        equipment: {
          select: { id: true, name: true, location: true, condition: true },
        },
      },
    },
  };
  const existing = await prisma.tripPlan.findUnique({
    where: { eventId },
    include: includes,
  });
  if (existing) return existing;
  await prisma.tripPlan.create({ data: { orgId, eventId } });
  return prisma.tripPlan.findUnique({ where: { eventId }, include: includes });
}

function totalCostPerPerson(meals) {
  let total = 0;
  for (const m of meals || []) {
    for (const i of m.ingredients || []) {
      if (i.unitCost == null) continue;
      total += (i.quantityPerPerson || 0) * (i.unitCost || 0);
    }
  }
  return Math.round(total * 100) / 100;
}

async function rsvpYesCount(eventId) {
  return prisma.rsvp.count({ where: { eventId, response: "yes" } });
}

adminRouter.get("/events/:id/plan", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const plan = await loadOrCreatePlan(ev.id, req.org.id);
  const yesCount = await rsvpYesCount(ev.id);
  const headcount = plan.headcountOverride ?? yesCount;
  const list = buildShoppingList(plan.meals, headcount);

  // Members with dietary flags — surface to the planner. Also feeds
  // the per-meal conflict check below (lib/dietary.js).
  const [flagged, equipmentCatalog] = await Promise.all([
    prisma.member.findMany({
      where: { orgId: req.org.id, dietaryFlags: { isEmpty: false } },
      select: { firstName: true, lastName: true, dietaryFlags: true },
    }),
    prisma.equipment.findMany({
      where: { orgId: req.org.id, condition: { not: "retired" } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true },
    }),
  ]);

  const unitOpts = UNITS.map((u) => `<option value="${escape(u)}">${escape(u)}</option>`).join("");
  const catOpts = CATEGORY_ORDER.map(
    (c) => `<option value="${escape(c)}">${escape(c)}</option>`
  ).join("");

  const renderMeal = (m) => {
    const ingRows = m.ingredients
      .map(
        (i) => `
        <tr>
          <td>${escape(i.name)}</td>
          <td class="num">${escape(String(i.quantityPerPerson))}</td>
          <td>${escape(i.unit)}</td>
          <td class="num">${i.unitCost != null ? `$${escape(String(i.unitCost.toFixed(2)))}` : "—"}</td>
          <td>${escape(i.category || "—")}</td>
          <td>
            <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/plan/ingredients/${escape(i.id)}/delete">
              <button class="btn btn-danger small" type="submit">×</button>
            </form>
          </td>
        </tr>`
      )
      .join("");

    const tagLabel = (key) =>
      MEAL_DIETARY_TAGS.find((t) => t.key === key)?.label || key;
    const tagBadges = (m.dietaryTags || []).length
      ? `<p class="muted small" style="margin:.25rem 0 0">${(m.dietaryTags || [])
          .map((t) => `<span class="tag">${escape(tagLabel(t))}</span>`)
          .join(" ")}</p>`
      : "";

    const conflicts = mealConflicts(flagged, m.dietaryTags || []);
    const conflictHtml = conflicts.length
      ? `<div class="meal-warn">
          <strong>⚠ Dietary conflict</strong>
          <ul style="margin:.25rem 0 0;padding-left:1.25rem">
            ${conflicts
              .map(
                (c) =>
                  `<li><strong>${escape(c.name)}</strong> — ${escape(c.flag)} (vs. ${c.tags
                    .map((t) => escape(tagLabel(t)))
                    .join(", ")})</li>`,
              )
              .join("")}
          </ul>
        </div>`
      : "";

    const tagCheckboxes = MEAL_DIETARY_TAGS.map((t) => {
      const checked = (m.dietaryTags || []).includes(t.key) ? " checked" : "";
      return `<label class="chip-check"><input type="checkbox" name="dietaryTag" value="${escape(t.key)}"${checked}> ${escape(t.label)}</label>`;
    }).join("");

    return `
    <article class="card" style="margin-bottom:1rem">
      <div class="row" style="align-items:flex-start">
        <div style="flex:1">
          <h3 style="margin:0 0 .15rem">${escape(m.name)}</h3>
          ${m.recipeName ? `<p class="muted small">Recipe: ${escape(m.recipeName)}</p>` : ""}
          ${m.notes ? `<p class="muted small">${escape(m.notes)}</p>` : ""}
          ${tagBadges}
        </div>
        <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/plan/meals/${escape(m.id)}/delete" onsubmit="return confirm('Delete this meal and its ingredients?')">
          <button class="btn btn-danger small" type="submit">Delete meal</button>
        </form>
      </div>
      ${conflictHtml}
      <details class="meal-tags">
        <summary class="muted small">Edit recipe tags</summary>
        <form method="post" action="/admin/events/${escape(ev.id)}/plan/meals/${escape(m.id)}/tags" class="chip-group">
          ${tagCheckboxes}
          <button class="btn btn-ghost small" type="submit">Save tags</button>
        </form>
      </details>

      ${
        m.ingredients.length
          ? `<table class="ing-table">
              <thead><tr><th>Ingredient</th><th class="num">Per person</th><th>Unit</th><th class="num">$/unit</th><th>Category</th><th></th></tr></thead>
              <tbody>${ingRows}</tbody>
            </table>`
          : `<p class="muted small">No ingredients yet.</p>`
      }

      <form method="post" action="/admin/events/${escape(ev.id)}/plan/meals/${escape(m.id)}/ingredients" class="ing-add">
        <input name="name" type="text" required placeholder="Ingredient (e.g. Ground beef)" maxlength="80">
        <input name="quantityPerPerson" type="number" required step="0.01" min="0" placeholder="Per person" style="width:6rem">
        <select name="unit" required>${unitOpts}</select>
        <input name="unitCost" type="number" step="0.01" min="0" placeholder="$/unit" style="width:5rem" title="Cost per unit (optional)">
        <select name="category"><option value="">— category —</option>${catOpts}</select>
        <button class="btn btn-primary small" type="submit">Add</button>
      </form>
    </article>`;
  };

  const renderShopping = () => {
    if (!list.length) return `<p class="muted">Add ingredients to a meal to start the shopping list.</p>`;
    return list
      .map(
        (g) => `
      <h3 style="margin:1rem 0 .35rem">${escape(g.category)}</h3>
      <table class="ing-table">
        <thead><tr><th>Item</th><th class="num">Total</th><th>Unit</th><th>For</th></tr></thead>
        <tbody>${g.items
          .map(
            (i) => `
          <tr>
            <td>${escape(i.name)}</td>
            <td class="num"><strong>${escape(String(i.quantity))}</strong></td>
            <td>${escape(i.unit)}</td>
            <td class="muted small">${escape(i.fromMeals.join(", "))}</td>
          </tr>`
          )
          .join("")}</tbody>
      </table>`
      )
      .join("");
  };

  const flagsHtml = flagged.length
    ? flagged
        .map(
          (m) =>
            `<li><strong>${escape(m.firstName)} ${escape(m.lastName)}</strong>: ${m.dietaryFlags
              .map((f) => `<span class="tag">${escape(f)}</span>`)
              .join(" ")}</li>`
        )
        .join("")
    : `<li class="muted small">Nobody on the roster has dietary flags set.</li>`;

  const costPerPerson = totalCostPerPerson(plan.meals);
  const totalCost = Math.round(costPerPerson * headcount * 100) / 100;
  const renderGear = () => {
    if (!plan.gear?.length) return `<p class="muted small">No gear yet — add a packing line below.</p>`;
    return `<table class="ing-table">
      <thead><tr><th></th><th>Item</th><th class="num">Qty</th><th>Assigned to</th><th></th></tr></thead>
      <tbody>${plan.gear
        .map(
          (g) => `
        <tr style="${g.packed ? "opacity:.55" : ""}">
          <td>
            <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/plan/gear/${escape(g.id)}/toggle">
              <button class="link-btn" type="submit" title="${g.packed ? "Unpack" : "Mark packed"}">${g.packed ? "☑" : "☐"}</button>
            </form>
          </td>
          <td>
            ${
              g.equipment
                ? `<a href="/admin/equipment/${escape(g.equipment.id)}/edit">${escape(g.name)}</a> <span class="tag">catalog</span>`
                : escape(g.name)
            }${g.notes ? ` <span class="muted small">${escape(g.notes)}</span>` : ""}
          </td>
          <td class="num">${escape(String(g.quantity))}</td>
          <td>${escape(g.assignedTo || "—")}</td>
          <td>
            <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/plan/gear/${escape(g.id)}/delete">
              <button class="btn btn-danger small" type="submit">×</button>
            </form>
          </td>
        </tr>`
        )
        .join("")}</tbody>
    </table>`;
  };

  const equipmentOpts = equipmentCatalog
    .map(
      (e) =>
        `<option value="${escape(e.id)}" data-name="${escape(e.name)}">${escape(e.name)}${e.category ? ` (${escape(e.category)})` : ""}</option>`,
    )
    .join("");

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
    <h1>Trip plan · ${escape(ev.title)}</h1>

    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/plan" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      <div>
        <strong>Headcount</strong>
        <p class="muted small" style="margin:0">RSVP "yes" count: ${yesCount}</p>
      </div>
      <label style="margin:0">Override
        <input name="headcountOverride" type="number" min="0" max="999" value="${escape(String(plan.headcountOverride ?? ""))}" style="width:6rem">
      </label>
      <button class="btn btn-primary" type="submit">Save</button>
      <span class="muted small" style="margin-left:auto">Using <strong>${headcount}</strong> for the shopping list.</span>
    </form>

    <h2 style="margin-top:1.5rem">Meals</h2>
    ${plan.meals.map(renderMeal).join("")}

    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/plan/meals">
      <h3 style="margin-top:0">Add a meal</h3>
      <div class="row">
        <label style="margin:0;flex:1">Name<input name="name" type="text" required maxlength="60" placeholder="e.g. Saturday breakfast"></label>
        <label style="margin:0;flex:1">Recipe (optional)<input name="recipeName" type="text" maxlength="80" placeholder="e.g. Foil packets"></label>
      </div>
      <p class="muted small" style="margin:.6rem 0 .25rem">Recipe contains (optional — we cross-check against the roster's dietary flags):</p>
      <div class="chip-group">
        ${MEAL_DIETARY_TAGS.map(
          (t) => `<label class="chip-check"><input type="checkbox" name="dietaryTag" value="${escape(t.key)}"> ${escape(t.label)}</label>`,
        ).join("")}
      </div>
      <button class="btn btn-primary" type="submit">Add meal</button>
    </form>

    <h2 style="margin-top:1.5rem">Shopping list</h2>
    <div class="card">${renderShopping()}</div>

    ${
      costPerPerson > 0
        ? `<div class="card" style="margin-top:1rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">
             <div><strong style="font-size:1.4rem">$${costPerPerson.toFixed(2)}</strong> <span class="muted">per person</span></div>
             <div><strong style="font-size:1.4rem">$${totalCost.toFixed(2)}</strong> <span class="muted">for ${headcount}</span></div>
             <p class="muted small" style="margin:0">Estimate based on ingredients with a $/unit set. Set the event fee accordingly.</p>
           </div>`
        : `<p class="muted small" style="margin-top:.5rem">Add a $/unit to ingredients and the per-person cost will appear here.</p>`
    }

    <h2 style="margin-top:1.5rem">Gear / packing list</h2>
    <div class="card">
      ${renderGear()}
      <form method="post" action="/admin/events/${escape(ev.id)}/plan/gear" class="ing-add" style="margin-top:.6rem">
        <select name="equipmentId" style="flex:1">
          <option value="">— or pick from Quartermaster —</option>
          ${equipmentOpts}
        </select>
        <input name="name" type="text" placeholder="…or free-form name" maxlength="80">
        <input name="quantity" type="number" min="1" max="99" value="1" style="width:5rem">
        <input name="assignedTo" type="text" placeholder="Assigned to (optional)" style="flex:1">
        <button class="btn btn-primary small" type="submit">Add gear</button>
      </form>
    </div>

    <h2 style="margin-top:1.5rem">Dietary flags on the roster</h2>
    <div class="card"><ul style="margin:0;padding-left:1.25rem">${flagsHtml}</ul></div>

    <p class="muted small" style="margin-top:1rem">Members can see the meal plan + shopping list at <code>/events/${escape(ev.id)}/plan</code> when signed in.</p>

    <style>
      .ing-table{width:100%;border-collapse:collapse;font-size:.93rem}
      .ing-table th{text-align:left;padding:.4rem .55rem;border-bottom:1px solid var(--line);font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);font-weight:600}
      .ing-table td{padding:.45rem .55rem;border-bottom:1px solid var(--line)}
      .ing-table tr:last-child td{border-bottom:0}
      .ing-table .num{text-align:right;font-variant-numeric:tabular-nums}
      .ing-add{display:flex;gap:.4rem;margin-top:.6rem;flex-wrap:wrap}
      .ing-add input,.ing-add select{padding:.45rem .55rem;border:1px solid var(--line);border-radius:6px;font:inherit;flex:1;min-width:0}
      .meal-warn{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.55rem .85rem;border-radius:8px;margin:.6rem 0 0;font-size:.9rem}
      .meal-tags{margin-top:.55rem}
      .meal-tags summary{cursor:pointer;display:inline-block}
      .chip-group{display:flex;flex-wrap:wrap;gap:.35rem .65rem;margin-top:.45rem;align-items:center}
      .chip-check{display:inline-flex;align-items:center;gap:.3rem;background:#fbf8ee;border:1px solid #eef0e7;border-radius:999px;padding:.2rem .65rem;font-size:.85rem;cursor:pointer}
      .chip-check input{accent-color:var(--brand,#1d6b39)}
    </style>
  `;
  res.type("html").send(layout(req, { title: `Trip plan · ${ev.title}`, body }));
});

adminRouter.post("/events/:id/plan", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");
  const raw = req.body?.headcountOverride;
  const override = raw === "" || raw == null ? null : Math.max(0, Math.min(999, parseInt(raw, 10)));
  await prisma.tripPlan.upsert({
    where: { eventId: ev.id },
    update: { headcountOverride: override },
    create: { orgId: req.org.id, eventId: ev.id, headcountOverride: override },
  });
  res.redirect(`/admin/events/${ev.id}/plan`);
});

adminRouter.post("/events/:id/plan/meals", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");
  const plan = await loadOrCreatePlan(ev.id, req.org.id);
  const last = await prisma.meal.findFirst({
    where: { tripPlanId: plan.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.meal.create({
    data: {
      orgId: req.org.id,
      tripPlanId: plan.id,
      name: req.body?.name?.trim() || "Untitled",
      recipeName: req.body?.recipeName?.trim() || null,
      dietaryTags: sanitizeMealTags(req.body?.dietaryTag),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  res.redirect(`/admin/events/${ev.id}/plan`);
});

adminRouter.post("/events/:id/plan/meals/:mealId/tags", requireLeader, async (req, res) => {
  const meal = await prisma.meal.findFirst({
    where: { id: req.params.mealId, orgId: req.org.id },
    select: { id: true, tripPlan: { select: { eventId: true } } },
  });
  if (!meal || meal.tripPlan.eventId !== req.params.id) return res.status(404).send("Not found");
  await prisma.meal.update({
    where: { id: meal.id },
    data: { dietaryTags: sanitizeMealTags(req.body?.dietaryTag) },
  });
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

adminRouter.post("/events/:id/plan/meals/:mealId/delete", requireLeader, async (req, res) => {
  await prisma.meal.deleteMany({
    where: { id: req.params.mealId, orgId: req.org.id },
  });
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

adminRouter.post("/events/:id/plan/meals/:mealId/ingredients", requireLeader, async (req, res) => {
  const meal = await prisma.meal.findFirst({
    where: { id: req.params.mealId, orgId: req.org.id },
    select: { id: true, tripPlan: { select: { eventId: true } } },
  });
  if (!meal || meal.tripPlan.eventId !== req.params.id) return res.status(404).send("Not found");
  const qty = parseFloat(req.body?.quantityPerPerson);
  const cost = parseFloat(req.body?.unitCost);
  await prisma.ingredient.create({
    data: {
      orgId: req.org.id,
      mealId: meal.id,
      name: req.body?.name?.trim() || "Untitled",
      quantityPerPerson: Number.isFinite(qty) && qty >= 0 ? qty : 0,
      unit: req.body?.unit?.trim() || "ea",
      unitCost: Number.isFinite(cost) && cost >= 0 ? cost : null,
      category: req.body?.category?.trim() || null,
    },
  });
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

adminRouter.post("/events/:id/plan/gear", requireLeader, async (req, res) => {
  const plan = await loadOrCreatePlan(req.params.id, req.org.id);
  const last = await prisma.gearItem.findFirst({
    where: { tripPlanId: plan.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const qty = parseInt(req.body?.quantity, 10);

  // If a Quartermaster catalog item is picked, snapshot the name so the
  // gear line stays readable even if the catalog row is later renamed.
  let equipmentId = (req.body?.equipmentId || "").trim() || null;
  let name = (req.body?.name || "").trim();
  if (equipmentId) {
    const eq = await prisma.equipment.findFirst({
      where: { id: equipmentId, orgId: req.org.id },
      select: { id: true, name: true },
    });
    if (!eq) equipmentId = null;
    else if (!name) name = eq.name;
  }
  if (!name) {
    if (!equipmentId) return res.redirect(`/admin/events/${req.params.id}/plan`);
    name = "Untitled";
  }

  await prisma.gearItem.create({
    data: {
      orgId: req.org.id,
      tripPlanId: plan.id,
      equipmentId,
      name,
      quantity: Number.isFinite(qty) && qty >= 1 ? Math.min(99, qty) : 1,
      assignedTo: req.body?.assignedTo?.trim() || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

adminRouter.post("/events/:id/plan/gear/:gearId/toggle", requireLeader, async (req, res) => {
  const g = await prisma.gearItem.findFirst({
    where: { id: req.params.gearId, orgId: req.org.id },
    select: { id: true, packed: true },
  });
  if (g) {
    await prisma.gearItem.update({ where: { id: g.id }, data: { packed: !g.packed } });
  }
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

adminRouter.post("/events/:id/plan/gear/:gearId/delete", requireLeader, async (req, res) => {
  await prisma.gearItem.deleteMany({
    where: { id: req.params.gearId, orgId: req.org.id },
  });
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

adminRouter.post("/events/:id/plan/ingredients/:ingId/delete", requireLeader, async (req, res) => {
  await prisma.ingredient.deleteMany({
    where: { id: req.params.ingId, orgId: req.org.id },
  });
  res.redirect(`/admin/events/${req.params.id}/plan`);
});

/* ------------------------------------------------------------------ */
/* Forms & documents                                                   */
/* ------------------------------------------------------------------ */

const FORM_CATEGORIES = [
  "Health forms",
  "Permission slips",
  "Bylaws & policies",
  "Welcome packet",
  "Reimbursement",
  "Other",
];

adminRouter.get("/forms", requireLeader, async (req, res) => {
  const forms = await prisma.form.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
  });

  // Group by category for display.
  const byCategory = {};
  for (const f of forms) {
    const c = f.category || "Other";
    if (!byCategory[c]) byCategory[c] = [];
    byCategory[c].push(f);
  }

  const renderRow = (f) => {
    const target = f.filename ? `/uploads/${escape(f.filename)}` : escape(f.url || "");
    const sizeKb = f.sizeBytes ? Math.round(f.sizeBytes / 1024) : null;
    return `
      <li>
        <div style="flex:1">
          <h3>${escape(f.title)}</h3>
          <p class="muted small">
            <span class="tag">${escape(f.visibility === "public" ? "Public" : f.visibility === "leaders" ? "Leaders only" : "Members only")}</span>
            ${f.filename ? `<span class="tag">${escape((f.mimeType || "").split("/").pop().toUpperCase() || "FILE")}${sizeKb ? ` · ${sizeKb} KB` : ""}</span>` : `<span class="tag">link</span>`}
            <a href="${target}" target="_blank" rel="noopener">${escape(f.filename ? f.originalName || f.filename : f.url)}</a>
          </p>
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/forms/${escape(f.id)}/edit">Edit</a>
          <form class="inline" method="post" action="/admin/forms/${escape(f.id)}/delete" onsubmit="return confirm('Delete this document?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`;
  };

  const groups = Object.keys(byCategory)
    .sort()
    .map(
      (cat) => `
        <h2 style="margin-top:1.5rem">${escape(cat)}</h2>
        <ul class="items">${byCategory[cat].map(renderRow).join("")}</ul>`
    )
    .join("");

  const catOpts = FORM_CATEGORIES.map(
    (c) => `<option value="${escape(c)}">${escape(c)}</option>`
  ).join("");

  const body = `
    <h1>Forms &amp; documents</h1>
    <p class="muted">Upload PDFs, Word/Excel files, or link to anything off-site. Members and the public see different things based on visibility.</p>

    <form class="card" method="post" action="/admin/forms" enctype="multipart/form-data">
      <h2 style="margin-top:0">Add a document</h2>
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. BSA Health & Medical Record A/B"></label>
      <div class="row">
        <label style="margin:0;flex:1">Category
          <select name="category">
            <option value="">— pick —</option>
            ${catOpts}
          </select>
        </label>
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="members" selected>Members only</option>
            <option value="public">Public</option>
            <option value="leaders">Leaders only</option>
          </select>
        </label>
      </div>
      <label>Upload a file (PDF, Word, Excel — up to 25 MB)
        <input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,image/jpeg,image/png">
      </label>
      <label>…or paste an external URL
        <input name="url" type="url" placeholder="https://example.com/form.pdf">
      </label>
      <button class="btn btn-primary" type="submit">Add</button>
    </form>

    ${forms.length ? groups : `<div class="empty" style="margin-top:1rem">No documents yet. Upload one above or add a link.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Forms & documents", body }));
});

adminRouter.post("/forms", requireLeader, documentUpload.single("file"), async (req, res) => {
  const title = req.body?.title?.trim();
  if (!title) return res.redirect("/admin/forms");

  const visibility = ["public", "members", "leaders"].includes(req.body?.visibility)
    ? req.body.visibility
    : "members";
  const category = req.body?.category?.trim() || null;
  const url = req.body?.url?.trim() || null;

  const data = { orgId: req.org.id, title, category, visibility, url };

  if (req.file) {
    const ext = (path.extname(req.file.originalname) || ".bin").toLowerCase().slice(0, 8);
    const filename = `${crypto.randomBytes(12).toString("hex")}${ext}`;
    await moveFromTemp(req.org.id, filename, req.file.path);
    data.filename = filename;
    data.originalName = req.file.originalname;
    data.mimeType = req.file.mimetype;
    data.sizeBytes = req.file.size;
    if (!data.url) data.url = null;
  } else if (!url) {
    return res.redirect("/admin/forms");
  }

  await prisma.form.create({ data });
  res.redirect("/admin/forms");
});

adminRouter.get("/forms/:id/edit", requireLeader, async (req, res) => {
  const form = await prisma.form.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!form) return res.status(404).send("Not found");
  const v = (k) => escape(form[k] ?? "");
  const sel = (cond) => (cond ? " selected" : "");
  const catOpts = FORM_CATEGORIES.map(
    (c) => `<option value="${escape(c)}"${sel(form.category === c)}>${escape(c)}</option>`
  ).join("");
  const body = `
    <a class="back" href="/admin/forms" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Forms</a>
    <h1>Edit document</h1>
    <form class="card" method="post" action="/admin/forms/${escape(form.id)}" enctype="multipart/form-data">
      <label>Title<input name="title" type="text" required maxlength="120" value="${v("title")}"></label>
      <div class="row">
        <label style="margin:0;flex:1">Category
          <select name="category">
            <option value="">—</option>
            ${catOpts}
          </select>
        </label>
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="members"${sel(form.visibility === "members")}>Members only</option>
            <option value="public"${sel(form.visibility === "public")}>Public</option>
            <option value="leaders"${sel(form.visibility === "leaders")}>Leaders only</option>
          </select>
        </label>
      </div>
      <label>Replace file (optional)<input name="file" type="file"></label>
      <label>External URL<input name="url" type="url" value="${v("url")}"></label>
      <p class="muted small">Current: ${
        form.filename
          ? `<a href="/uploads/${escape(form.filename)}" target="_blank" rel="noopener">${escape(form.originalName || form.filename)}</a>`
          : form.url
          ? escape(form.url)
          : "—"
      }</p>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/forms">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit document", body }));
});

adminRouter.post("/forms/:id", requireLeader, documentUpload.single("file"), async (req, res) => {
  const form = await prisma.form.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!form) return res.status(404).send("Not found");

  const data = {
    title: req.body?.title?.trim() || form.title,
    category: req.body?.category?.trim() || null,
    visibility: ["public", "members", "leaders"].includes(req.body?.visibility)
      ? req.body.visibility
      : "members",
    url: req.body?.url?.trim() || null,
  };

  if (req.file) {
    if (form.filename) await removeFile(req.org.id, form.filename);
    const ext = (path.extname(req.file.originalname) || ".bin").toLowerCase().slice(0, 8);
    const filename = `${crypto.randomBytes(12).toString("hex")}${ext}`;
    await moveFromTemp(req.org.id, filename, req.file.path);
    data.filename = filename;
    data.originalName = req.file.originalname;
    data.mimeType = req.file.mimetype;
    data.sizeBytes = req.file.size;
  }

  await prisma.form.update({ where: { id: form.id }, data });
  res.redirect("/admin/forms");
});

adminRouter.post("/forms/:id/delete", requireLeader, async (req, res) => {
  const form = await prisma.form.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!form) return res.status(404).send("Not found");
  if (form.filename) await removeFile(req.org.id, form.filename);
  await prisma.form.delete({ where: { id: form.id } });
  res.redirect("/admin/forms");
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

function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? null : d;
}

function memberFromBody(body) {
  // parentIds may arrive as a string (single select) or an array (multi).
  let parentIds = body?.parentIds;
  if (typeof parentIds === "string") parentIds = [parentIds];
  if (!Array.isArray(parentIds)) parentIds = [];
  parentIds = parentIds.filter((s) => typeof s === "string" && s.length > 0);

  // dietaryFlags: union of (a) preset checkboxes (array via name="dietaryFlag")
  // and (b) a free-form comma-separated input ("Other"). Lower-case for
  // dedupe but display preserves the user's casing on first use.
  let presets = body?.dietaryFlag;
  if (typeof presets === "string") presets = [presets];
  if (!Array.isArray(presets)) presets = [];
  const freeform = (body?.dietaryFlagsOther || "")
    .toString()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dietaryFlags = [];
  const seen = new Set();
  for (const f of [...presets, ...freeform]) {
    const k = f.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      dietaryFlags.push(f);
    }
  }

  const birthdate = parseDate(body?.birthdate);
  const joinedAt = parseDate(body?.joinedAt);
  const splitTags = (s) =>
    String(s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  // De-dupe case-insensitively while preserving first-seen casing.
  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const t of arr) {
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  };
  return {
    firstName: body?.firstName?.trim() || "",
    lastName: body?.lastName?.trim() || "",
    email: body?.email?.trim().toLowerCase() || null,
    phone: body?.phone?.trim() || null,
    patrol: resolvePatrolFromBody(body),
    position: body?.position?.trim() || null,
    birthdate,
    ...(joinedAt ? { joinedAt } : {}),
    isYouth: body?.isYouth === "1",
    commPreference: ["email", "sms", "both", "none"].includes(body?.commPreference)
      ? body.commPreference
      : "email",
    smsOptIn: body?.smsOptIn === "1",
    scoutbookUserId: body?.scoutbookUserId?.trim() || null,
    parentIds,
    dietaryFlags,
    skills: dedupe(splitTags(body?.skills)),
    interests: dedupe(splitTags(body?.interests)),
    notes: body?.notes?.trim() || null,
  };
}

const DIETARY_PRESETS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Egg allergy",
  "Halal",
  "Kosher",
];

async function memberForm({ member, action, submitLabel, orgId, unitType }) {
  const v = (k) => escape(member?.[k] ?? "");
  const checked = (cond) => (cond ? " checked" : "");
  const sel = (cond) => (cond ? " selected" : "");

  // Possible parents: all adult members of this org except this member.
  const possibleParents = await prisma.member.findMany({
    where: {
      orgId,
      isYouth: false,
      ...(member?.id ? { id: { not: member.id } } : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
  const parentSet = new Set(member?.parentIds ?? []);
  const parentOpts = possibleParents
    .map(
      (p) =>
        `<option value="${escape(p.id)}"${parentSet.has(p.id) ? " selected" : ""}>${escape(
          p.firstName
        )} ${escape(p.lastName)}</option>`
    )
    .join("");

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
      ${
        member.bouncedAt
          ? `<p style="background:#fbe8e3;border:1px solid #f0bcb1;border-radius:8px;padding:.55rem .75rem;color:#7d2614;font-size:.92rem">
               <strong>Email is bouncing</strong> · ${escape(member.bounceReason || "no reason given")} ·
               last seen ${escape(new Date(member.bouncedAt).toLocaleString("en-US"))}.
               <span class="muted">Future broadcasts skip this address until you fix it and clear the flag.</span>
             </p>
             <div class="row" style="margin-bottom:.6rem">
               <form class="inline" method="post" action="/admin/members/${escape(member.id)}/clear-bounce">
                 <button class="btn btn-ghost small" type="submit">Clear bounce flag</button>
               </form>
             </div>`
          : ""
      }
      <div class="row">
        ${memberSubgroupField({ unitType, current: v("patrol"), formId: member?.id || "new" })}
        ${memberPositionField({ unitType, current: v("position"), formId: member?.id || "new" })}
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Birthdate (optional)<input name="birthdate" type="date" value="${
          member?.birthdate ? new Date(member.birthdate).toISOString().slice(0, 10) : ""
        }"></label>
        <label style="margin:0;flex:1">Joined the unit<input name="joinedAt" type="date" value="${
          member?.joinedAt ? new Date(member.joinedAt).toISOString().slice(0, 10) : ""
        }"></label>
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

      <label style="margin-bottom:.4rem">Dietary flags &amp; allergies</label>
      <div class="diet-grid">
        ${DIETARY_PRESETS.map((p) => {
          const isSet = (member?.dietaryFlags || []).some((f) => f.toLowerCase() === p.toLowerCase());
          return `<label class="diet-chip"><input type="checkbox" name="dietaryFlag" value="${escape(
            p
          )}"${isSet ? " checked" : ""}> ${escape(p)}</label>`;
        }).join("")}
      </div>
      <label style="margin-top:.4rem">Other (comma-separated)
        <input name="dietaryFlagsOther" type="text" maxlength="200" placeholder="e.g. lactose intolerant, soy allergy" value="${escape(
          (member?.dietaryFlags || [])
            .filter((f) => !DIETARY_PRESETS.some((p) => p.toLowerCase() === f.toLowerCase()))
            .join(", ")
        )}">
      </label>

      <label>Parents / guardians (for youth — pick the adults already on the roster)
        <select name="parentIds" multiple size="${Math.min(6, Math.max(2, possibleParents.length))}">${parentOpts}</select>
      </label>
      <label>Scoutbook user ID (optional — links this member to their Scoutbook record)
        <input name="scoutbookUserId" type="text" maxlength="40" placeholder="e.g. 1234567" value="${v("scoutbookUserId")}">
      </label>
      <label>Skills (comma-separated — e.g. "WFA, mechanic, lifeguard")
        <input name="skills" type="text" maxlength="240" value="${escape((member?.skills || []).join(", "))}">
      </label>
      <label>Interests (comma-separated — e.g. "backpacking, cooking, photography")
        <input name="interests" type="text" maxlength="240" value="${escape((member?.interests || []).join(", "))}">
      </label>
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
  }${m.commPreference !== "email" ? ` <span class="tag">${escape(m.commPreference)}</span>` : ""}${
    (m.dietaryFlags || []).length
      ? ` <span class="tag" title="${escape(m.dietaryFlags.join(", "))}">⚠ ${m.dietaryFlags.length} dietary</span>`
      : ""
  }</p>
      </div>
      <div class="row">
        ${
          m.scoutbookUserId
            ? `<a class="btn btn-ghost small" href="https://scoutbook.scouting.org/mobile/dashboard/Default.asp" target="_blank" rel="noopener" title="Open Scoutbook (sign in there to see ${escape(m.firstName)})">Scoutbook ↗</a>`
            : `<a class="btn btn-ghost small" href="https://scoutbook.scouting.org/" target="_blank" rel="noopener" title="Scoutbook is the official advancement system">Scoutbook ↗</a>`
        }
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
    ${await memberForm({ member: null, action: "/admin/members", submitLabel: "Add member", orgId: req.org.id, unitType: req.org.unitType })}

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
  res.type("html").send(layout(req, { title: "Members", body }));
});

adminRouter.post("/members", requireLeader, async (req, res) => {
  const data = memberFromBody(req.body || {});
  if (!data.firstName || !data.lastName) return res.redirect("/admin/members");
  const created = await prisma.member.create({ data: { orgId: req.org.id, ...data } });
  if (data.position) {
    await reconcilePositionTerm(req.org.id, created.id, null, data.position);
  }
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Member",
    entityId: created.id,
    action: "create",
    summary: `Added ${data.firstName} ${data.lastName}`,
  });
  res.redirect("/admin/members");
});

async function reconcilePositionTerm(orgId, memberId, _oldPosition, newPosition) {
  return reconcileTerm(prisma, orgId, memberId, newPosition);
}

adminRouter.get("/members/import", requireLeader, async (req, res) => {
  const body = `
    <h1>Bulk import members</h1>
    <p class="muted">Upload an Excel workbook (<code>.xlsx</code>) or a CSV file, or paste CSV text. The first row must be a header — recognized column names (case-insensitive, ignores spaces/underscores):</p>
    <p class="muted small"><code>firstName, lastName, email, phone, patrol, position, isYouth, commPreference, smsOptIn, skills, interests, notes</code></p>
    <p class="muted small">Aliases: <code>first_name</code>/<code>First Name</code>, <code>last_name</code>, <code>den</code>/<code>level</code> for patrol, <code>role</code>/<code>title</code> for position.</p>

    <form class="card" method="post" action="/admin/members/import" enctype="multipart/form-data">
      <h2 style="margin-top:0">Upload a roster file</h2>
      <label>File <span class="muted small">(.xlsx, .xls, .csv)</span><input name="file" type="file" accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></label>
      <p class="muted small">— or —</p>
      <label>Paste CSV text
        <textarea name="csv" rows="10" placeholder="firstName,lastName,email,patrol,isYouth&#10;Alex,Park,alex@example.com,Eagles,1&#10;Pat,Adams,pat@example.com,,0"></textarea>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Import</button>
        <a class="btn btn-ghost" href="/admin/members">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Import members", body }));
});

adminRouter.post("/members/import", requireLeader, csvUpload.single("file"), async (req, res) => {
  let rows = [];
  try {
    rows = parseRoster({
      buffer: req.file?.buffer,
      filename: req.file?.originalname,
      text: !req.file ? String(req.body?.csv || "") : "",
    });
  } catch (e) {
    return res.status(400).type("text/plain").send(`Couldn't parse the roster: ${e.message}`);
  }
  if (rows.length < 2) return res.redirect("/admin/members");
  const data = mapMemberRows({ rows, orgId: req.org.id });
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
  const [terms, trainings] = await Promise.all([
    prisma.positionTerm.findMany({
      where: { orgId: req.org.id, memberId: member.id },
      orderBy: [{ endedAt: { sort: "asc", nulls: "first" } }, { startedAt: "desc" }],
    }),
    prisma.training.findMany({
      where: { orgId: req.org.id, memberId: member.id },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const termRows = terms
    .map((t) => {
      const open = t.endedAt == null;
      return `
      <li class="row" style="align-items:center;gap:.5rem">
        <div style="flex:1">
          <strong>${escape(t.position)}</strong>${open ? ` <span class="tag">current</span>` : ""}
          <div class="muted small">${escape(fmt(t.startedAt))}${
            t.endedAt ? ` → ${escape(fmt(t.endedAt))}` : " → present"
          }${t.notes ? ` · ${escape(t.notes)}` : ""}</div>
        </div>
        ${
          open
            ? `<form class="inline" method="post" action="/admin/members/${escape(member.id)}/positions/${escape(t.id)}/end">
                 <button class="btn btn-ghost small" type="submit">End today</button>
               </form>`
            : ""
        }
        <form class="inline" method="post" action="/admin/members/${escape(member.id)}/positions/${escape(t.id)}/delete" onsubmit="return confirm('Delete this term?')">
          <button class="btn btn-danger small" type="submit">×</button>
        </form>
      </li>`;
    })
    .join("");
  const body = `
    <h1>Edit member</h1>
    ${await memberForm({ member, action: `/admin/members/${escape(member.id)}`, submitLabel: "Save", orgId: req.org.id, unitType: req.org.unitType })}

    <h2 style="margin-top:1.5rem">Position history</h2>
    <p class="muted small">Editing the <strong>Position</strong> field above auto-closes the open term and opens a new one. You can also backfill past terms here.</p>
    ${terms.length ? `<ul class="items">${termRows}</ul>` : `<div class="empty">No position terms recorded yet.</div>`}

    <form class="card" method="post" action="/admin/members/${escape(member.id)}/positions">
      <h3 style="margin-top:0">Backfill a term</h3>
      <div class="row">
        <label style="margin:0;flex:1">Position<input name="position" type="text" required maxlength="60" placeholder="e.g. Patrol Leader — Eagles"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Started<input name="startedAt" type="date" required></label>
        <label style="margin:0;flex:1">Ended (blank = still holding)<input name="endedAt" type="date"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="200"></textarea></label>
      <button class="btn btn-primary" type="submit">Add term</button>
    </form>

    <h2 style="margin-top:1.5rem">Training</h2>
    <p class="muted small">BSA Youth Protection (YPT), IOLS, Wood Badge, Scoutmaster Specifics, etc. YPT expires every 2 years; the org-wide <a href="/admin/training">training roster</a> flags expirations.</p>
    ${
      trainings.length
        ? `<ul class="items">${trainings
            .map((t) => {
              const exp = t.expiresAt ? new Date(t.expiresAt) : null;
              const expired = exp && exp < new Date();
              const expiringSoon = exp && !expired && (exp.getTime() - Date.now()) < 60 * 86400000;
              const expTag = expired
                ? ` <span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">expired</span>`
                : expiringSoon
                ? ` <span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">expires soon</span>`
                : "";
              return `
        <li class="row" style="align-items:center;gap:.5rem">
          <div style="flex:1">
            <strong>${escape(t.courseName)}</strong>${expTag}
            <div class="muted small">Completed ${escape(fmt(t.completedAt))}${
              t.expiresAt ? ` · expires ${escape(fmt(t.expiresAt))}` : ""
            }${t.notes ? ` · ${escape(t.notes)}` : ""}</div>
          </div>
          <form class="inline" method="post" action="/admin/members/${escape(member.id)}/training/${escape(t.id)}/delete" onsubmit="return confirm('Delete this training record?')">
            <button class="btn btn-danger small" type="submit">×</button>
          </form>
        </li>`;
            })
            .join("")}</ul>`
        : `<div class="empty">No training recorded yet.</div>`
    }

    <form class="card" method="post" action="/admin/members/${escape(member.id)}/training">
      <h3 style="margin-top:0">Add training</h3>
      <label>Course
        <input name="courseName" type="text" required maxlength="120" list="training-courses" placeholder="e.g. Youth Protection Training">
        <datalist id="training-courses">
          ${TRAINING_COURSES.map((c) => `<option value="${escape(c)}"></option>`).join("")}
        </datalist>
      </label>
      <div class="row">
        <label style="margin:0;flex:1">Completed<input name="completedAt" type="date" required></label>
        <label style="margin:0;flex:1">Expires (blank = doesn't expire)<input name="expiresAt" type="date"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="200"></textarea></label>
      <button class="btn btn-primary" type="submit">Add</button>
    </form>

    <h2 style="margin-top:1.5rem">Communication</h2>
    <p class="muted small">Every email or SMS broadcast (including newsletters) where this member appeared in the recipient snapshot.</p>
    <p><a class="btn btn-ghost" href="/admin/members/${escape(member.id)}/messages">View message history →</a></p>
  `;
  res.type("html").send(layout(req, { title: "Edit member", body }));
});

const TRAINING_COURSES = [
  "Youth Protection Training",
  "IOLS — Introduction to Outdoor Leader Skills",
  "SM/ASM Position-Specific Training",
  "Den Leader Position-Specific Training",
  "Cubmaster Position-Specific Training",
  "Wood Badge",
  "BALOO — Basic Adult Leader Outdoor Orientation",
  "Hazardous Weather Training",
  "Safe Swim Defense",
  "Safety Afloat",
  "Climb on Safely",
  "Trek Safely",
  "Powder Horn",
  "Sea Badge",
];

adminRouter.post("/members/:id/training", requireLeader, async (req, res) => {
  const member = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!member) return res.status(404).send("Not found");
  const courseName = (req.body?.courseName || "").trim();
  const completedAt = parseDate(req.body?.completedAt);
  const expiresAt = parseDate(req.body?.expiresAt);
  if (!courseName || !completedAt) {
    return res.redirect(`/admin/members/${member.id}/edit`);
  }
  await prisma.training.create({
    data: {
      orgId: req.org.id,
      memberId: member.id,
      courseName,
      completedAt,
      expiresAt: expiresAt || null,
      notes: (req.body?.notes || "").trim() || null,
    },
  });
  res.redirect(`/admin/members/${member.id}/edit`);
});

adminRouter.post("/members/:id/training/:trainingId/delete", requireLeader, async (req, res) => {
  await prisma.training.deleteMany({
    where: {
      id: req.params.trainingId,
      orgId: req.org.id,
      memberId: req.params.id,
    },
  });
  res.redirect(`/admin/members/${req.params.id}/edit`);
});

// Org-wide training roster: every adult leader's current training,
// flagging expirations.
adminRouter.get("/training", requireLeader, async (req, res) => {
  const adults = await prisma.member.findMany({
    where: { orgId: req.org.id, isYouth: false },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { trainings: { orderBy: { completedAt: "desc" } } },
  });

  const fmt = (d) => new Date(d).toISOString().slice(0, 10);
  const today = new Date();
  let totalExpired = 0;
  let totalExpiringSoon = 0;

  const items = adults
    .map((m) => {
      if (m.trainings.length === 0) {
        return `
        <li>
          <div style="flex:1">
            <h3 style="margin:0">${escape(m.firstName)} ${escape(m.lastName)}</h3>
            <p class="muted small" style="margin:.1rem 0 0">No training recorded.</p>
          </div>
          <a class="btn btn-ghost small" href="/admin/members/${escape(m.id)}/edit">Add</a>
        </li>`;
      }
      const courseList = m.trainings
        .map((t) => {
          const exp = t.expiresAt ? new Date(t.expiresAt) : null;
          const expired = exp && exp < today;
          const expiringSoon = exp && !expired && (exp.getTime() - today.getTime()) < 60 * 86400000;
          if (expired) totalExpired++;
          else if (expiringSoon) totalExpiringSoon++;
          const tag = expired
            ? ` <span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">expired</span>`
            : expiringSoon
            ? ` <span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">${Math.ceil((exp.getTime() - today.getTime()) / 86400000)}d</span>`
            : "";
          return `${escape(t.courseName)}${tag}${t.expiresAt ? ` <span class="muted small">(exp ${escape(fmt(t.expiresAt))})</span>` : ""}`;
        })
        .join(" · ");
      return `
        <li>
          <div style="flex:1">
            <h3 style="margin:0">${escape(m.firstName)} ${escape(m.lastName)}</h3>
            <p class="muted small" style="margin:.1rem 0 0">${courseList}</p>
          </div>
          <a class="btn btn-ghost small" href="/admin/members/${escape(m.id)}/edit">Edit</a>
        </li>`;
    })
    .join("");

  const body = `
    <h1>Training roster</h1>
    <p class="muted">All adult leaders and their training history. Expired YPT in red — chase those down before campouts.</p>

    <div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
      <div class="card stat-card"><strong style="font-size:1.6rem">${adults.length}</strong><br><span class="muted small">Adult leaders</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem;color:${totalExpired > 0 ? "#7d2614" : "inherit"}">${totalExpired}</strong><br><span class="muted small">Expired</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem;color:${totalExpiringSoon > 0 ? "#7d5a00" : "inherit"}">${totalExpiringSoon}</strong><br><span class="muted small">Expiring &lt; 60d</span></div>
    </div>

    ${adults.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No adults on the roster yet.</div>`}

    <style>.stat-card{flex:1;min-width:140px;text-align:center}</style>
  `;
  res.type("html").send(layout(req, { title: "Training roster", body }));
});

/* ------------------------------------------------------------------ */
/* Dynamic subgroups (saved audience queries)                          */
/* ------------------------------------------------------------------ */

function subgroupFromBody(body) {
  const splitTags = (s) =>
    String(s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  const youth = body?.isYouth;
  return {
    name: (body?.name || "").trim().slice(0, 80),
    description: (body?.description || "").trim() || null,
    isYouth: youth === "youth" ? true : youth === "adults" ? false : null,
    patrols: splitTags(body?.patrols),
    skills: splitTags(body?.skills),
    interests: splitTags(body?.interests),
    trainings: splitTags(body?.trainings),
  };
}

async function loadSubgroupAudience(orgId, subgroup) {
  const [members, validTrainings] = await Promise.all([
    prisma.member.findMany({
      where: { orgId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    subgroup.trainings?.length
      ? prisma.training.findMany({
          where: { orgId },
          select: { memberId: true, courseName: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);
  const trainingMap = buildCurrentTrainingsMap(validTrainings);
  return matchSubgroup(subgroup, members, trainingMap);
}

adminRouter.get("/subgroups", requireLeader, async (req, res) => {
  const groups = await prisma.subgroup.findMany({
    where: { orgId: req.org.id },
    orderBy: { name: "asc" },
  });

  const items = groups
    .map((g) => `
      <li>
        <div style="flex:1">
          <h3 style="margin:0">${escape(g.name)}</h3>
          <p class="muted small" style="margin:.1rem 0 0">${escape(describeSubgroup(g))}${
            g.description ? ` · ${escape(g.description)}` : ""
          }</p>
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/subgroups/${escape(g.id)}/edit">Edit</a>
          <form class="inline" method="post" action="/admin/subgroups/${escape(g.id)}/delete" onsubmit="return confirm('Delete this subgroup?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`)
    .join("");

  const body = `
    <h1>Subgroups</h1>
    <p class="muted">Saved audience queries you can target with broadcasts. Rules are AND across set fields, OR within a list.</p>

    <form class="card" method="post" action="/admin/subgroups">
      <h2 style="margin-top:0">New subgroup</h2>
      <label>Name<input name="name" type="text" required maxlength="80" placeholder="e.g. Drivers, WFA-certified, Eagles patrol"></label>
      <label>Description<textarea name="description" rows="2" maxlength="200"></textarea></label>
      <label>Audience kind
        <select name="isYouth">
          <option value="">Both</option>
          <option value="youth">Youth only</option>
          <option value="adults">Adults only</option>
        </select>
      </label>
      <label>Patrols (comma-separated; blank = any)<input name="patrols" type="text" maxlength="200"></label>
      <label>Skills (any of)<input name="skills" type="text" maxlength="200" placeholder="WFA, mechanic"></label>
      <label>Interests (any of)<input name="interests" type="text" maxlength="200"></label>
      <label>Trainings — must currently hold (any of)<input name="trainings" type="text" maxlength="200" placeholder="Youth Protection Training, Wood Badge"></label>
      <button class="btn btn-primary" type="submit">Create</button>
    </form>

    <h2 style="margin-top:1.5rem">Saved subgroups</h2>
    ${groups.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No subgroups yet. Create one above and use it as an audience in <a href="/admin/email">Email broadcast</a>.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Subgroups", body }));
});

adminRouter.post("/subgroups", requireLeader, async (req, res) => {
  const data = subgroupFromBody(req.body);
  if (!data.name) return res.redirect("/admin/subgroups");
  try {
    await prisma.subgroup.create({ data: { orgId: req.org.id, ...data } });
  } catch (_) {
    // Unique (orgId,name) collision → ignore.
  }
  res.redirect("/admin/subgroups");
});

adminRouter.get("/subgroups/:id/edit", requireLeader, async (req, res) => {
  const g = await prisma.subgroup.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!g) return res.status(404).send("Not found");
  const matched = await loadSubgroupAudience(req.org.id, g);
  const youthSel = (v) => (g.isYouth === v ? " selected" : "");
  const v = (k) => escape(g[k] ?? "");
  const list = matched
    .map(
      (m) => `<li><strong>${escape(m.firstName)} ${escape(m.lastName)}</strong>${
        m.patrol ? ` <span class="tag">${escape(m.patrol)}</span>` : ""
      } <span class="muted small">${escape(m.email || "(no email)")}</span></li>`,
    )
    .join("");
  const body = `
    <a class="back" href="/admin/subgroups" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Subgroups</a>
    <h1>Edit subgroup</h1>
    <form class="card" method="post" action="/admin/subgroups/${escape(g.id)}">
      <label>Name<input name="name" type="text" required maxlength="80" value="${v("name")}"></label>
      <label>Description<textarea name="description" rows="2" maxlength="200">${v("description")}</textarea></label>
      <label>Audience kind
        <select name="isYouth">
          <option value=""${g.isYouth == null ? " selected" : ""}>Both</option>
          <option value="youth"${youthSel(true)}>Youth only</option>
          <option value="adults"${youthSel(false)}>Adults only</option>
        </select>
      </label>
      <label>Patrols<input name="patrols" type="text" maxlength="200" value="${escape((g.patrols || []).join(", "))}"></label>
      <label>Skills (any of)<input name="skills" type="text" maxlength="200" value="${escape((g.skills || []).join(", "))}"></label>
      <label>Interests (any of)<input name="interests" type="text" maxlength="200" value="${escape((g.interests || []).join(", "))}"></label>
      <label>Trainings — must currently hold (any of)<input name="trainings" type="text" maxlength="200" value="${escape((g.trainings || []).join(", "))}"></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/subgroups">Cancel</a>
      </div>
    </form>

    <h2 style="margin-top:1.5rem">Audience preview <span class="muted" style="font-weight:400">(${matched.length})</span></h2>
    ${matched.length ? `<ul class="items">${list}</ul>` : `<div class="empty">Nobody currently matches.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Edit subgroup", body }));
});

adminRouter.post("/subgroups/:id", requireLeader, async (req, res) => {
  const g = await prisma.subgroup.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!g) return res.status(404).send("Not found");
  const data = subgroupFromBody(req.body);
  if (!data.name) return res.redirect(`/admin/subgroups/${g.id}/edit`);
  try {
    await prisma.subgroup.update({ where: { id: g.id }, data });
  } catch (_) {
    // Name collision → swallow.
  }
  res.redirect(`/admin/subgroups/${g.id}/edit`);
});

adminRouter.post("/subgroups/:id/delete", requireLeader, async (req, res) => {
  await prisma.subgroup.deleteMany({ where: { id: req.params.id, orgId: req.org.id } });
  res.redirect("/admin/subgroups");
});

/* ------------------------------------------------------------------ */
/* Video gallery (link-based)                                          */
/* ------------------------------------------------------------------ */

const VIDEO_VISIBILITY = ["public", "members"];

adminRouter.get("/videos", requireLeader, async (req, res) => {
  const list = await prisma.video.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const items = list
    .map(
      (v) => `
      <li>
        <div style="flex:1">
          <h3 style="margin:0">${escape(v.title)} <span class="tag">${escape(v.visibility)}</span></h3>
          <p class="muted small" style="margin:.1rem 0 0">
            <a href="${escape(v.url)}" target="_blank" rel="noopener">${escape(v.url)}</a>
            ${v.recordedAt ? ` · ${escape(new Date(v.recordedAt).toISOString().slice(0, 10))}` : ""}
          </p>
          ${v.notes ? `<p class="muted small">${escape(v.notes)}</p>` : ""}
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/videos/${escape(v.id)}/edit">Edit</a>
          <form class="inline" method="post" action="/admin/videos/${escape(v.id)}/delete" onsubmit="return confirm('Delete this video?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`,
    )
    .join("");

  const body = `
    <h1>Videos</h1>
    <p class="muted">Link-based gallery — paste a YouTube or Vimeo URL and it embeds. Members see videos at <code>/videos</code>; public ones also surface there to anonymous visitors.</p>

    <form class="card" method="post" action="/admin/videos">
      <h2 style="margin-top:0">Add a video</h2>
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. Camporee 2026 highlights"></label>
      <label>YouTube or Vimeo URL<input name="url" type="url" required maxlength="500"></label>
      <div class="row">
        <label style="margin:0;flex:1">Recorded<input name="recordedAt" type="date"></label>
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="members">Members only</option>
            <option value="public">Public</option>
          </select>
        </label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="500"></textarea></label>
      <button class="btn btn-primary" type="submit">Add video</button>
    </form>

    <h2 style="margin-top:1.5rem">Videos</h2>
    ${list.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No videos yet. Add one above.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Videos", body }));
});

function videoFromBody(body) {
  const recordedAt = parseDate(body?.recordedAt);
  const visibility = VIDEO_VISIBILITY.includes(body?.visibility) ? body.visibility : "members";
  return {
    title: (body?.title || "").trim().slice(0, 120) || "Untitled",
    url: (body?.url || "").trim().slice(0, 500),
    recordedAt: recordedAt || null,
    visibility,
    notes: (body?.notes || "").trim() || null,
  };
}

adminRouter.post("/videos", requireLeader, async (req, res) => {
  const data = videoFromBody(req.body);
  if (!data.url) return res.redirect("/admin/videos");
  const created = await prisma.video.create({
    data: { orgId: req.org.id, ...data },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Video",
    entityId: created.id,
    action: "create",
    summary: `Added "${created.title}"`,
  });
  res.redirect("/admin/videos");
});

adminRouter.get("/videos/:id/edit", requireLeader, async (req, res) => {
  const v = await prisma.video.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!v) return res.status(404).send("Not found");
  const get = (k) => escape(v[k] ?? "");
  const sel = (cond) => (cond ? " selected" : "");
  const recordedVal = v.recordedAt ? new Date(v.recordedAt).toISOString().slice(0, 10) : "";
  const body = `
    <a class="back" href="/admin/videos" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Videos</a>
    <h1>Edit video</h1>
    <form class="card" method="post" action="/admin/videos/${escape(v.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${get("title")}"></label>
      <label>URL<input name="url" type="url" required maxlength="500" value="${get("url")}"></label>
      <div class="row">
        <label style="margin:0;flex:1">Recorded<input name="recordedAt" type="date" value="${escape(recordedVal)}"></label>
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="members"${sel(v.visibility === "members")}>Members only</option>
            <option value="public"${sel(v.visibility === "public")}>Public</option>
          </select>
        </label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="500">${get("notes")}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/videos">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit video", body }));
});

adminRouter.post("/videos/:id", requireLeader, async (req, res) => {
  const v = await prisma.video.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!v) return res.status(404).send("Not found");
  const data = videoFromBody(req.body);
  await prisma.video.update({ where: { id: v.id }, data });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Video",
    entityId: v.id,
    action: "update",
    summary: `Edited "${data.title}"`,
  });
  res.redirect("/admin/videos");
});

adminRouter.post("/videos/:id/delete", requireLeader, async (req, res) => {
  await prisma.video.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Video",
    entityId: req.params.id,
    action: "delete",
    summary: "Deleted video",
  });
  res.redirect("/admin/videos");
});

// Per-org data export. Returns a single JSON document with every
// org-scoped row the leader's org owns. Useful for backups and for
// the "give me my data" path when a council customer churns.
//
// Doesn't include uploaded files (photos, receipts, forms). Those live
// in the per-org storage area and would need a zip wrapper — tracked
// separately in the roadmap.
adminRouter.get("/export.json", requireLeader, async (req, res) => {
  const orgId = req.org.id;
  const where = { orgId };

  // Tables we own. Plain `where` filter keeps each query fast on the
  // existing indexes; we don't need joins because the JSON consumer can
  // re-link by foreign keys.
  const [
    org,
    members,
    page,
    customPages,
    announcements,
    posts,
    postPhotos,
    comments,
    events,
    rsvps,
    slots,
    slotAssignments,
    tripPlans,
    meals,
    ingredients,
    gear,
    rides,
    rideRiders,
    albums,
    photos,
    forms,
    surveys,
    surveyResponses,
    eagleScouts,
    eagleProjects,
    cohAwards,
    equipment,
    trainings,
    positionTerms,
    subgroups,
    mbcs,
    reimbursements,
    oaElections,
    oaCandidates,
    mailLogs,
    auditLogs,
  ] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId } }),
    prisma.member.findMany({ where }),
    prisma.page.findUnique({ where: { orgId } }),
    prisma.customPage.findMany({ where }),
    prisma.announcement.findMany({ where }),
    prisma.post.findMany({ where }),
    prisma.postPhoto.findMany({ where }),
    prisma.comment.findMany({ where }),
    prisma.event.findMany({ where }),
    prisma.rsvp.findMany({ where }),
    prisma.signupSlot.findMany({ where }),
    prisma.slotAssignment.findMany({ where }),
    prisma.tripPlan.findMany({ where }),
    prisma.meal.findMany({ where }),
    prisma.ingredient.findMany({ where }),
    prisma.gearItem.findMany({ where }),
    prisma.carRide.findMany({ where }),
    prisma.carRideRider.findMany({ where }),
    prisma.album.findMany({ where }),
    prisma.photo.findMany({ where }),
    prisma.form.findMany({ where }),
    prisma.survey.findMany({ where }),
    prisma.surveyResponse.findMany({ where }),
    prisma.eagleScout.findMany({ where }),
    prisma.eagleProject.findMany({ where }),
    prisma.cohAward.findMany({ where }),
    prisma.equipment.findMany({ where }),
    prisma.training.findMany({ where }),
    prisma.positionTerm.findMany({ where }),
    prisma.subgroup.findMany({ where }),
    prisma.meritBadgeCounselor.findMany({ where }),
    prisma.reimbursement.findMany({ where }),
    prisma.oaElection.findMany({ where }),
    prisma.oaCandidate.findMany({ where }),
    prisma.mailLog.findMany({ where }),
    prisma.auditLog.findMany({ where }),
  ]);

  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Org",
    entityId: orgId,
    action: "export",
    summary: `Downloaded full data export`,
  });

  const dump = {
    schema: "compass/v1",
    exportedAt: new Date().toISOString(),
    org,
    page,
    members,
    customPages,
    announcements,
    posts,
    postPhotos,
    comments,
    events,
    rsvps,
    signupSlots: slots,
    slotAssignments,
    tripPlans,
    meals,
    ingredients,
    gear,
    carRides: rides,
    carRideRiders: rideRiders,
    albums,
    photos,
    forms,
    surveys,
    surveyResponses,
    eagleScouts,
    eagleProjects,
    cohAwards,
    equipment,
    trainings,
    positionTerms,
    subgroups,
    meritBadgeCounselors: mbcs,
    reimbursements,
    oaElections,
    oaCandidates,
    mailLogs,
    auditLogs,
  };

  const filename = `${req.org.slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
  res
    .type("application/json")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(JSON.stringify(dump, null, 2));
});

adminRouter.get("/export", requireLeader, async (req, res) => {
  const counts = await prisma.$transaction([
    prisma.member.count({ where: { orgId: req.org.id } }),
    prisma.event.count({ where: { orgId: req.org.id } }),
    prisma.post.count({ where: { orgId: req.org.id } }),
    prisma.photo.count({ where: { orgId: req.org.id } }),
  ]);
  const [memberCount, eventCount, postCount, photoCount] = counts;

  const body = `
    <h1>Export</h1>
    <p class="muted">Download a single JSON file with everything your unit owns: roster, calendar, posts, RSVPs, trip plans, surveys, audit log — every row scoped to <code>${escape(req.org.slug)}</code>.</p>

    <div class="card">
      <p><strong>What's in the export</strong></p>
      <p class="muted small">${memberCount} members · ${eventCount} events · ${postCount} posts · ${photoCount} photo records</p>
      <p class="muted small">Uploaded files (photos, document attachments, receipts) aren't bundled into the JSON — they live in object storage and need a separate sync. A zip wrapper that includes them is a roadmap follow-up.</p>
      <a class="btn btn-primary" href="/admin/export.json">Download export.json</a>
    </div>

    <p class="muted small" style="margin-top:1rem">Exports are audit-logged. Anyone with the <em>leader</em> or <em>admin</em> role on this org can run one.</p>
  `;
  res.type("html").send(layout(req, { title: "Export", body }));
});

// Per-org analytics dashboard. Same shape as /__super/analytics but
// scoped to req.org.id, so leaders see only their unit's traffic and
// errors. No third-party tracker, no IPs; data comes from the AuditLog
// rows the first-party telemetry beacon writes.
const ADMIN_ANALYTICS_WINDOWS = {
  "24h": { ms: 24 * 60 * 60 * 1000, label: "Last 24 hours" },
  "7d":  { ms: 7  * 24 * 60 * 60 * 1000, label: "Last 7 days" },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, label: "Last 30 days" },
  "90d": { ms: 90 * 24 * 60 * 60 * 1000, label: "Last 90 days" },
};

adminRouter.get("/analytics", requireLeader, async (req, res) => {
  const orgId = req.org.id;
  const windowKey = ADMIN_ANALYTICS_WINDOWS[String(req.query.window || "30d")] ? String(req.query.window || "30d") : "30d";
  const win = ADMIN_ANALYTICS_WINDOWS[windowKey];
  const surfaceParam = String(req.query.surface || "all");
  // Marketing isn't org-scoped (anonymous apex visits) so we omit it
  // from the picker — leaders only see tenant + admin traffic.
  const surface = ["tenant", "admin"].includes(surfaceParam) ? surfaceParam : null;
  const since = new Date(Date.now() - win.ms);

  const [summary, paths, clicks, errors, fails, perDay, eventRollup] = await Promise.all([
    summarize({ orgId, since }, prisma),
    topPaths({ orgId, surface, since, limit: 10 }, prisma),
    topClicks({ orgId, surface, since, limit: 10 }, prisma),
    recentErrors({ orgId, since, limit: 12 }, prisma),
    recentFetchFails({ orgId, since, limit: 12 }, prisma),
    pageViewsByDay({ orgId, since }, prisma),
    rollupAnalytics({ orgId, since }, prisma),
  ]);

  const days = bucketDaysAdmin(since, new Date(), perDay);
  const sparkMax = days.reduce((m, d) => Math.max(m, d.count), 1);

  // Tenant + admin only (marketing has no orgId so it would always be 0).
  const surfaceTotal =
    summary.pageViewsBySurface.tenant +
    summary.pageViewsBySurface.admin +
    (summary.pageViewsBySurface.unknown || 0);

  function windowLink(k) {
    const cls = k === windowKey ? 'class="tag tag-on"' : 'class="tag"';
    const q = surface ? `&surface=${encodeURIComponent(surface)}` : "";
    return `<a href="/admin/analytics?window=${k}${q}" ${cls}>${escape(ADMIN_ANALYTICS_WINDOWS[k].label)}</a>`;
  }
  function surfaceLink(s, label) {
    const active = (s === null && !surface) || s === surface;
    const cls = active ? 'class="tag tag-on"' : 'class="tag"';
    const q = s ? `?window=${windowKey}&surface=${encodeURIComponent(s)}` : `?window=${windowKey}`;
    return `<a href="/admin/analytics${q}" ${cls}>${escape(label)}</a>`;
  }
  function surfaceTag(s) {
    const colors = { tenant: "#0891b2", admin: "#1d4ed8", unknown: "#a3a89e" };
    const c = colors[s] || "#a3a89e";
    return `<span class="tag" style="background:${c};color:#0f172a;border-color:${c}">${escape(s)}</span>`;
  }
  function surfaceBar(s, label, count) {
    const pct = surfaceTotal ? (count / surfaceTotal) * 100 : 0;
    return `<div style="margin:.5rem 0">
      <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-bottom:.25rem">
        <span>${escape(label)}</span>
        <span class="muted">${count} · ${pct.toFixed(0)}%</span>
      </div>
      <div style="height:8px;background:var(--surface-sand);border-radius:4px;overflow:hidden">
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

  // Org-scoped server events ('user-signed-up', 'event-published',
  // 'newsletter-sent', etc.) shown alongside the page-view roll-up so
  // leaders can answer "did the new event publish? did the digest go?"
  const lookupBySurface = new Map();
  const orgRollupRows = eventRollup.filter((r) => !["page-view", "element-clicked", "client-error", "fetch-failed"].includes(r.event));

  const body = `
    <h1>Analytics</h1>
    <p class="muted" style="margin-top:-.5rem">
      What's getting used inside <strong>${escape(req.org.displayName)}</strong>:
      page views, button clicks, errors, and the unit-scoped server
      events recorded by Compass (RSVPs, signups, broadcasts).
      <br>No third-party tracker, no IPs.
    </p>

    <div class="row" style="gap:.4rem;margin-bottom:1rem">
      ${windowLink("24h")} ${windowLink("7d")} ${windowLink("30d")} ${windowLink("90d")}
      <span class="muted" style="margin-left:1rem">Surface:</span>
      ${surfaceLink(null, "all")}
      ${surfaceLink("tenant", "public site")}
      ${surfaceLink("admin", "admin")}
    </div>

    <section class="dash-stats" style="margin-bottom:1.25rem">
      ${dashboardStatCard("Page views", { value: String(summary.totals.pageViews), hint: win.label.toLowerCase(), color: "sky" })}
      ${dashboardStatCard("Clicks", { value: String(summary.totals.clicks), hint: "[data-track]", color: "accent" })}
      ${dashboardStatCard("Errors", { value: String(summary.totals.errors), hint: summary.totals.errors > 0 ? "needs a look" : "all clear", color: summary.totals.errors > 0 ? "raspberry" : "butter" })}
      ${dashboardStatCard("Fetch fails", { value: String(summary.totals.fetchFails), hint: "non-2xx", color: "ember" })}
    </section>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <h3>Page views by surface</h3>
        ${surfaceTotal === 0
          ? `<div class="empty">No page views in this window.</div>`
          : `${surfaceBar("tenant", "Public site (families)", summary.pageViewsBySurface.tenant)}
             ${surfaceBar("admin", "Admin (leaders)", summary.pageViewsBySurface.admin)}
             ${summary.pageViewsBySurface.unknown ? surfaceBar("unknown", "Unknown", summary.pageViewsBySurface.unknown) : ""}`}
      </div>

      <div class="card">
        <h3>Page views per day</h3>
        ${sparkline}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <h3>Top paths${surface ? ` · ${escape(surface)}` : ""}</h3>
        ${paths.length === 0
          ? `<div class="empty">No page views in this window.</div>`
          : `<table style="width:100%;border-collapse:collapse">
              <thead><tr style="text-align:left;border-bottom:1px solid var(--line)">
                <th style="padding:.45rem 0">Path</th>
                <th style="padding:.45rem 0;text-align:right">Views</th>
              </tr></thead>
              <tbody>${paths.map((p) => `<tr style="border-bottom:1px solid var(--line-soft)">
                <td style="padding:.45rem 0"><code>${escape(p.path)}</code></td>
                <td style="padding:.45rem 0;text-align:right;font-variant-numeric:tabular-nums">${p.count}</td>
              </tr>`).join("")}</tbody>
            </table>`}
      </div>

      <div class="card">
        <h3>Top clicks${surface ? ` · ${escape(surface)}` : ""}</h3>
        <p class="muted small" style="margin:0 0 .5rem">
          Add <code>data-track="label"</code> on a button or link to land here.
        </p>
        ${clicks.length === 0
          ? `<div class="empty">No tracked clicks in this window.</div>`
          : `<table style="width:100%;border-collapse:collapse">
              <thead><tr style="text-align:left;border-bottom:1px solid var(--line)">
                <th style="padding:.45rem 0">Label</th>
                <th style="padding:.45rem 0;text-align:right">Clicks</th>
              </tr></thead>
              <tbody>${clicks.map((c) => `<tr style="border-bottom:1px solid var(--line-soft)">
                <td style="padding:.45rem 0"><code>${escape(c.label)}</code></td>
                <td style="padding:.45rem 0;text-align:right;font-variant-numeric:tabular-nums">${c.count}</td>
              </tr>`).join("")}</tbody>
            </table>`}
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <h3 style="margin-top:0">Server events</h3>
      <p class="muted small" style="margin:0 0 .5rem">RSVPs, broadcasts, signups, channel suspensions — recorded server-side via <code>lib/analytics.track</code>, not the browser.</p>
      ${orgRollupRows.length === 0
        ? `<div class="empty muted small">No server events in this window. They land here as members RSVP, leaders broadcast, etc.</div>`
        : `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="text-align:left;border-bottom:1px solid var(--line)">
              <th style="padding:.45rem 0">Event</th>
              <th style="padding:.45rem 0;text-align:right">Count</th>
            </tr></thead>
            <tbody>${orgRollupRows.map((r) => `<tr style="border-bottom:1px solid var(--line-soft)">
              <td style="padding:.45rem 0"><code>${escape(r.event)}</code></td>
              <td style="padding:.45rem 0;text-align:right;font-variant-numeric:tabular-nums">${r.count}</td>
            </tr>`).join("")}</tbody>
          </table>`}
    </div>

    <div class="card" style="margin-bottom:1rem">
      <h3 style="margin-top:0">Recent client errors</h3>
      ${errors.length === 0
        ? `<div class="empty">No client errors in this window. 🎉</div>`
        : `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="text-align:left;border-bottom:1px solid var(--line)">
              <th style="padding:.45rem 0">Message</th>
              <th style="padding:.45rem 0">Surface</th>
              <th style="padding:.45rem 0">Path</th>
              <th style="padding:.45rem 0">When</th>
            </tr></thead>
            <tbody>${errors.map((e) => `<tr style="border-bottom:1px solid var(--line-soft)">
              <td style="padding:.45rem 0"><strong>${escape(e.message)}</strong></td>
              <td style="padding:.45rem 0">${surfaceTag(e.surface)}</td>
              <td style="padding:.45rem 0"><code>${escape(e.path)}</code></td>
              <td style="padding:.45rem 0;color:var(--ink-muted);font-size:.78rem">${escape(new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " "))}</td>
            </tr>`).join("")}</tbody>
          </table>`}
    </div>

    <div class="card">
      <h3 style="margin-top:0">Recent failed fetches</h3>
      ${fails.length === 0
        ? `<div class="empty">No non-2xx fetches in this window.</div>`
        : `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="text-align:left;border-bottom:1px solid var(--line)">
              <th style="padding:.45rem 0">Status</th>
              <th style="padding:.45rem 0">URL</th>
              <th style="padding:.45rem 0">From</th>
              <th style="padding:.45rem 0">When</th>
            </tr></thead>
            <tbody>${fails.map((f) => `<tr style="border-bottom:1px solid var(--line-soft)">
              <td style="padding:.45rem 0"><span class="tag" style="${f.status >= 500 ? "background:var(--danger);color:#fff;border-color:var(--danger)" : ""}">${f.status}</span></td>
              <td style="padding:.45rem 0"><code>${escape(f.url)}</code></td>
              <td style="padding:.45rem 0"><code style="font-size:.74rem">${escape(f.path)}</code></td>
              <td style="padding:.45rem 0;color:var(--ink-muted);font-size:.78rem">${escape(new Date(f.createdAt).toISOString().slice(0, 16).replace("T", " "))}</td>
            </tr>`).join("")}</tbody>
          </table>`}
    </div>
  `;
  res.type("html").send(layout(req, { title: "Analytics", body }));
});

function bucketDaysAdmin(since, until, perDay) {
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

// Audit log — last 200 entries, filterable by entity type.
// Invite a new leader / parent / admin by email. Sends a signed-token
// link; recipient clicks, signs up if needed, and lands on the org
// admin attached at the chosen role.
adminRouter.get("/invites", requireLeader, async (req, res) => {
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const sample = `https://${escape(req.org.slug)}.${escape(apex)}/invite/<token>`;
  const sent = req.query.sent ? `<div class="flash flash-ok">Invite sent to ${escape(String(req.query.sent))}.</div>` : "";
  const body = `
    <h1>Invite someone</h1>
    <p class="muted">Send a signed-link invitation. They click, create or sign in to an account, and land in this org at the role you pick. Links expire in 14 days.</p>
    ${sent}
    <form class="card" method="post" action="/admin/invites">
      <label>Email address<input name="email" type="email" required maxlength="200" placeholder="leader@example.com"></label>
      <label>Role
        <select name="role">
          ${INVITABLE_ROLES.map((r) => `<option value="${escape(r)}">${escape(INVITE_ROLE_LABELS[r])}</option>`).join("")}
        </select>
      </label>
      <label>Personal note (optional)<textarea name="note" rows="3" maxlength="500" placeholder="Hey Sarah — sending you the leader invite we talked about Tuesday."></textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Send invite</button>
        <a class="btn btn-ghost" href="/admin/members">Cancel</a>
      </div>
    </form>
    <p class="muted small">Invite links look like: <code>${sample}</code></p>`;
  res.type("html").send(layout(req, { title: "Invite", body }));
});

adminRouter.post("/invites", requireLeader, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const role = String(req.body?.role || "leader");
  const note = String(req.body?.note || "").trim().slice(0, 500);
  if (!email || !INVITABLE_ROLES.includes(role)) {
    return res.status(400).type("text/plain").send("email + valid role required");
  }
  const token = makeInviteToken(
    { orgId: req.org.id, email, role, invitedBy: req.user.id },
    { secret: inviteSecret() },
  );
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const link = `https://${req.org.slug}.${apex}/invite/${token}`;
  const subject = `${req.user.displayName} invited you to ${req.org.displayName} on Compass`;
  const text = [
    `${req.user.displayName} invited you to join ${req.org.displayName} on Compass — the modern communication and organization platform for volunteer Scout units.`,
    "",
    note ? `${note}\n` : null,
    `Accept the invite (link expires in 14 days):\n${link}`,
    "",
    "If you didn't expect this email, you can ignore it. The invite expires automatically.",
  ]
    .filter((s) => s !== null)
    .join("\n");
  const apexFrom = process.env.MAIL_FROM_DEFAULT || `noreply@${apex}`;
  await sendBatch([
    {
      from: `${req.user.displayName} via Compass <${apexFrom}>`,
      to: email,
      subject,
      text,
    },
  ]);
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Invite",
    action: "invite:sent",
    summary: `Invited ${email} as ${role}`,
  });
  res.redirect(`/admin/invites?sent=${encodeURIComponent(email)}`);
});

adminRouter.get("/audit", requireLeader, async (req, res) => {
  const entityType = (req.query.type || "").toString();
  const where = { orgId: req.org.id };
  if (entityType) where.entityType = entityType;
  const [logs, types] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: { orgId: req.org.id },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  const fmtDate = (d) =>
    new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const items = logs
    .map(
      (l) => `
      <li>
        <div style="flex:1">
          <strong>${escape(l.entityType)}</strong> · ${escape(l.action)}
          ${l.summary ? `<div class="muted small">${escape(l.summary)}</div>` : ""}
        </div>
        <div class="muted small" style="text-align:right;min-width:200px">
          ${escape(l.userDisplay || "—")}
          <br>${escape(fmtDate(l.createdAt))}
        </div>
      </li>`,
    )
    .join("");

  const filterOpts = types
    .map(
      (t) =>
        `<option value="${escape(t.entityType)}"${t.entityType === entityType ? " selected" : ""}>${escape(t.entityType)}</option>`,
    )
    .join("");

  const body = `
    <h1>Audit log</h1>
    <p class="muted">Who edited what — last 200 entries. Useful for tracing CMS / roster changes.</p>

    <form class="card" method="get" action="/admin/audit">
      <div class="row" style="align-items:end">
        <label style="margin:0;flex:1">Filter by entity
          <select name="type">
            <option value="">All types</option>
            ${filterOpts}
          </select>
        </label>
        <button class="btn btn-primary" type="submit">Apply</button>
        ${entityType ? `<a class="btn btn-ghost" href="/admin/audit">Clear</a>` : ""}
      </div>
    </form>

    ${logs.length ? `<ul class="items" style="margin-top:1rem">${items}</ul>` : `<div class="empty" style="margin-top:1rem">No audit entries yet.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Audit log", body }));
});

// Org-wide PoR roster: who's currently holding which position.
adminRouter.get("/positions", requireLeader, async (req, res) => {
  const open = await prisma.positionTerm.findMany({
    where: { orgId: req.org.id, endedAt: null },
    orderBy: [{ position: "asc" }, { startedAt: "asc" }],
    include: { member: { select: { id: true, firstName: true, lastName: true, isYouth: true } } },
  });
  const fmt = (d) => new Date(d).toISOString().slice(0, 10);
  const items = open
    .map((t) => {
      const m = t.member;
      const days = Math.max(
        0,
        Math.floor((Date.now() - new Date(t.startedAt).getTime()) / 86400000),
      );
      return `
      <li>
        <div style="flex:1">
          <h3 style="margin:0">${escape(t.position)}</h3>
          <p class="muted small" style="margin:.1rem 0 0">
            <a href="/admin/members/${escape(m.id)}/edit">${escape(m.firstName)} ${escape(m.lastName)}</a>
            · since ${escape(fmt(t.startedAt))} (${days}d)
          </p>
        </div>
      </li>`;
    })
    .join("");
  const body = `
    <h1>Position roster</h1>
    <p class="muted">Active Positions of Responsibility across the unit.</p>
    ${open.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No active position terms. Set the <em>Position</em> field on a member to start one.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Position roster", body }));
});

// Roster reports — birthdays, tenure, demographic breakdown.
adminRouter.get("/reports", requireLeader, async (req, res) => {
  const members = await prisma.member.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);
  const niceDate = (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const today = new Date();
  const todayKey = today.getMonth() * 100 + today.getDate();

  // Upcoming birthdays — next 60 days, ignoring birth year. Wraps Dec → Jan.
  const upcoming = members
    .filter((m) => m.birthdate)
    .map((m) => {
      const b = new Date(m.birthdate);
      const month = b.getUTCMonth();
      const day = b.getUTCDate();
      const next = new Date(today.getFullYear(), month, day);
      if (
        next < today &&
        !(next.getMonth() === today.getMonth() && next.getDate() === today.getDate())
      ) {
        next.setFullYear(today.getFullYear() + 1);
      }
      const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
      const turning = today.getFullYear() - b.getUTCFullYear() + (next.getFullYear() > today.getFullYear() ? 1 : 0);
      return { m, next, daysUntil, turning, key: month * 100 + day };
    })
    .filter((x) => x.daysUntil <= 60)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const birthdayHtml = upcoming.length
    ? `<ul class="items">${upcoming
        .map((x) => {
          const isToday = x.key === todayKey;
          return `<li>
            <div style="flex:1">
              <strong>${escape(x.m.firstName)} ${escape(x.m.lastName)}</strong>
              ${isToday ? ` <span class="tag">today!</span>` : ""}
              <div class="muted small">${escape(niceDate(x.next))} · turning ${x.turning} · in ${x.daysUntil}d</div>
            </div>
            <a class="btn btn-ghost small" href="/admin/members/${escape(x.m.id)}/edit">Edit</a>
          </li>`;
        })
        .join("")}</ul>`
    : `<div class="empty">No birthdays in the next 60 days. Add birthdates on member profiles to populate.</div>`;

  // Tenure leaderboard — longest-serving 10 members by joinedAt.
  const tenure = [...members]
    .filter((m) => m.joinedAt)
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
    .slice(0, 10);

  const tenureHtml = tenure.length
    ? `<ul class="items">${tenure
        .map((m) => {
          const years = (Date.now() - new Date(m.joinedAt).getTime()) / (365.25 * 86400000);
          return `<li>
            <div style="flex:1">
              <strong>${escape(m.firstName)} ${escape(m.lastName)}</strong>${
                m.isYouth ? "" : ` <span class="tag">adult</span>`
              }
              <div class="muted small">Joined ${escape(fmtDate(m.joinedAt))} · ${years.toFixed(1)} years</div>
            </div>
            <a class="btn btn-ghost small" href="/admin/members/${escape(m.id)}/edit">Edit</a>
          </li>`;
        })
        .join("")}</ul>`
    : `<div class="empty">No join dates recorded yet.</div>`;

  // Roster breakdown
  const youthCount = members.filter((m) => m.isYouth).length;
  const adultCount = members.length - youthCount;
  const withEmail = members.filter((m) => m.email).length;
  const dietaryCount = members.filter((m) => m.dietaryFlags?.length).length;
  const activePor = await prisma.positionTerm.count({
    where: { orgId: req.org.id, endedAt: null },
  });

  const body = `
    <h1>Reports</h1>
    <p class="muted">A quick read on the roster — birthdays, tenure, and demographics.</p>

    <div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
      <div class="card stat-card"><strong style="font-size:1.6rem">${members.length}</strong><br><span class="muted small">Total members</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${youthCount}</strong><br><span class="muted small">Youth</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${adultCount}</strong><br><span class="muted small">Adults</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${activePor}</strong><br><span class="muted small">Active PoRs</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${withEmail}</strong><br><span class="muted small">With email</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${dietaryCount}</strong><br><span class="muted small">Dietary flags</span></div>
    </div>

    <h2>Upcoming birthdays</h2>
    ${birthdayHtml}

    <h2 style="margin-top:1.5rem">Longest tenure</h2>
    ${tenureHtml}

    <style>
      .stat-card{flex:1;min-width:140px;text-align:center}
    </style>
  `;
  res.type("html").send(layout(req, { title: "Reports", body }));
});

// Per-member credits earned from event attendance: service hours,
// camping nights, hiking miles. Sum across yes-RSVPs on past events.
async function loadCreditsRoster(orgId) {
  const [members, rsvps] = await Promise.all([
    prisma.member.findMany({
      where: { orgId },
      orderBy: [{ isYouth: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.rsvp.findMany({
      where: { orgId, response: "yes", memberId: { not: null } },
      select: {
        memberId: true,
        response: true,
        event: {
          select: {
            startsAt: true,
            serviceHours: true,
            campingNights: true,
            hikingMiles: true,
          },
        },
      },
    }),
  ]);
  const totals = tallyCredits(rsvps);
  return members.map((m) => ({
    member: m,
    totals: totals.get(m.id) || {
      serviceHours: 0,
      campingNights: 0,
      hikingMiles: 0,
      eventCount: 0,
    },
  }));
}

adminRouter.get("/credits", requireLeader, async (req, res) => {
  const rows = await loadCreditsRoster(req.org.id);
  const items = rows
    .filter((r) => r.totals.eventCount > 0)
    .map((r) => {
      const t = r.totals;
      const m = r.member;
      return `
      <li>
        <div style="flex:1">
          <strong>${escape(m.firstName)} ${escape(m.lastName)}</strong>${
            m.isYouth ? "" : ` <span class="tag">adult</span>`
          }
          <div class="muted small">
            ${t.serviceHours > 0 ? `${t.serviceHours.toFixed(1)} service hr · ` : ""}${
              t.campingNights > 0 ? `${t.campingNights} camping nt · ` : ""
            }${t.hikingMiles > 0 ? `${t.hikingMiles.toFixed(1)} mi · ` : ""}${t.eventCount} event${t.eventCount === 1 ? "" : "s"}
          </div>
        </div>
        <a class="btn btn-ghost small" href="/admin/members/${escape(m.id)}/edit">Edit</a>
      </li>`;
    })
    .join("");

  const totals = rows.reduce(
    (acc, r) => {
      acc.serviceHours += r.totals.serviceHours;
      acc.campingNights += r.totals.campingNights;
      acc.hikingMiles += r.totals.hikingMiles;
      return acc;
    },
    { serviceHours: 0, campingNights: 0, hikingMiles: 0 },
  );

  const body = `
    <h1>Credits</h1>
    <p class="muted">Service hours, camping nights, and hiking miles auto-tallied from yes-RSVPs on past events. Set the per-attendee credits on each event when you create it.</p>

    <div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
      <div class="card stat-card"><strong style="font-size:1.6rem">${totals.serviceHours.toFixed(1)}</strong><br><span class="muted small">Service hr (unit total)</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${totals.campingNights}</strong><br><span class="muted small">Camping nt (unit total)</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${totals.hikingMiles.toFixed(1)}</strong><br><span class="muted small">Miles (unit total)</span></div>
    </div>

    <p><a class="btn btn-ghost" href="/admin/credits.csv">Export CSV</a> <span class="muted small">— hand the file to your advancement chair.</span></p>

    ${items.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No credits yet. Set <em>Credits per attendee</em> on an event and collect yes-RSVPs.</div>`}

    <style>.stat-card{flex:1;min-width:140px;text-align:center}</style>
  `;
  res.type("html").send(layout(req, { title: "Credits", body }));
});

adminRouter.get("/credits.csv", requireLeader, async (req, res) => {
  const rows = await loadCreditsRoster(req.org.id);
  const lines = [
    formatCsvRow([
      "First name",
      "Last name",
      "Email",
      "Youth",
      "Service hours",
      "Camping nights",
      "Hiking miles",
      "Events attended",
    ]),
  ];
  for (const r of rows) {
    if (r.totals.eventCount === 0) continue;
    lines.push(
      formatCsvRow([
        r.member.firstName,
        r.member.lastName,
        r.member.email || "",
        r.member.isYouth ? "yes" : "no",
        r.totals.serviceHours,
        r.totals.campingNights,
        r.totals.hikingMiles,
        r.totals.eventCount,
      ]),
    );
  }
  res
    .type("text/csv; charset=utf-8")
    .set(
      "Content-Disposition",
      `attachment; filename="${req.org.slug}-credits-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    .send(lines.join("\n"));
});

adminRouter.post("/members/:id", requireLeader, async (req, res) => {
  const member = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, position: true },
  });
  if (!member) return res.status(404).send("Not found");
  const data = memberFromBody(req.body || {});
  if (!data.firstName || !data.lastName) return res.redirect(`/admin/members/${member.id}/edit`);
  await prisma.member.update({ where: { id: member.id }, data });
  await reconcilePositionTerm(req.org.id, member.id, member.position, data.position);
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Member",
    entityId: member.id,
    action: "update",
    summary: `Edited ${data.firstName} ${data.lastName}`,
  });
  res.redirect(`/admin/members/${member.id}/edit`);
});

// Manually add a historical position term (e.g. backfill an old role).
adminRouter.post("/members/:id/positions", requireLeader, async (req, res) => {
  const member = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!member) return res.status(404).send("Not found");
  const position = (req.body?.position || "").toString().trim();
  const startedAt = req.body?.startedAt ? new Date(req.body.startedAt) : null;
  const endedAt = req.body?.endedAt ? new Date(req.body.endedAt) : null;
  if (!position || !startedAt || isNaN(startedAt.getTime())) {
    return res.redirect(`/admin/members/${member.id}/edit`);
  }
  await prisma.positionTerm.create({
    data: {
      orgId: req.org.id,
      memberId: member.id,
      position,
      startedAt,
      endedAt: endedAt && !isNaN(endedAt.getTime()) ? endedAt : null,
      notes: (req.body?.notes || "").toString().trim() || null,
    },
  });
  res.redirect(`/admin/members/${member.id}/edit`);
});

// End an open position term today.
adminRouter.post("/members/:id/positions/:termId/end", requireLeader, async (req, res) => {
  await prisma.positionTerm.updateMany({
    where: {
      id: req.params.termId,
      orgId: req.org.id,
      memberId: req.params.id,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
  res.redirect(`/admin/members/${req.params.id}/edit`);
});

// Delete a position term outright.
adminRouter.post("/members/:id/positions/:termId/delete", requireLeader, async (req, res) => {
  await prisma.positionTerm.deleteMany({
    where: { id: req.params.termId, orgId: req.org.id, memberId: req.params.id },
  });
  res.redirect(`/admin/members/${req.params.id}/edit`);
});

// Clear a previously-set bounce flag. Resets emailUnsubscribed too —
// the leader has decided the address is fixed, so we trust them.
adminRouter.post("/members/:id/clear-bounce", requireLeader, async (req, res) => {
  await prisma.member.updateMany({
    where: { id: req.params.id, orgId: req.org.id },
    data: { bouncedAt: null, bounceReason: null, emailUnsubscribed: false, unsubscribedAt: null },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Member",
    entityId: req.params.id,
    action: "clear-bounce",
    summary: "Bounce + unsubscribe flags cleared",
  });
  res.redirect(`/admin/members/${req.params.id}/edit`);
});

// Per-member message history. Surfaces every MailLog (broadcast or
// newsletter) where this member appeared in the recipient snapshot, so
// a leader can answer "what have we said to the Schmidt family in the
// last month" without scrolling the org-wide history.
//
// We filter in-memory against MailLog.recipients (a Json snapshot
// captured at send time). The query is bounded by orgId + a 500-row
// look-back; older rows page in via the Older link. For our
// communication volumes this is comfortably fast — a unit sends a
// handful of broadcasts per week.
adminRouter.get("/members/:id/messages", requireLeader, async (req, res) => {
  const member = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (!member) return res.status(404).send("Not found");

  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const PAGE = 50;
  const SCAN = 500; // bounded look-back
  const where = { orgId: req.org.id };
  if (before && !Number.isNaN(before.getTime())) where.sentAt = { lt: before };
  const logs = await prisma.mailLog.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: SCAN,
    select: {
      id: true,
      subject: true,
      sentAt: true,
      channel: true,
      audienceLabel: true,
      status: true,
      recipientCount: true,
      recipients: true,
    },
  });

  const memberEmail = (member.email || "").trim().toLowerCase();
  const memberPhone = (member.phone || "").replace(/\D/g, "");
  const matches = logs.filter((log) => {
    const list = Array.isArray(log.recipients) ? log.recipients : [];
    for (const r of list) {
      if (memberEmail && (r.email || "").toLowerCase() === memberEmail) return true;
      if (memberPhone && String(r.phone || "").replace(/\D/g, "") === memberPhone) return true;
    }
    return false;
  });

  const page = matches.slice(0, PAGE);
  const hasMore = matches.length > PAGE || logs.length === SCAN;
  const oldestSeen = page.length ? page[page.length - 1].sentAt : null;
  const fmt = (d) =>
    new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const statusTag = (s) => {
    if (s === "sent") return `<span class="tag" style="background:#bcd0f4;border-color:#1d4ed8;color:#0f172a">sent</span>`;
    if (s === "partial") return `<span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">partial</span>`;
    if (s === "failed") return `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">failed</span>`;
    return `<span class="tag">${escape(s)}</span>`;
  };

  const items = page
    .map((log) => {
      // Recover the per-member channel from the snapshot.
      const list = Array.isArray(log.recipients) ? log.recipients : [];
      const hit = list.find(
        (r) =>
          (memberEmail && (r.email || "").toLowerCase() === memberEmail) ||
          (memberPhone && String(r.phone || "").replace(/\D/g, "") === memberPhone),
      );
      const ch = hit?.channel || log.channel;
      return `
      <li>
        <div style="flex:1">
          <h3 style="margin:0">${escape(log.subject)}</h3>
          <p class="muted small" style="margin:.1rem 0 0">
            ${statusTag(log.status)}
            <span class="tag">${escape(ch)}</span>
            <span class="tag">${escape(log.audienceLabel)}</span>
            · ${escape(fmt(log.sentAt))}
            · ${log.recipientCount} recipient${log.recipientCount === 1 ? "" : "s"}
          </p>
        </div>
      </li>`;
    })
    .join("");

  const olderLink = hasMore && oldestSeen
    ? `<p style="margin-top:1rem"><a class="btn btn-ghost" href="/admin/members/${escape(member.id)}/messages?before=${encodeURIComponent(oldestSeen.toISOString())}">Older →</a></p>`
    : "";

  const body = `
    <a class="back" href="/admin/members/${escape(member.id)}/edit" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← ${escape(member.firstName)} ${escape(member.lastName)}</a>
    <h1>Message history</h1>
    <p class="muted">Every email or SMS broadcast (including newsletters) where <strong>${escape(member.firstName)} ${escape(member.lastName)}</strong> appeared in the recipient snapshot.</p>
    <p class="muted small">${escape(member.email || "no email on file")}${member.phone ? " · " + escape(member.phone) : ""}</p>
    ${page.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No broadcasts in the last ${SCAN} sends matched this member.</div>`}
    ${olderLink}
  `;
  res.type("html").send(layout(req, { title: "Message history", body }));
});

adminRouter.post("/members/:id/delete", requireLeader, async (req, res) => {
  const target = await prisma.member.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { firstName: true, lastName: true },
  });
  await prisma.member.deleteMany({ where: { id: req.params.id, orgId: req.org.id } });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Member",
    entityId: req.params.id,
    action: "delete",
    summary: target ? `Deleted ${target.firstName} ${target.lastName}` : "Deleted member",
  });
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
  // Saved subgroups carry a leading "subgroup:" prefix so they don't
  // collide with the static AUDIENCES values.
  if (typeof kind === "string" && kind.startsWith("subgroup:")) {
    const id = kind.slice("subgroup:".length);
    const sg = await prisma.subgroup.findFirst({ where: { id, orgId } });
    if (!sg) return [];
    return loadSubgroupAudience(orgId, sg);
  }
  const where = { orgId };
  if (kind === "adults") where.isYouth = false;
  else if (kind === "youth") where.isYouth = true;
  else if (kind === "patrol" && patrol) where.patrol = patrol;
  return prisma.member.findMany({ where });
}

// Filter the audience down to actually contactable members. Unsubscribed
// recipients are dropped from the email channel even if their
// commPreference still says "email".
function emailableMembers(members) {
  return members.filter(
    (m) =>
      m.email &&
      !m.emailUnsubscribed &&
      (m.commPreference === "email" || m.commPreference === "both"),
  );
}

adminRouter.get("/email", requireLeader, async (req, res) => {
  const [patrols, subgroups] = await Promise.all([
    prisma.member.findMany({
      where: { orgId: req.org.id, patrol: { not: null } },
      distinct: ["patrol"],
      select: { patrol: true },
      orderBy: { patrol: "asc" },
    }),
    prisma.subgroup.findMany({ where: { orgId: req.org.id }, orderBy: { name: "asc" } }),
  ]);
  const patrolOptions = patrols
    .map((p) => `<option value="${escape(p.patrol)}">${escape(p.patrol)}</option>`)
    .join("");
  const subgroupOptions = subgroups
    .map(
      (g) => `<option value="subgroup:${escape(g.id)}">${escape(g.name)} — ${escape(describeSubgroup(g))}</option>`,
    )
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
            ${
              subgroups.length
                ? `<optgroup label="Saved subgroups">${subgroupOptions}</optgroup>`
                : ""
            }
          </select>
        </label>
        <label style="margin:0;flex:1">Patrol (if "Specific patrol")
          <select name="patrol">
            <option value="">—</option>
            ${patrolOptions}
          </select>
        </label>
      </div>
      <p class="muted small" style="margin:.6rem 0 1rem">Build new audiences in <a href="/admin/subgroups">Subgroups</a>.</p>
      <label>Subject<input id="bcast-subject" name="subject" type="text" required maxlength="200">
        <span class="muted small" id="bcast-subject-count" style="display:block;margin-top:.2rem">0 / 200 characters</span>
      </label>
      <label>Body
        <textarea id="bcast-body" name="body" rows="8" required placeholder="What you want to tell them. Plain text — paragraphs are preserved."></textarea>
        <span class="muted small" id="bcast-body-count" style="display:block;margin-top:.2rem">0 characters</span>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit" name="action" value="preview">Preview audience</button>
        <button class="btn btn-primary" type="submit" name="action" value="send">Send now</button>
        <a class="btn btn-ghost" href="/admin/email/sent" style="margin-left:auto">History →</a>
      </div>
    </form>
    <script>
      // Live character counters. SMS segments follow the GSM-7 (160ch
      // single, 153ch concat) and UCS-2 (70 / 67) rules. Detect Unicode
      // by scanning for any code point outside the GSM-7 basic alphabet
      // and Latin-1 punctuation that maps to it.
      (function () {
        const subject = document.getElementById("bcast-subject");
        const subjectCount = document.getElementById("bcast-subject-count");
        const body = document.getElementById("bcast-body");
        const bodyCount = document.getElementById("bcast-body-count");
        if (!subject || !body) return;

        function isGsm7(text) {
          // GSM-7 basic + extension covers ASCII-printable + a few
          // accented Latin characters. Anything outside (emoji,
          // non-Latin scripts, en/em-dash) flips the message to UCS-2.
          // A simple charcode-range guard is good enough for the
          // composer hint.
          for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            if (c > 127) return false;
          }
          return true;
        }

        function smsSegments(text) {
          if (!text.length) return 0;
          const len = text.length;
          if (isGsm7(text)) {
            return len <= 160 ? 1 : Math.ceil(len / 153);
          }
          return len <= 70 ? 1 : Math.ceil(len / 67);
        }

        function update() {
          subjectCount.textContent = subject.value.length + " / 200 characters";
          const len = body.value.length;
          const segs = smsSegments(body.value);
          let label = len + " character" + (len === 1 ? "" : "s");
          if (len > 0) {
            label += " · " + segs + " SMS segment" + (segs === 1 ? "" : "s");
            if (segs > 1) {
              label += " (carriers bill per segment for SMS audiences; email-only audiences ignore this)";
            }
          }
          bodyCount.textContent = label;
        }

        subject.addEventListener("input", update);
        body.addEventListener("input", update);
        update();
      })();
    </script>
  `;
  res.type("html").send(layout(req, { title: "Email broadcast", body }));
});

adminRouter.post("/email", requireLeader, async (req, res) => {
  const { audience, patrol, subject, body, action } = req.body || {};
  const orgId = req.org.id;

  const all = await audienceFor(orgId, audience, patrol);

  // Split into email + sms recipients per member's commPreference.
  // Unsubscribed members are filtered out of the email channel.
  const emailRecipients = emailableMembers(all);
  const smsRecipients = all.filter(
    (m) =>
      m.smsOptIn &&
      (m.commPreference === "sms" || m.commPreference === "both") &&
      normalisePhone(m.phone)
  );

  if (action === "preview") {
    const list = all
      .map(
        (m) =>
          `<li>${escape(m.firstName)} ${escape(m.lastName)}${m.patrol ? ` <span class="tag">${escape(m.patrol)}</span>` : ""} <span class="muted small">${escape(m.email || "(no email)")} · pref:${escape(m.commPreference)}${m.smsOptIn ? " · sms✓" : ""}</span></li>`
      )
      .join("");
    const skipped = all.length - new Set([...emailRecipients, ...smsRecipients]).size;
    const previewBody = `
      <h1>Audience preview</h1>
      <p class="muted">${all.length} member${all.length === 1 ? "" : "s"} match this audience.</p>
      <p>Email: <strong>${emailRecipients.length}</strong> · SMS: <strong>${smsRecipients.length}</strong> · No-contact: <strong>${skipped}</strong></p>
      <p class="muted small">SMS driver: <code>${escape(smsDriver)}</code></p>
      <ul class="items">${list || `<li class="empty">Nobody matches this audience.</li>`}</ul>
      <p style="margin-top:1.25rem"><a class="btn btn-ghost" href="/admin/email">← Back to compose</a></p>
    `;
    return res
      .type("html")
      .send(layout(req, { title: "Audience preview", body: previewBody }));
  }

  if (!subject?.trim() || !body?.trim()) return res.redirect("/admin/email");

  const cleanBody = body.trim();
  // Pre-allocate the MailLog id so the tracking pixel + click tokens
  // we stamp into the outgoing messages can reference the same row
  // we'll insert after the send completes.
  const mailLogId = newMailLogId();
  const baseUrl = trackingBaseUrl(req);
  // "via" pattern: leader's display name in the visible From, our
  // verified domain in the addr-spec so DKIM/SPF still passes. Replies
  // route to the leader directly via Reply-To.
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const fromAddr = `noreply@${req.org.slug}.${apex}`;
  const fromName = `${req.user.displayName.replace(/[<>"]/g, "")} (via ${req.org.displayName.replace(/[<>"]/g, "")})`;
  const orgHost = `${req.org.slug}.${apex}`;
  const messages = emailRecipients.map((m) => {
    const token = makeUnsubToken({ memberId: m.id, orgId: req.org.id });
    const unsubUrl = `https://${orgHost}/unsubscribe/${token}`;
    const footer = `\n\n—\nYou're receiving this because you're a member of ${req.org.displayName}.\nUnsubscribe: ${unsubUrl}`;
    // RFC 8058: List-Unsubscribe + List-Unsubscribe-Post lets Gmail/Apple
    // Mail surface a one-click unsubscribe button without confirming.
    const headers = {
      "List-Unsubscribe": `<${unsubUrl}?one_click=1>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    return trackEmail({
      baseUrl,
      mailLogId,
      recipient: m.email,
      to: m.email,
      subject: subject.trim(),
      text: cleanBody + footer,
      from: `${fromName} <${fromAddr}>`,
      replyTo: req.user.email,
      headers,
    });
  });

  const smsMessages = smsRecipients.map((m) => ({
    to: m.phone,
    body: trackSmsBody({
      baseUrl,
      mailLogId,
      recipient: m.phone,
      body: `${req.user.displayName}: ${subject.trim()}\n${cleanBody.slice(0, 1000)}`,
    }),
  }));

  const [emailResult, smsResult] = await Promise.all([
    messages.length ? sendBatch(messages) : Promise.resolve({ sent: 0, errors: [] }),
    smsMessages.length ? sendSmsBatch(smsMessages) : Promise.resolve({ sent: 0, errors: [] }),
  ]);

  const totalSent = emailResult.sent + smsResult.sent;
  const allErrors = [
    ...emailResult.errors.map((e) => ({ ...e, channel: "email" })),
    ...smsResult.errors.map((e) => ({ ...e, channel: "sms" })),
  ];

  let audienceLabel;
  if (audience === "patrol") {
    audienceLabel = `Patrol: ${patrol || "—"}`;
  } else if (typeof audience === "string" && audience.startsWith("subgroup:")) {
    const sg = await prisma.subgroup.findFirst({
      where: { id: audience.slice("subgroup:".length), orgId },
      select: { name: true },
    });
    audienceLabel = sg ? `Subgroup: ${sg.name}` : "Subgroup";
  } else {
    audienceLabel = AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone";
  }

  await prisma.mailLog.create({
    data: {
      id: mailLogId,
      orgId,
      authorId: req.user.id,
      subject: subject.trim(),
      body: cleanBody,
      channel: smsRecipients.length ? (emailRecipients.length ? "both" : "sms") : "email",
      audienceLabel,
      recipientCount: totalSent,
      status: allErrors.length === 0 ? "sent" : totalSent > 0 ? "partial" : "failed",
      errors: allErrors.length ? JSON.stringify(allErrors) : null,
      recipients: [
        ...emailRecipients.map((m) => ({ name: `${m.firstName} ${m.lastName}`, email: m.email, channel: "email" })),
        ...smsRecipients.map((m) => ({ name: `${m.firstName} ${m.lastName}`, phone: m.phone, channel: "sms" })),
      ],
    },
  });

  const ack = `
    <h1>Sent</h1>
    <p>Email: <strong>${emailResult.sent}</strong> · SMS: <strong>${smsResult.sent}</strong>${
    allErrors.length ? ` · failed: ${allErrors.length}` : ""
  }</p>
    ${
      allErrors.length
        ? `<details class="card"><summary>Errors</summary><pre>${escape(JSON.stringify(allErrors, null, 2))}</pre></details>`
        : ""
    }
    <p style="margin-top:1.25rem">
      <a class="btn btn-primary" href="/admin/email">Send another</a>
      <a class="btn btn-ghost" href="/admin/email/sent">View history</a>
    </p>
  `;
  res.type("html").send(layout(req, { title: "Sent", body: ack }));
});

adminRouter.get("/email/sent", requireLeader, async (req, res) => {
  const log = await prisma.mailLog.findMany({
    where: { orgId: req.org.id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  // Roll up open / click counts in one query so we don't N+1 the list.
  // groupBy returns one row per (mailLogId, kind); fold into a map.
  const counts = log.length
    ? await prisma.mailEvent.groupBy({
        by: ["mailLogId", "kind"],
        where: { mailLogId: { in: log.map((m) => m.id) } },
        _count: { _all: true },
      })
    : [];
  const byId = new Map();
  for (const row of counts) {
    if (!byId.has(row.mailLogId)) byId.set(row.mailLogId, { open: 0, click: 0 });
    byId.get(row.mailLogId)[row.kind] = row._count._all;
  }
  // For unique-recipient counts (one parent opening 5 times = 1 viewer)
  // we'd run a separate distinct query — skipped for the list view to
  // keep the page fast; the detail page surfaces unique recipients.

  const items = log
    .map((m) => {
      const c = byId.get(m.id) || { open: 0, click: 0 };
      const total = m.recipientCount || 0;
      const openRate = total ? Math.round((c.open / total) * 100) : 0;
      return `
    <li>
      <div style="flex:1">
        <h3><a href="/admin/email/sent/${escape(m.id)}" style="color:inherit;text-decoration:none">${escape(m.subject)}</a></h3>
        <p>
          <span class="tag">${escape(m.audienceLabel)}</span>
          <span class="tag">${escape(m.channel)}</span>
          <span class="tag">${escape(m.status)}</span>
          <span class="muted small">${escape(m.sentAt.toLocaleString("en-US"))}</span>
        </p>
      </div>
      <div class="row" style="gap:1.1rem;flex-wrap:nowrap;align-items:center">
        <div style="text-align:right;min-width:5rem"><strong>${total}</strong><br><span class="muted small">sent</span></div>
        <div style="text-align:right;min-width:5rem" title="Pixel opens. Inflated by Apple Mail Privacy Protection / Gmail image proxy.">
          <strong>${c.open}</strong>${total ? ` <span class="muted small">(${openRate}%)</span>` : ""}<br>
          <span class="muted small">views</span>
        </div>
        <div style="text-align:right;min-width:5rem" title="Click-throughs on tracked links — the most reliable signal.">
          <strong>${c.click}</strong><br><span class="muted small">clicks</span>
        </div>
        <a class="btn btn-ghost small" href="/admin/email/sent/${escape(m.id)}">Details</a>
      </div>
    </li>`;
    })
    .join("");

  const body = `
    <h1>Email history</h1>
    <p class="muted">Last 50 broadcasts. <span class="muted small">Open rates from the tracking pixel are noisy — Apple Mail and Gmail pre-load images, so opens read high. Clicks are the reliable signal.</span></p>
    ${log.length ? `<ul class="items">${items}</ul>` : `<div class="empty">Nothing has been sent yet.</div>`}
    <p style="margin-top:1.25rem"><a class="btn btn-ghost" href="/admin/email">← Compose</a></p>
  `;
  res.type("html").send(layout(req, { title: "Email history", body }));
});

// Per-message detail: who got it, who opened (unique recipients),
// who clicked, and which URLs got the most clicks.
adminRouter.get("/email/sent/:id", requireLeader, async (req, res) => {
  const log = await prisma.mailLog.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!log) return res.status(404).send("Not found");

  const events = await prisma.mailEvent.findMany({
    where: { mailLogId: log.id },
    orderBy: { createdAt: "asc" },
  });

  const opens = events.filter((e) => e.kind === "open");
  const clicks = events.filter((e) => e.kind === "click");
  const uniqueOpeners = new Set(opens.map((e) => e.recipient));
  const uniqueClickers = new Set(clicks.map((e) => e.recipient));

  // Per-URL click rollup
  const urlMap = new Map();
  for (const c of clicks) {
    const key = c.url || "(unknown)";
    urlMap.set(key, (urlMap.get(key) || 0) + 1);
  }
  const urlRows = [...urlMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(
      ([url, count]) => `
        <li>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            <a href="${escape(url)}" target="_blank" rel="noopener" style="color:var(--ink-900)">${escape(url)}</a>
          </span>
          <span style="text-align:right;min-width:3rem"><strong>${count}</strong></span>
        </li>`,
    )
    .join("");

  // Per-recipient rollup (one row per recipient with their open + click count)
  const recipients = Array.isArray(log.recipients) ? log.recipients : [];
  const perRecipient = recipients
    .map((r) => {
      const key = (r.email || r.phone || "").toLowerCase();
      const o = opens.filter((e) => e.recipient === key).length;
      const cl = clicks.filter((e) => e.recipient === key).length;
      return { name: r.name, address: r.email || r.phone || "", channel: r.channel, opens: o, clicks: cl };
    })
    .sort((a, b) => b.clicks - a.clicks || b.opens - a.opens);
  const recipientRows = perRecipient
    .map(
      (r) => `
        <li>
          <div style="flex:1">
            <strong>${escape(r.name)}</strong>
            <span class="muted small"> · ${escape(r.address)}${r.channel ? ` · ${escape(r.channel)}` : ""}</span>
          </div>
          <div class="row" style="gap:1.1rem;flex-wrap:nowrap">
            <div style="min-width:3.5rem;text-align:right" title="Pixel opens. Apple Mail / Gmail proxies inflate this."><strong>${r.opens}</strong> <span class="muted small">v</span></div>
            <div style="min-width:3.5rem;text-align:right"><strong>${r.clicks}</strong> <span class="muted small">c</span></div>
          </div>
        </li>`,
    )
    .join("");

  const body = `
    <a class="back" href="/admin/email/sent" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Email history</a>
    <h1>${escape(log.subject)}</h1>
    <p class="muted">
      <span class="tag">${escape(log.audienceLabel)}</span>
      <span class="tag">${escape(log.channel)}</span>
      <span class="tag">${escape(log.status)}</span>
      <span class="muted small">· Sent ${escape(log.sentAt.toLocaleString("en-US"))}</span>
    </p>

    <div class="card" style="display:flex;gap:2rem;align-items:center;margin-top:1rem;flex-wrap:wrap">
      <div><strong style="font-size:1.5rem">${log.recipientCount}</strong> <span class="muted">sent</span></div>
      <div title="Unique recipients whose mail client loaded the pixel.">
        <strong style="font-size:1.5rem">${uniqueOpeners.size}</strong>
        <span class="muted">unique views</span>
        <span class="muted small">(${opens.length} total)</span>
      </div>
      <div title="Unique recipients who clicked any tracked link.">
        <strong style="font-size:1.5rem">${uniqueClickers.size}</strong>
        <span class="muted">unique clickers</span>
        <span class="muted small">(${clicks.length} clicks)</span>
      </div>
    </div>

    <p class="muted small" style="margin:.6rem 0 1.25rem">View counts from the tracking pixel are noisy — Apple Mail Privacy Protection and Gmail image proxies pre-load the pixel whether or not the recipient really saw the email. <strong>Click counts are the reliable engagement signal.</strong></p>

    <h2 style="margin-top:1.25rem">Top clicked links</h2>
    ${urlRows ? `<ul class="items">${urlRows}</ul>` : `<div class="empty">No clicks yet.</div>`}

    <h2 style="margin-top:1.5rem">Recipients</h2>
    ${recipientRows ? `<ul class="items">${recipientRows}</ul>` : `<div class="empty">No recipient snapshot.</div>`}
  `;
  res.type("html").send(layout(req, { title: log.subject, body }));
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
      <label>Body<textarea name="body" rows="4" required placeholder="What happened? Markdown supported."></textarea></label>
      <p class="muted small" style="margin-top:-.4rem">${MARKDOWN_HINT}</p>
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
  res.type("html").send(layout(req, { title: "Activity feed", body }));
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
    <a class="back" href="/admin/posts" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Activity feed</a>
    <h1>Edit post</h1>
    <form class="card" method="post" action="/admin/posts/${escape(post.id)}" enctype="multipart/form-data">
      <label>Headline<input name="title" type="text" maxlength="120" value="${v("title")}"></label>
      <label>Body<textarea name="body" rows="6" required>${v("body")}</textarea></label>
      <p class="muted small" style="margin-top:-.4rem">${MARKDOWN_HINT}</p>
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
  res.type("html").send(layout(req, { title: "Edit post", body }));
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
/* Custom pages                                                        */
/* ------------------------------------------------------------------ */

function slugifyPath(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "page";
}

const RESERVED_PATH_SLUGS = new Set([
  "events", "posts", "members", "forms", "calendar", "calendar.ics",
  "uploads", "rsvp", "admin", "api", "login", "logout", "signup",
  "magic", "verify", "reset", "forgot",
]);

adminRouter.get("/pages", requireLeader, async (req, res) => {
  const pages = await prisma.customPage.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  const items = pages
    .map(
      (p) => `
    <li>
      <div style="flex:1">
        <h3>${escape(p.title)}</h3>
        <p class="muted small">
          <a href="/p/${escape(p.slug)}" target="_blank" rel="noopener">/p/${escape(p.slug)}</a>
          <span class="tag">${escape(p.visibility)}</span>
          ${p.showInNav ? `<span class="tag">in nav</span>` : ""}
        </p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/pages/${escape(p.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/pages/${escape(p.id)}/delete" onsubmit="return confirm('Delete this page?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`
    )
    .join("");

  const body = `
    <h1>Custom pages</h1>
    <p class="muted">Add extra pages beyond the home page — History, Eagle list, FAQ, anything. They live at <code>/p/&lt;slug&gt;</code>.</p>

    <form class="card" method="post" action="/admin/pages">
      <h2 style="margin-top:0">New page</h2>
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. Our History"></label>
      <label>URL slug (optional — derived from title if blank)
        <input name="slug" type="text" maxlength="60" pattern="[a-z0-9-]+" placeholder="our-history">
      </label>
      <label>Body
        <textarea name="body" rows="8" required></textarea>
      </label>
      <p class="muted small" style="margin-top:-.4rem">${MARKDOWN_HINT}</p>
      <div class="row">
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="public" selected>Public</option>
            <option value="members">Members only</option>
          </select>
        </label>
        <label style="margin:0"><input name="showInNav" type="checkbox" value="1" checked style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Show in main nav</label>
      </div>
      <button class="btn btn-primary" type="submit">Create</button>
    </form>

    <h2 style="margin-top:1.25rem">Pages</h2>
    ${pages.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No custom pages yet.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Custom pages", body }));
});

async function pickUniqueSlug(orgId, base, excludeId) {
  let slug = slugifyPath(base);
  if (RESERVED_PATH_SLUGS.has(slug)) slug = `${slug}-page`;
  let n = 1;
  while (true) {
    const existing = await prisma.customPage.findUnique({
      where: { orgId_slug: { orgId, slug } },
    });
    if (!existing || existing.id === excludeId) return slug;
    n++;
    slug = `${slugifyPath(base)}-${n}`;
  }
}

adminRouter.post("/pages", requireLeader, async (req, res) => {
  const title = req.body?.title?.trim();
  if (!title) return res.redirect("/admin/pages");
  const slug = await pickUniqueSlug(req.org.id, req.body?.slug?.trim() || title);
  await prisma.customPage.create({
    data: {
      orgId: req.org.id,
      slug,
      title,
      body: (req.body?.body || "").toString().trim() || "",
      visibility: req.body?.visibility === "members" ? "members" : "public",
      showInNav: req.body?.showInNav === "1",
    },
  });
  res.redirect("/admin/pages");
});

adminRouter.get("/pages/:id/edit", requireLeader, async (req, res) => {
  const p = await prisma.customPage.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!p) return res.status(404).send("Not found");
  const v = (k) => escape(p[k] ?? "");
  const sel = (cond) => (cond ? " selected" : "");
  const body = `
    <a class="back" href="/admin/pages" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Custom pages</a>
    <h1>Edit page</h1>
    <form class="card" method="post" action="/admin/pages/${escape(p.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${v("title")}"></label>
      <label>URL slug<input name="slug" type="text" maxlength="60" pattern="[a-z0-9-]+" value="${v("slug")}"></label>
      <p class="muted small" style="margin:-.5rem 0 .5rem">Public URL: <code>/p/${v("slug")}</code></p>
      <label>Body<textarea name="body" rows="12" required>${v("body")}</textarea></label>
      <p class="muted small" style="margin-top:-.4rem">${MARKDOWN_HINT}</p>
      <div class="row">
        <label style="margin:0;flex:1">Visibility
          <select name="visibility">
            <option value="public"${sel(p.visibility === "public")}>Public</option>
            <option value="members"${sel(p.visibility === "members")}>Members only</option>
          </select>
        </label>
        <label style="margin:0"><input name="showInNav" type="checkbox" value="1"${
          p.showInNav ? " checked" : ""
        } style="width:auto;display:inline;margin-top:0;margin-right:.4rem">Show in main nav</label>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/pages">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit page", body }));
});

adminRouter.post("/pages/:id", requireLeader, async (req, res) => {
  const p = await prisma.customPage.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!p) return res.status(404).send("Not found");
  const title = req.body?.title?.trim() || p.title;
  const slugInput = req.body?.slug?.trim() || p.slug;
  const slug = slugInput === p.slug ? p.slug : await pickUniqueSlug(req.org.id, slugInput, p.id);
  await prisma.customPage.update({
    where: { id: p.id },
    data: {
      title,
      slug,
      body: (req.body?.body || "").toString().trim() || "",
      visibility: req.body?.visibility === "members" ? "members" : "public",
      showInNav: req.body?.showInNav === "1",
    },
  });
  res.redirect("/admin/pages");
});

adminRouter.post("/pages/:id/delete", requireLeader, async (req, res) => {
  await prisma.customPage.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/pages");
});

/* ------------------------------------------------------------------ */
/* Equipment / trailer inventory                                       */
/* ------------------------------------------------------------------ */

const EQUIP_CATEGORIES = [
  "Trailer",
  "Patrol box",
  "Cooking",
  "Shelter",
  "Tools",
  "First aid",
  "Lanterns / lights",
  "Other",
];
const EQUIP_CONDITIONS = ["good", "fair", "needs-repair", "retired"];

adminRouter.get("/equipment", requireLeader, async (req, res) => {
  const items = await prisma.equipment.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const byCat = {};
  for (const it of items) {
    const c = it.category || "Other";
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(it);
  }
  const conditionTag = (c) =>
    c === "needs-repair"
      ? `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">needs repair</span>`
      : c === "retired"
      ? `<span class="tag" style="opacity:.6">retired</span>`
      : c === "fair"
      ? `<span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">fair</span>`
      : "";

  const renderRow = (it) => {
    return `
    <li>
      <div style="flex:1">
        <h3>${escape(it.name)}${
      it.quantity > 1 ? ` <span class="tag">×${it.quantity}</span>` : ""
    } ${conditionTag(it.condition)}</h3>
        <p class="muted small">
          ${it.location ? `<span class="tag">${escape(it.location)}</span>` : ""}
          ${it.serialOrTag ? `<span class="tag">${escape(it.serialOrTag)}</span>` : ""}
          ${it.notes ? escape(it.notes) : ""}
        </p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/equipment/${escape(it.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/equipment/${escape(it.id)}/delete" onsubmit="return confirm('Delete this item from the catalog?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`;
  };

  const groups = Object.keys(byCat)
    .sort()
    .map(
      (cat) => `
        <h2 style="margin-top:1.5rem">${escape(cat)} <span class="muted small" style="font-weight:400">(${byCat[cat].length})</span></h2>
        <ul class="items">${byCat[cat].map(renderRow).join("")}</ul>`
    )
    .join("");

  const catOpts = EQUIP_CATEGORIES.map(
    (c) => `<option value="${escape(c)}">${escape(c)}</option>`
  ).join("");

  const body = `
    <h1>Equipment</h1>
    <p class="muted">Permanent troop inventory — what's in the trailer, what needs repair. Distinct from the per-trip packing list on each Trip plan.</p>

    <form class="card" method="post" action="/admin/equipment">
      <h2 style="margin-top:0">Add an item</h2>
      <label>Name<input name="name" type="text" required maxlength="120" placeholder="e.g. Patrol box #1, Coleman 2-burner stove"></label>
      <div class="row">
        <label style="margin:0;flex:1">Category<select name="category"><option value="">— pick —</option>${catOpts}</select></label>
        <label style="margin:0;flex:1">Condition
          <select name="condition">
            ${EQUIP_CONDITIONS.map(
              (c) => `<option value="${escape(c)}"${c === "good" ? " selected" : ""}>${escape(c)}</option>`
            ).join("")}
          </select>
        </label>
        <label style="margin:0;flex:1">Quantity<input name="quantity" type="number" min="1" max="999" value="1"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Location<input name="location" type="text" maxlength="80" placeholder="Trailer / Closet / Loaned: Smith family"></label>
        <label style="margin:0;flex:1">Serial / asset tag<input name="serialOrTag" type="text" maxlength="40"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
      <button class="btn btn-primary" type="submit">Add</button>
    </form>

    ${items.length ? groups : `<div class="empty" style="margin-top:1rem">Nothing in the catalog yet. Add your first item above — start with the trailer itself.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Equipment", body }));
});

function equipmentFromBody(body) {
  return {
    name: body?.name?.trim() || "Untitled",
    category: body?.category?.trim() || null,
    serialOrTag: body?.serialOrTag?.trim() || null,
    location: body?.location?.trim() || null,
    condition: EQUIP_CONDITIONS.includes(body?.condition) ? body.condition : "good",
    quantity: Math.max(1, Math.min(999, parseInt(body?.quantity, 10) || 1)),
    notes: body?.notes?.trim() || null,
  };
}

adminRouter.post("/equipment", requireLeader, async (req, res) => {
  await prisma.equipment.create({ data: { orgId: req.org.id, ...equipmentFromBody(req.body) } });
  res.redirect("/admin/equipment");
});

adminRouter.get("/equipment/:id/edit", requireLeader, async (req, res) => {
  const it = await prisma.equipment.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!it) return res.status(404).send("Not found");
  const v = (k) => escape(it[k] ?? "");
  const sel = (cond) => (cond ? " selected" : "");
  const catOpts = EQUIP_CATEGORIES.map(
    (c) => `<option value="${escape(c)}"${sel(it.category === c)}>${escape(c)}</option>`
  ).join("");
  const condOpts = EQUIP_CONDITIONS.map(
    (c) => `<option value="${escape(c)}"${sel(it.condition === c)}>${escape(c)}</option>`
  ).join("");

  const body = `
    <a class="back" href="/admin/equipment" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Equipment</a>
    <h1>Edit equipment</h1>
    <form class="card" method="post" action="/admin/equipment/${escape(it.id)}">
      <label>Name<input name="name" type="text" required maxlength="120" value="${v("name")}"></label>
      <div class="row">
        <label style="margin:0;flex:1">Category<select name="category"><option value="">—</option>${catOpts}</select></label>
        <label style="margin:0;flex:1">Condition<select name="condition">${condOpts}</select></label>
        <label style="margin:0;flex:1">Quantity<input name="quantity" type="number" min="1" max="999" value="${v("quantity")}"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Location<input name="location" type="text" maxlength="80" value="${v("location")}"></label>
        <label style="margin:0;flex:1">Serial / tag<input name="serialOrTag" type="text" maxlength="40" value="${v("serialOrTag")}"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2">${v("notes")}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/equipment">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit equipment", body }));
});

adminRouter.post("/equipment/:id", requireLeader, async (req, res) => {
  const it = await prisma.equipment.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!it) return res.status(404).send("Not found");
  await prisma.equipment.update({ where: { id: it.id }, data: equipmentFromBody(req.body) });
  res.redirect("/admin/equipment");
});

adminRouter.post("/equipment/:id/delete", requireLeader, async (req, res) => {
  await prisma.equipment.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/equipment");
});

/* ------------------------------------------------------------------ */
/* Order of the Arrow elections                                         */
/* ------------------------------------------------------------------ */

const OA_STATUSES = ["planned", "conducted", "submitted"];
const OA_CAND_STATUSES = ["eligible", "elected", "not-elected", "declined"];

adminRouter.get("/oa", requireLeader, async (req, res) => {
  const elections = await prisma.oaElection.findMany({
    where: { orgId: req.org.id },
    orderBy: { electionDate: "desc" },
    include: { candidates: { select: { status: true } } },
  });

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const items = elections
    .map((e) => {
      const elected = e.candidates.filter((c) => c.status === "elected").length;
      return `
      <li>
        <div style="flex:1">
          <h3 style="margin:0">${escape(fmtDate(e.electionDate))}${e.lodgeName ? ` · ${escape(e.lodgeName)}${e.lodgeNumber ? ` (${escape(e.lodgeNumber)})` : ""}` : ""}</h3>
          <p class="muted small" style="margin:.1rem 0 0">
            <span class="tag">${escape(e.status)}</span>
            ${e.candidates.length} candidate${e.candidates.length === 1 ? "" : "s"} · ${elected} elected
            ${e.oaTeamContact ? ` · OA contact: ${escape(e.oaTeamContact)}` : ""}
          </p>
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/oa/${escape(e.id)}/edit">Manage</a>
          <form class="inline" method="post" action="/admin/oa/${escape(e.id)}/delete" onsubmit="return confirm('Delete this election and all candidate records?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`;
    })
    .join("");

  const body = `
    <h1>OA elections</h1>
    <p class="muted">Schedule the unit's annual Order of the Arrow election, track the candidate slate, and record results to send to your lodge.</p>

    <form class="card" method="post" action="/admin/oa">
      <h2 style="margin-top:0">Schedule a new election</h2>
      <div class="row">
        <label style="margin:0;flex:1">Election date<input name="electionDate" type="date" required></label>
        <label style="margin:0;flex:1">Lodge name<input name="lodgeName" type="text" maxlength="80" placeholder="e.g. Naguonabe"></label>
        <label style="margin:0;flex:1">Lodge #<input name="lodgeNumber" type="text" maxlength="20" placeholder="e.g. 105"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">OA team contact<input name="oaTeamContact" type="text" maxlength="80"></label>
        <label style="margin:0;flex:1">Contact email<input name="oaTeamContactEmail" type="email" maxlength="120"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="500"></textarea></label>
      <button class="btn btn-primary" type="submit">Schedule</button>
    </form>

    <h2 style="margin-top:1.5rem">Past + upcoming</h2>
    ${elections.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No elections scheduled yet.</div>`}
  `;
  res.type("html").send(layout(req, { title: "OA elections", body }));
});

function oaElectionFromBody(body) {
  const status = OA_STATUSES.includes(body?.status) ? body.status : "planned";
  const electionDate = body?.electionDate ? new Date(body.electionDate) : null;
  const votingMembers = parseInt(body?.votingMembersCount, 10);
  const threshold = parseInt(body?.votingThreshold, 10);
  return {
    electionDate: electionDate && !isNaN(electionDate) ? electionDate : new Date(),
    lodgeName: (body?.lodgeName || "").trim() || null,
    lodgeNumber: (body?.lodgeNumber || "").trim() || null,
    oaTeamContact: (body?.oaTeamContact || "").trim() || null,
    oaTeamContactEmail: (body?.oaTeamContactEmail || "").trim().toLowerCase() || null,
    votingMembersCount: Number.isFinite(votingMembers) && votingMembers > 0 ? votingMembers : null,
    votingThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
    status,
    notes: (body?.notes || "").trim() || null,
  };
}

adminRouter.post("/oa", requireLeader, async (req, res) => {
  const data = oaElectionFromBody(req.body);
  const created = await prisma.oaElection.create({
    data: { orgId: req.org.id, ...data },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "OaElection",
    entityId: created.id,
    action: "create",
    summary: `Scheduled OA election for ${created.electionDate.toISOString().slice(0, 10)}`,
  });
  res.redirect(`/admin/oa/${created.id}/edit`);
});

adminRouter.get("/oa/:id/edit", requireLeader, async (req, res) => {
  const [e, eligibleMembers] = await Promise.all([
    prisma.oaElection.findFirst({
      where: { id: req.params.id, orgId: req.org.id },
      include: { candidates: { orderBy: { candidateName: "asc" } } },
    }),
    prisma.member.findMany({
      where: { orgId: req.org.id, isYouth: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  if (!e) return res.status(404).send("Not found");

  const v = (k) => escape(e[k] ?? "");
  const dateVal = e.electionDate ? new Date(e.electionDate).toISOString().slice(0, 10) : "";
  const sel = (cond) => (cond ? " selected" : "");

  const memberOpts = eligibleMembers
    .map(
      (m) =>
        `<option value="${escape(m.id)}">${escape(m.firstName)} ${escape(m.lastName)}</option>`,
    )
    .join("");

  const candRows = e.candidates
    .map((c) => {
      const statusOpts = OA_CAND_STATUSES.map(
        (s) => `<option value="${escape(s)}"${sel(c.status === s)}>${escape(s)}</option>`,
      ).join("");
      const tag =
        c.status === "elected"
          ? `<span class="tag" style="background:#eaf6ec;border-color:#b9dec1;color:#15532b">elected</span>`
          : c.status === "not-elected"
          ? `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">not elected</span>`
          : c.status === "declined"
          ? `<span class="tag" style="opacity:.6">declined</span>`
          : `<span class="tag">eligible</span>`;
      return `
        <li>
          <div style="flex:1">
            <strong>${escape(c.candidateName)}</strong> ${tag}
            ${c.votesFor != null ? `<span class="muted small"> · ${c.votesFor} for / ${c.votesAgainst ?? 0} against</span>` : ""}
            ${c.notes ? `<div class="muted small">${escape(c.notes)}</div>` : ""}
          </div>
          <form class="inline row" method="post" action="/admin/oa/${escape(e.id)}/candidates/${escape(c.id)}" style="gap:.4rem">
            <select name="status">${statusOpts}</select>
            <input name="votesFor" type="number" min="0" max="999" value="${c.votesFor ?? ""}" placeholder="for" style="width:5rem">
            <input name="votesAgainst" type="number" min="0" max="999" value="${c.votesAgainst ?? ""}" placeholder="against" style="width:5rem">
            <button class="btn btn-ghost small" type="submit">Save</button>
          </form>
          <form class="inline" method="post" action="/admin/oa/${escape(e.id)}/candidates/${escape(c.id)}/delete" onsubmit="return confirm('Remove this candidate?')">
            <button class="btn btn-danger small" type="submit">×</button>
          </form>
        </li>`;
    })
    .join("");

  const statusOpts = OA_STATUSES.map(
    (s) => `<option value="${escape(s)}"${sel(e.status === s)}>${escape(s)}</option>`,
  ).join("");

  const body = `
    <a class="back" href="/admin/oa" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← OA elections</a>
    <h1>Manage election · ${escape(new Date(e.electionDate).toLocaleDateString("en-US"))}</h1>

    <form class="card" method="post" action="/admin/oa/${escape(e.id)}">
      <div class="row">
        <label style="margin:0;flex:1">Election date<input name="electionDate" type="date" required value="${escape(dateVal)}"></label>
        <label style="margin:0;flex:1">Status<select name="status">${statusOpts}</select></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Lodge name<input name="lodgeName" type="text" maxlength="80" value="${v("lodgeName")}"></label>
        <label style="margin:0;flex:1">Lodge #<input name="lodgeNumber" type="text" maxlength="20" value="${v("lodgeNumber")}"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">OA team contact<input name="oaTeamContact" type="text" maxlength="80" value="${v("oaTeamContact")}"></label>
        <label style="margin:0;flex:1">Contact email<input name="oaTeamContactEmail" type="email" maxlength="120" value="${v("oaTeamContactEmail")}"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Voting members<input name="votingMembersCount" type="number" min="0" max="999" value="${v("votingMembersCount")}"></label>
        <label style="margin:0;flex:1">Threshold (votes needed)<input name="votingThreshold" type="number" min="0" max="999" value="${v("votingThreshold")}"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="500">${v("notes")}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/oa">Cancel</a>
      </div>
    </form>

    <h2 style="margin-top:1.5rem">Candidate slate ${e.candidates.length ? `<span class="muted" style="font-weight:400">(${e.candidates.length})</span>` : ""}</h2>
    ${e.candidates.length ? `<ul class="items">${candRows}</ul>` : `<div class="empty">No candidates yet. Add one below.</div>`}

    <form class="card" method="post" action="/admin/oa/${escape(e.id)}/candidates" style="margin-top:1rem">
      <h3 style="margin-top:0">Add a candidate</h3>
      <div class="row">
        <label style="margin:0;flex:1">Roster member<select name="memberId"><option value="">— pick a Scout —</option>${memberOpts}</select></label>
        <label style="margin:0;flex:1">…or free-form name<input name="candidateName" type="text" maxlength="80"></label>
      </div>
      <label>Notes<textarea name="notes" rows="2" maxlength="200" placeholder="Camping nights met, First Class+ verified, etc."></textarea></label>
      <button class="btn btn-primary" type="submit">Add candidate</button>
    </form>
  `;
  res.type("html").send(layout(req, { title: "OA election", body }));
});

adminRouter.post("/oa/:id", requireLeader, async (req, res) => {
  const e = await prisma.oaElection.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!e) return res.status(404).send("Not found");
  const data = oaElectionFromBody(req.body);
  await prisma.oaElection.update({ where: { id: e.id }, data });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "OaElection",
    entityId: e.id,
    action: "update",
    summary: `Updated election (status: ${data.status})`,
  });
  res.redirect(`/admin/oa/${e.id}/edit`);
});

adminRouter.post("/oa/:id/delete", requireLeader, async (req, res) => {
  await prisma.oaElection.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "OaElection",
    entityId: req.params.id,
    action: "delete",
    summary: "Deleted election",
  });
  res.redirect("/admin/oa");
});

adminRouter.post("/oa/:id/candidates", requireLeader, async (req, res) => {
  const election = await prisma.oaElection.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!election) return res.status(404).send("Not found");

  let memberId = (req.body?.memberId || "").trim() || null;
  let candidateName = (req.body?.candidateName || "").trim() || null;
  if (memberId) {
    const m = await prisma.member.findFirst({
      where: { id: memberId, orgId: req.org.id },
      select: { firstName: true, lastName: true },
    });
    if (m) candidateName = `${m.firstName} ${m.lastName}`;
    else memberId = null;
  }
  if (!candidateName) return res.redirect(`/admin/oa/${election.id}/edit`);

  await prisma.oaCandidate.create({
    data: {
      orgId: req.org.id,
      electionId: election.id,
      memberId,
      candidateName,
      notes: (req.body?.notes || "").trim() || null,
    },
  });
  res.redirect(`/admin/oa/${election.id}/edit`);
});

adminRouter.post("/oa/:id/candidates/:candidateId", requireLeader, async (req, res) => {
  const status = OA_CAND_STATUSES.includes(req.body?.status) ? req.body.status : "eligible";
  const votesFor = parseInt(req.body?.votesFor, 10);
  const votesAgainst = parseInt(req.body?.votesAgainst, 10);
  await prisma.oaCandidate.updateMany({
    where: {
      id: req.params.candidateId,
      orgId: req.org.id,
      electionId: req.params.id,
    },
    data: {
      status,
      votesFor: Number.isFinite(votesFor) ? votesFor : null,
      votesAgainst: Number.isFinite(votesAgainst) ? votesAgainst : null,
    },
  });
  res.redirect(`/admin/oa/${req.params.id}/edit`);
});

adminRouter.post("/oa/:id/candidates/:candidateId/delete", requireLeader, async (req, res) => {
  await prisma.oaCandidate.deleteMany({
    where: {
      id: req.params.candidateId,
      orgId: req.org.id,
      electionId: req.params.id,
    },
  });
  res.redirect(`/admin/oa/${req.params.id}/edit`);
});

/* ------------------------------------------------------------------ */
/* Treasurer report (per-event P&L)                                    */
/* ------------------------------------------------------------------ */
//
// Pulls from data we already track:
//   Income   = event.cost × yes-RSVPs
//   Expenses = sum of "paid" Reimbursement.amountCents where
//              reimbursement.eventId = event.id
//   Net      = income - expenses
//
// Per-Scout balances need a Scout-account ledger that doesn't exist
// yet — that's a separate roadmap item under Phase 9.

adminRouter.get("/treasurer", requireLeader, async (req, res) => {
  const events = await prisma.event.findMany({
    where: { orgId: req.org.id },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      cost: true,
      rsvps: { where: { response: "yes" }, select: { id: true, guests: true } },
      reimbursements: {
        where: { status: "paid" },
        select: { amountCents: true, purpose: true },
      },
    },
  });

  // Reimbursements not tied to any specific event still belong on the
  // P&L — show them as a single "general expenses" row.
  const orphanReimbs = await prisma.reimbursement.findMany({
    where: { orgId: req.org.id, status: "paid", eventId: null },
    select: { amountCents: true, purpose: true },
  });

  const fmtMoney = (cents) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let totalIncome = 0;
  let totalExpenses = 0;

  const rows = events
    .map((e) => {
      const yes = e.rsvps.length;
      const incomeCents = (e.cost || 0) * 100 * yes;
      const expenseCents = e.reimbursements.reduce((s, r) => s + r.amountCents, 0);
      const netCents = incomeCents - expenseCents;
      totalIncome += incomeCents;
      totalExpenses += expenseCents;
      if (incomeCents === 0 && expenseCents === 0) return ""; // skip empty
      return `<tr>
        <td><a href="/admin/events/${escape(e.id)}/report">${escape(e.title)}</a></td>
        <td class="muted small">${escape(fmtDate(e.startsAt))}</td>
        <td class="num">${yes}</td>
        <td class="num">${fmtMoney(incomeCents)}</td>
        <td class="num">${fmtMoney(expenseCents)}</td>
        <td class="num"><strong style="color:${netCents < 0 ? "#7d2614" : netCents > 0 ? "#15532b" : "inherit"}">${fmtMoney(netCents)}</strong></td>
      </tr>`;
    })
    .filter(Boolean)
    .join("");

  const orphanCents = orphanReimbs.reduce((s, r) => s + r.amountCents, 0);
  totalExpenses += orphanCents;

  const orphanRow = orphanCents
    ? `<tr>
        <td><em>Unattributed expenses</em></td>
        <td class="muted small">—</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num">${fmtMoney(orphanCents)}</td>
        <td class="num"><strong style="color:#7d2614">${fmtMoney(-orphanCents)}</strong></td>
      </tr>`
    : "";

  const grandNet = totalIncome - totalExpenses;
  const totalRow = `<tr style="border-top:2px solid #eef0e7">
        <td><strong>Totals</strong></td>
        <td></td>
        <td></td>
        <td class="num"><strong>${fmtMoney(totalIncome)}</strong></td>
        <td class="num"><strong>${fmtMoney(totalExpenses)}</strong></td>
        <td class="num"><strong style="color:${grandNet < 0 ? "#7d2614" : "#15532b"}">${fmtMoney(grandNet)}</strong></td>
      </tr>`;

  const body = `
    <h1>Treasurer report</h1>
    <p class="muted">Per-event P&amp;L. Income = event cost × yes-RSVPs. Expenses = paid reimbursements assigned to the event. Click a title to drill into the event report.</p>

    <div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
      <div class="card stat-card"><strong style="font-size:1.5rem">${fmtMoney(totalIncome)}</strong><br><span class="muted small">Income</span></div>
      <div class="card stat-card"><strong style="font-size:1.5rem">${fmtMoney(totalExpenses)}</strong><br><span class="muted small">Paid expenses</span></div>
      <div class="card stat-card"><strong style="font-size:1.5rem;color:${grandNet < 0 ? "#7d2614" : "#15532b"}">${fmtMoney(grandNet)}</strong><br><span class="muted small">Net</span></div>
    </div>

    ${
      rows || orphanRow
        ? `<table class="ing-table">
            <thead><tr><th>Event</th><th>Date</th><th class="num">Yes</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead>
            <tbody>${rows}${orphanRow}${totalRow}</tbody>
          </table>`
        : `<div class="empty">No events with cost or paid reimbursements yet.</div>`
    }

    <p class="muted small" style="margin-top:1.5rem">Per-Scout account balances need a Scout-account ledger — that's still on the roadmap under Phase 9 (Money).</p>

    <style>
      .stat-card{flex:1;min-width:160px;text-align:center}
    </style>
  `;
  res.type("html").send(layout(req, { title: "Treasurer", body }));
});

/* ------------------------------------------------------------------ */
/* Reimbursements (treasurer view)                                     */
/* ------------------------------------------------------------------ */

const REIMB_STATUSES = ["pending", "approved", "denied", "paid"];

adminRouter.get("/reimbursements", requireLeader, async (req, res) => {
  const filter = REIMB_STATUSES.includes(req.query.status) ? req.query.status : "";
  const where = { orgId: req.org.id };
  if (filter) where.status = filter;

  const [list, totals] = await Promise.all([
    prisma.reimbursement.findMany({
      where,
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      include: { event: { select: { title: true } } },
    }),
    prisma.reimbursement.groupBy({
      by: ["status"],
      where: { orgId: req.org.id },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);

  const fmtMoney = (cents) => `$${(cents / 100).toFixed(2)}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const totalsBy = {};
  for (const t of totals) {
    totalsBy[t.status] = { count: t._count._all, sum: t._sum.amountCents || 0 };
  }
  const stat = (s) => totalsBy[s] || { count: 0, sum: 0 };

  const statusTag = (s) => {
    if (s === "paid") return `<span class="tag" style="background:#eaf6ec;border-color:#b9dec1;color:#15532b">paid</span>`;
    if (s === "approved") return `<span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">approved</span>`;
    if (s === "denied") return `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">denied</span>`;
    return `<span class="tag">pending</span>`;
  };

  const items = list
    .map(
      (r) => `
      <li>
        <div style="flex:1">
          <strong>${escape(fmtMoney(r.amountCents))}</strong> ${statusTag(r.status)}
          <div class="muted small">${escape(r.purpose)}${r.event ? ` · ${escape(r.event.title)}` : ""}</div>
          <div class="muted small">From ${escape(r.requesterName)}${r.requesterEmail ? ` &lt;${escape(r.requesterEmail)}&gt;` : ""} · ${escape(fmtDate(r.submittedAt))}</div>
          ${r.notes ? `<div class="muted small">Note: ${escape(r.notes)}</div>` : ""}
          ${r.decidedAt ? `<div class="muted small">${escape(r.status)} ${escape(fmtDate(r.decidedAt))}${r.decidedByDisplay ? ` by ${escape(r.decidedByDisplay)}` : ""}</div>` : ""}
        </div>
        <div class="row" style="gap:.35rem">
          ${r.receiptFilename ? `<a class="btn btn-ghost small" href="/uploads/${escape(r.receiptFilename)}" target="_blank">Receipt</a>` : ""}
          ${
            r.status === "pending"
              ? `<form class="inline" method="post" action="/admin/reimbursements/${escape(r.id)}/approve">
                   <button class="btn btn-primary small" type="submit">Approve</button>
                 </form>
                 <form class="inline" method="post" action="/admin/reimbursements/${escape(r.id)}/deny">
                   <button class="btn btn-danger small" type="submit">Deny</button>
                 </form>`
              : ""
          }
          ${
            r.status !== "paid" && r.status !== "denied"
              ? `<form class="inline" method="post" action="/admin/reimbursements/${escape(r.id)}/pay">
                   <button class="btn btn-primary small" type="submit">Mark paid</button>
                 </form>`
              : ""
          }
          <form class="inline" method="post" action="/admin/reimbursements/${escape(r.id)}/delete" onsubmit="return confirm('Delete this request?')">
            <button class="btn btn-danger small" type="submit">×</button>
          </form>
        </div>
      </li>`,
    )
    .join("");

  const filterTabs = ["", "pending", "approved", "paid", "denied"]
    .map(
      (s) =>
        `<a class="btn btn-ghost small" href="/admin/reimbursements${s ? `?status=${s}` : ""}" style="${s === filter ? "background:#fbf8ee" : ""}">${s || "All"}${s && totalsBy[s] ? ` (${totalsBy[s].count})` : ""}</a>`,
    )
    .join(" ");

  const body = `
    <h1>Reimbursements</h1>
    <p class="muted">Members submit at <code>/reimburse</code>; approve, deny, and mark paid here.</p>

    <div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
      <div class="card stat-card"><strong style="font-size:1.5rem">${fmtMoney(stat("pending").sum)}</strong><br><span class="muted small">Pending (${stat("pending").count})</span></div>
      <div class="card stat-card"><strong style="font-size:1.5rem">${fmtMoney(stat("approved").sum)}</strong><br><span class="muted small">Approved (${stat("approved").count})</span></div>
      <div class="card stat-card"><strong style="font-size:1.5rem">${fmtMoney(stat("paid").sum)}</strong><br><span class="muted small">Paid (${stat("paid").count})</span></div>
      <div class="card stat-card"><strong style="font-size:1.5rem">${fmtMoney(stat("denied").sum)}</strong><br><span class="muted small">Denied (${stat("denied").count})</span></div>
    </div>

    <div class="row" style="margin-bottom:.75rem;gap:.4rem">${filterTabs}</div>

    ${list.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No requests${filter ? ` with status "${escape(filter)}"` : ""} yet.</div>`}

    <style>.stat-card{flex:1;min-width:160px;text-align:center}</style>
  `;
  res.type("html").send(layout(req, { title: "Reimbursements", body }));
});

async function decideReimbursement(req, res, status) {
  const r = await prisma.reimbursement.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, requesterName: true, amountCents: true },
  });
  if (!r) return res.status(404).send("Not found");
  await prisma.reimbursement.update({
    where: { id: r.id },
    data: {
      status,
      decidedAt: new Date(),
      decidedByUserId: req.user.id,
      decidedByDisplay: req.user.displayName,
    },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Reimbursement",
    entityId: r.id,
    action: "update",
    summary: `${status === "paid" ? "Paid" : status === "approved" ? "Approved" : "Denied"} ${r.requesterName} · $${(r.amountCents / 100).toFixed(2)}`,
  });
  if (status === "approved" || status === "paid") {
    track(EVENTS.REIMBURSEMENT_APPROVED, {
      orgId: req.org.id,
      userId: req.user.id,
      dimensions: { status, amountCents: r.amountCents },
    });
  }
  res.redirect("/admin/reimbursements");
}

// Reimbursement writes need a money-shaped position (Treasurer, Cookie
// Manager, Purser) or COMMITTEE_CHAIR. Reads stay open to all leaders.
const requireMoneyScope = requireScope(prisma, SCOPES.TREASURER, SCOPES.COMMITTEE_CHAIR);

adminRouter.post(
  "/reimbursements/:id/approve",
  requireLeader,
  requireMoneyScope,
  (req, res) => decideReimbursement(req, res, "approved"),
);
adminRouter.post(
  "/reimbursements/:id/deny",
  requireLeader,
  requireMoneyScope,
  (req, res) => decideReimbursement(req, res, "denied"),
);
adminRouter.post(
  "/reimbursements/:id/pay",
  requireLeader,
  requireMoneyScope,
  (req, res) => decideReimbursement(req, res, "paid"),
);

adminRouter.post("/reimbursements/:id/delete", requireLeader, requireMoneyScope, async (req, res) => {
  const r = await prisma.reimbursement.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { receiptFilename: true, requesterName: true },
  });
  if (r?.receiptFilename) {
    try {
      await removeFile(req.org.id, r.receiptFilename);
    } catch (_) {
      // best-effort
    }
  }
  await prisma.reimbursement.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Reimbursement",
    entityId: req.params.id,
    action: "delete",
    summary: r ? `Deleted ${r.requesterName} request` : "Deleted reimbursement",
  });
  res.redirect("/admin/reimbursements");
});

/* ------------------------------------------------------------------ */
/* Merit Badge Counselor list (troop-curated)                          */
/* ------------------------------------------------------------------ */

function mbcFromBody(body) {
  const splitTags = (s) =>
    String(s || "")
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);
  return {
    name: (body?.name || "").trim().slice(0, 120) || "Counselor",
    email: (body?.email || "").trim().toLowerCase() || null,
    phone: (body?.phone || "").trim() || null,
    badges: splitTags(body?.badges).slice(0, 60),
    memberId: (body?.memberId || "").trim() || null,
    notes: (body?.notes || "").trim() || null,
  };
}

adminRouter.get("/mbc", requireLeader, async (req, res) => {
  const [list, members] = await Promise.all([
    prisma.meritBadgeCounselor.findMany({
      where: { orgId: req.org.id },
      orderBy: { name: "asc" },
    }),
    prisma.member.findMany({
      where: { orgId: req.org.id, isYouth: false },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const memberOpts = members
    .map(
      (m) =>
        `<option value="${escape(m.id)}">${escape(m.firstName)} ${escape(m.lastName)}</option>`,
    )
    .join("");

  const items = list
    .map(
      (c) => `
      <li>
        <div style="flex:1">
          <h3 style="margin:0">${escape(c.name)}</h3>
          <p class="muted small" style="margin:.1rem 0 0">
            ${c.email ? `<a href="mailto:${escape(c.email)}">${escape(c.email)}</a>` : ""}
            ${c.phone ? ` · ${escape(c.phone)}` : ""}
          </p>
          <p style="margin:.25rem 0 0">${
            c.badges.length
              ? c.badges.map((b) => `<span class="tag">${escape(b)}</span>`).join(" ")
              : `<span class="muted small">No badges listed.</span>`
          }</p>
          ${c.notes ? `<p class="muted small" style="margin:.25rem 0 0">${escape(c.notes)}</p>` : ""}
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/mbc/${escape(c.id)}/edit">Edit</a>
          <form class="inline" method="post" action="/admin/mbc/${escape(c.id)}/delete" onsubmit="return confirm('Delete this counselor?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`,
    )
    .join("");

  const body = `
    <h1>Merit Badge Counselors</h1>
    <p class="muted">The troop's preferred counselor list — local, curated by your committee. Public to members at <code>/mbc</code>. Distinct from Scoutbook's national directory.</p>

    <form class="card" method="post" action="/admin/mbc">
      <h2 style="margin-top:0">Add a counselor</h2>
      <div class="row">
        <label style="margin:0;flex:1">Name<input name="name" type="text" required maxlength="120"></label>
        <label style="margin:0;flex:1">Roster member (optional)<select name="memberId"><option value="">— free-form / external —</option>${memberOpts}</select></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Email<input name="email" type="email" maxlength="120"></label>
        <label style="margin:0;flex:1">Phone<input name="phone" type="tel" maxlength="40"></label>
      </div>
      <label>Badges (comma-separated)<input name="badges" type="text" maxlength="500" placeholder="First Aid, Camping, Citizenship in the Community"></label>
      <label>Notes<textarea name="notes" rows="2" maxlength="500" placeholder="Best for First Aid; reach out via email."></textarea></label>
      <button class="btn btn-primary" type="submit">Add counselor</button>
    </form>

    <h2 style="margin-top:1.5rem">Counselors</h2>
    ${list.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No counselors yet. Add one above.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Merit Badge Counselors", body }));
});

adminRouter.post("/mbc", requireLeader, async (req, res) => {
  const data = mbcFromBody(req.body);
  if (data.memberId) {
    const m = await prisma.member.findFirst({
      where: { id: data.memberId, orgId: req.org.id },
      select: { id: true },
    });
    if (!m) data.memberId = null;
  }
  const created = await prisma.meritBadgeCounselor.create({
    data: { orgId: req.org.id, ...data },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "MeritBadgeCounselor",
    entityId: created.id,
    action: "create",
    summary: `Added ${created.name}`,
  });
  res.redirect("/admin/mbc");
});

adminRouter.get("/mbc/:id/edit", requireLeader, async (req, res) => {
  const [c, members] = await Promise.all([
    prisma.meritBadgeCounselor.findFirst({
      where: { id: req.params.id, orgId: req.org.id },
    }),
    prisma.member.findMany({
      where: { orgId: req.org.id, isYouth: false },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  if (!c) return res.status(404).send("Not found");

  const memberOpts = members
    .map(
      (m) =>
        `<option value="${escape(m.id)}"${c.memberId === m.id ? " selected" : ""}>${escape(m.firstName)} ${escape(m.lastName)}</option>`,
    )
    .join("");

  const v = (k) => escape(c[k] ?? "");
  const body = `
    <a class="back" href="/admin/mbc" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← MBC list</a>
    <h1>Edit counselor</h1>
    <form class="card" method="post" action="/admin/mbc/${escape(c.id)}">
      <div class="row">
        <label style="margin:0;flex:1">Name<input name="name" type="text" required maxlength="120" value="${v("name")}"></label>
        <label style="margin:0;flex:1">Roster member<select name="memberId"><option value="">— free-form / external —</option>${memberOpts}</select></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Email<input name="email" type="email" maxlength="120" value="${v("email")}"></label>
        <label style="margin:0;flex:1">Phone<input name="phone" type="tel" maxlength="40" value="${v("phone")}"></label>
      </div>
      <label>Badges (comma-separated)<input name="badges" type="text" maxlength="500" value="${escape(c.badges.join(", "))}"></label>
      <label>Notes<textarea name="notes" rows="2" maxlength="500">${v("notes")}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/mbc">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit counselor", body }));
});

adminRouter.post("/mbc/:id", requireLeader, async (req, res) => {
  const c = await prisma.meritBadgeCounselor.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!c) return res.status(404).send("Not found");
  const data = mbcFromBody(req.body);
  if (data.memberId) {
    const m = await prisma.member.findFirst({
      where: { id: data.memberId, orgId: req.org.id },
      select: { id: true },
    });
    if (!m) data.memberId = null;
  }
  await prisma.meritBadgeCounselor.update({ where: { id: c.id }, data });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "MeritBadgeCounselor",
    entityId: c.id,
    action: "update",
    summary: `Edited ${data.name}`,
  });
  res.redirect("/admin/mbc");
});

adminRouter.post("/mbc/:id/delete", requireLeader, async (req, res) => {
  const c = await prisma.meritBadgeCounselor.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { name: true },
  });
  await prisma.meritBadgeCounselor.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "MeritBadgeCounselor",
    entityId: req.params.id,
    action: "delete",
    summary: c ? `Deleted ${c.name}` : "Deleted counselor",
  });
  res.redirect("/admin/mbc");
});

/* ------------------------------------------------------------------ */
/* Eagle Scouts (public list) + Eagle project workflow                 */
/* ------------------------------------------------------------------ */

const PROJECT_STATUSES = ["idea", "proposal", "approved", "in-progress", "complete"];

adminRouter.get("/eagle", requireLeader, async (req, res) => {
  const [eagles, projects] = await Promise.all([
    prisma.eagleScout.findMany({
      where: { orgId: req.org.id },
      orderBy: [{ earnedAt: "desc" }, { lastName: "asc" }],
    }),
    prisma.eagleProject.findMany({
      where: { orgId: req.org.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  // Resolve scoutbookUserId per Eagle that's still on the roster, so we
  // can deep-link to their Scoutbook profile.
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

  const eagleRows = eagles
    .map((e) => {
      const sbId = e.memberId ? sbMap.get(e.memberId) : null;
      const sbLink = sbId
        ? ` · <a href="${escape(scoutbookUrl(sbId))}" target="_blank" rel="noopener">Scoutbook ↗</a>`
        : "";
      return `
      <li>
        <div style="flex:1">
          <h3>${escape(e.firstName)} ${escape(e.lastName)}</h3>
          <p class="muted small">
            <span class="tag">${escape(e.earnedAt.toISOString().slice(0, 10))}</span>
            ${e.projectName ? `${escape(e.projectName)}` : ""}${sbLink}
          </p>
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/eagle/${escape(e.id)}/edit">Edit</a>
          <form class="inline" method="post" action="/admin/eagle/${escape(e.id)}/delete" onsubmit="return confirm('Remove this Eagle from the public list?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`;
    })
    .join("");

  const projRows = projects
    .map(
      (p) => `
      <li>
        <div style="flex:1">
          <h3>${escape(p.scoutName)}${p.beneficiary ? ` — ${escape(p.beneficiary)}` : ""}</h3>
          <p class="muted small">
            <span class="tag">${escape(p.status)}</span>
            ${p.mentorName ? `mentor: ${escape(p.mentorName)} · ` : ""}
            ${p.completedAt ? `completed ${escape(p.completedAt.toISOString().slice(0, 10))}` : p.startedAt ? `started ${escape(p.startedAt.toISOString().slice(0, 10))}` : ""}
            ${p.workbookUrl ? ` · <a href="${escape(p.workbookUrl)}" target="_blank" rel="noopener">workbook ↗</a>` : ""}
          </p>
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/eagle/projects/${escape(p.id)}/edit">Edit</a>
          <form class="inline" method="post" action="/admin/eagle/projects/${escape(p.id)}/delete" onsubmit="return confirm('Delete this project?')">
            <button class="btn btn-danger small" type="submit">Delete</button>
          </form>
        </div>
      </li>`
    )
    .join("");

  const statusOpts = PROJECT_STATUSES.map(
    (s) => `<option value="${escape(s)}">${escape(s)}</option>`
  ).join("");

  const body = `
    <h1>Eagle Scouts</h1>
    <p class="muted">Two surfaces: a public list of every Eagle from your unit, and an internal workflow tracker for in-progress projects. Advancement records still live in <strong>Scoutbook</strong> — this is just the project-management layer.</p>

    <h2 style="margin-top:1.25rem">Public Eagle list</h2>
    <p class="muted small">Shown at <a href="/eagles" target="_blank" rel="noopener">/eagles</a>.</p>

    <form class="card" method="post" action="/admin/eagle">
      <div class="row">
        <label style="margin:0;flex:1">First name<input name="firstName" type="text" required maxlength="60"></label>
        <label style="margin:0;flex:1">Last name<input name="lastName" type="text" required maxlength="60"></label>
        <label style="margin:0;flex:1">Earned (date)<input name="earnedAt" type="date" required></label>
      </div>
      <label>Project (optional)<input name="projectName" type="text" maxlength="120" placeholder="e.g. Built a trail bench at the nature center"></label>
      <button class="btn btn-primary" type="submit">Add Eagle</button>
    </form>

    ${eagles.length ? `<ul class="items">${eagleRows}</ul>` : `<div class="empty" style="margin-top:1rem">No Eagles on the list yet.</div>`}

    <h2 style="margin-top:2rem">Project workflow</h2>
    <p class="muted small">Idea → proposal → approved → in-progress → complete. Workbook stays in Scoutbook; we just track the conversation around it.</p>

    <form class="card" method="post" action="/admin/eagle/projects">
      <div class="row">
        <label style="margin:0;flex:2">Scout name<input name="scoutName" type="text" required maxlength="80"></label>
        <label style="margin:0;flex:1">Status
          <select name="status">${statusOpts.replace('value="idea"', 'value="idea" selected')}</select>
        </label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Beneficiary<input name="beneficiary" type="text" maxlength="80" placeholder="e.g. Anytown Nature Center"></label>
        <label style="margin:0;flex:1">Mentor<input name="mentorName" type="text" maxlength="80"></label>
      </div>
      <label>Workbook URL<input name="workbookUrl" type="url" maxlength="500" placeholder="https://scoutbook.scouting.org/..."></label>
      <button class="btn btn-primary" type="submit">Add project</button>
    </form>

    ${projects.length ? `<ul class="items">${projRows}</ul>` : `<div class="empty" style="margin-top:1rem">No projects in the queue.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Eagle Scouts", body }));
});

adminRouter.post("/eagle", requireLeader, async (req, res) => {
  const { firstName, lastName, earnedAt, projectName } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !earnedAt) return res.redirect("/admin/eagle");
  await prisma.eagleScout.create({
    data: {
      orgId: req.org.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      earnedAt: new Date(earnedAt),
      projectName: projectName?.trim() || null,
    },
  });
  res.redirect("/admin/eagle");
});

// Eagle projects — defined BEFORE /eagle/:id routes so /eagle/projects
// isn't shadowed by the :id parameter.
adminRouter.post("/eagle/projects", requireLeader, async (req, res) => {
  const { scoutName, status, beneficiary, mentorName, workbookUrl } = req.body || {};
  if (!scoutName?.trim()) return res.redirect("/admin/eagle");
  await prisma.eagleProject.create({
    data: {
      orgId: req.org.id,
      scoutName: scoutName.trim(),
      status: PROJECT_STATUSES.includes(status) ? status : "idea",
      beneficiary: beneficiary?.trim() || null,
      mentorName: mentorName?.trim() || null,
      workbookUrl: workbookUrl?.trim() || null,
      startedAt: status === "in-progress" || status === "complete" ? new Date() : null,
      completedAt: status === "complete" ? new Date() : null,
    },
  });
  res.redirect("/admin/eagle");
});

adminRouter.get("/eagle/projects/:id/edit", requireLeader, async (req, res) => {
  const p = await prisma.eagleProject.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!p) return res.status(404).send("Not found");
  const v = (k) => escape(p[k] ?? "");
  const sel = (cond) => (cond ? " selected" : "");
  const body = `
    <a class="back" href="/admin/eagle" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Eagle Scouts</a>
    <h1>Edit project</h1>
    <form class="card" method="post" action="/admin/eagle/projects/${escape(p.id)}">
      <div class="row">
        <label style="margin:0;flex:2">Scout name<input name="scoutName" type="text" required maxlength="80" value="${v("scoutName")}"></label>
        <label style="margin:0;flex:1">Status
          <select name="status">${PROJECT_STATUSES.map(
            (s) => `<option value="${escape(s)}"${sel(p.status === s)}>${escape(s)}</option>`
          ).join("")}</select>
        </label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Beneficiary<input name="beneficiary" type="text" maxlength="80" value="${v("beneficiary")}"></label>
        <label style="margin:0;flex:1">Mentor<input name="mentorName" type="text" maxlength="80" value="${v("mentorName")}"></label>
      </div>
      <label>Workbook URL<input name="workbookUrl" type="url" maxlength="500" value="${v("workbookUrl")}"></label>
      <label>Notes<textarea name="notes" rows="3">${v("notes")}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/eagle">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit project", body }));
});

adminRouter.post("/eagle/projects/:id", requireLeader, async (req, res) => {
  const p = await prisma.eagleProject.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!p) return res.status(404).send("Not found");
  const { scoutName, status, beneficiary, mentorName, workbookUrl, notes } = req.body || {};
  const newStatus = PROJECT_STATUSES.includes(status) ? status : p.status;
  const data = {
    scoutName: scoutName?.trim() || p.scoutName,
    status: newStatus,
    beneficiary: beneficiary?.trim() || null,
    mentorName: mentorName?.trim() || null,
    workbookUrl: workbookUrl?.trim() || null,
    notes: notes?.trim() || null,
  };
  // Stamp transitions automatically.
  if (newStatus === "in-progress" && !p.startedAt) data.startedAt = new Date();
  if (newStatus === "complete" && !p.completedAt) data.completedAt = new Date();
  if (newStatus !== "complete" && p.completedAt) data.completedAt = null;
  await prisma.eagleProject.update({ where: { id: p.id }, data });
  res.redirect("/admin/eagle");
});

adminRouter.post("/eagle/projects/:id/delete", requireLeader, async (req, res) => {
  await prisma.eagleProject.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/eagle");
});

// EagleScout edit/delete — kept AFTER /eagle/projects routes so the
// :id parameter doesn't swallow the static "projects" path.
adminRouter.get("/eagle/:id/edit", requireLeader, async (req, res) => {
  const e = await prisma.eagleScout.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!e) return res.status(404).send("Not found");
  const v = (k) => escape(e[k] ?? "");
  const body = `
    <a class="back" href="/admin/eagle" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Eagle Scouts</a>
    <h1>Edit Eagle</h1>
    <form class="card" method="post" action="/admin/eagle/${escape(e.id)}">
      <div class="row">
        <label style="margin:0;flex:1">First name<input name="firstName" type="text" required maxlength="60" value="${v("firstName")}"></label>
        <label style="margin:0;flex:1">Last name<input name="lastName" type="text" required maxlength="60" value="${v("lastName")}"></label>
        <label style="margin:0;flex:1">Earned<input name="earnedAt" type="date" required value="${e.earnedAt.toISOString().slice(0, 10)}"></label>
      </div>
      <label>Project<input name="projectName" type="text" maxlength="120" value="${v("projectName")}"></label>
      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/eagle">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit Eagle", body }));
});

adminRouter.post("/eagle/:id", requireLeader, async (req, res) => {
  const e = await prisma.eagleScout.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!e) return res.status(404).send("Not found");
  const { firstName, lastName, earnedAt, projectName } = req.body || {};
  await prisma.eagleScout.update({
    where: { id: e.id },
    data: {
      firstName: firstName?.trim() || "",
      lastName: lastName?.trim() || "",
      earnedAt: earnedAt ? new Date(earnedAt) : new Date(),
      projectName: projectName?.trim() || null,
    },
  });
  res.redirect("/admin/eagle");
});

adminRouter.post("/eagle/:id/delete", requireLeader, async (req, res) => {
  await prisma.eagleScout.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/eagle");
});

/* ------------------------------------------------------------------ */
/* Court of Honor program builder                                       */
/* ------------------------------------------------------------------ */

const AWARD_CATEGORIES = ["Rank", "Merit Badge", "Award", "Recognition", "Other"];

adminRouter.get("/events/:id/program", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const awards = await prisma.cohAward.findMany({
    where: { eventId: ev.id },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { recipient: "asc" }],
  });

  const byCat = {};
  for (const a of awards) {
    const c = a.category || "Other";
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(a);
  }
  const groups = Object.keys(byCat)
    .sort()
    .map(
      (cat) => `
        <h3 style="margin-top:1rem">${escape(cat)}</h3>
        <ul class="items">${byCat[cat]
          .map(
            (a) => `
            <li>
              <div style="flex:1">
                <strong>${escape(a.recipient)}</strong>
                <span class="muted"> — ${escape(a.award)}</span>
                ${a.notes ? `<p class="muted small">${escape(a.notes)}</p>` : ""}
              </div>
              <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/program/${escape(a.id)}/delete">
                <button class="btn btn-danger small" type="submit">×</button>
              </form>
            </li>`
          )
          .join("")}</ul>`
    )
    .join("");

  const catOpts = AWARD_CATEGORIES.map(
    (c) => `<option value="${escape(c)}">${escape(c)}</option>`
  ).join("");

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
    <h1>Court of Honor program · ${escape(ev.title)}</h1>
    <p class="muted">Build the printable ceremony program. Each row prints as a line on the program (printable view: <a href="/events/${escape(ev.id)}/program" target="_blank" rel="noopener">/events/${escape(ev.id)}/program</a>).</p>

    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/program">
      <h2 style="margin-top:0">Add an award</h2>
      <div class="row">
        <label style="margin:0;flex:2">Recipient<input name="recipient" type="text" required maxlength="80" placeholder="Demo Scout 2"></label>
        <label style="margin:0;flex:1">Category
          <select name="category">${catOpts.replace('value="Rank"', 'value="Rank" selected')}</select>
        </label>
      </div>
      <label>Award<input name="award" type="text" required maxlength="120" placeholder="Tenderfoot rank, First Aid merit badge, …"></label>
      <label>Notes (optional)<input name="notes" type="text" maxlength="160"></label>
      <button class="btn btn-primary" type="submit">Add</button>
    </form>

    ${awards.length ? groups : `<div class="empty" style="margin-top:1rem">No awards on the program yet.</div>`}

    <p style="margin-top:1.5rem"><a class="btn btn-ghost" href="/events/${escape(ev.id)}/program" target="_blank" rel="noopener">Open printable program ↗</a></p>
  `;
  res.type("html").send(layout(req, { title: `Program · ${ev.title}`, body }));
});

adminRouter.post("/events/:id/program", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");
  const { recipient, award, category, notes } = req.body || {};
  if (!recipient?.trim() || !award?.trim()) return res.redirect(`/admin/events/${ev.id}/program`);

  const last = await prisma.cohAward.findFirst({
    where: { eventId: ev.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.cohAward.create({
    data: {
      orgId: req.org.id,
      eventId: ev.id,
      recipient: recipient.trim(),
      award: award.trim(),
      category: AWARD_CATEGORIES.includes(category) ? category : null,
      notes: notes?.trim() || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  res.redirect(`/admin/events/${ev.id}/program`);
});

adminRouter.post("/events/:id/program/:awardId/delete", requireLeader, async (req, res) => {
  await prisma.cohAward.deleteMany({
    where: { id: req.params.awardId, orgId: req.org.id, eventId: req.params.id },
  });
  res.redirect(`/admin/events/${req.params.id}/program`);
});

// Per-event report — RSVP counts, headcount, sign-up coverage, credits
// granted, and total cost. Pulls everything we already track.
adminRouter.get("/events/:id/report", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: {
      rsvps: { include: { user: { select: { id: true } } } },
      slots: { include: { assignments: true } },
    },
  });
  if (!ev) return res.status(404).send("Not found");

  const counts = { yes: 0, no: 0, maybe: 0, totalGuests: 0, total: 0 };
  for (const r of ev.rsvps) {
    counts[r.response] = (counts[r.response] || 0) + 1;
    counts.total++;
    if (r.response === "yes") counts.totalGuests += r.guests || 0;
  }
  const headcount = counts.yes + counts.totalGuests;

  // Slot coverage: open vs filled (active assignments only).
  let totalCapacity = 0;
  let totalFilled = 0;
  let totalWaitlisted = 0;
  for (const s of ev.slots) {
    totalCapacity += s.capacity;
    const active = s.assignments.filter((a) => !a.waitlisted).length;
    totalFilled += Math.min(active, s.capacity);
    totalWaitlisted += s.assignments.filter((a) => a.waitlisted).length;
  }

  // Credits granted (per yes-RSVP × per-attendee credit). Past or
  // future event — we report what would be earned if it happens.
  const creditsHours = (ev.serviceHours || 0) * counts.yes;
  const creditsNights = (ev.campingNights || 0) * counts.yes;
  const creditsMiles = (ev.hikingMiles || 0) * counts.yes;

  const totalCost = (ev.cost || 0) * counts.yes;

  const fmtNum = (n) => Number.isInteger(n) ? String(n) : Number(n).toFixed(1);

  const slotRows = ev.slots
    .map((s) => {
      const active = s.assignments.filter((a) => !a.waitlisted).length;
      const waiting = s.assignments.filter((a) => a.waitlisted).length;
      const open = Math.max(0, s.capacity - active);
      return `<tr>
        <td>${escape(s.title)}</td>
        <td class="num">${active} / ${s.capacity}</td>
        <td class="num">${open}</td>
        <td class="num">${waiting}</td>
      </tr>`;
    })
    .join("");

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
    <h1>Event report · ${escape(ev.title)}</h1>
    <p class="muted">${escape(new Date(ev.startsAt).toLocaleString("en-US"))}${ev.location ? ` · ${escape(ev.location)}` : ""}</p>

    <h2>Attendance</h2>
    <div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
      <div class="card stat-card"><strong style="font-size:1.6rem">${counts.yes}</strong><br><span class="muted small">Yes</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${counts.maybe}</strong><br><span class="muted small">Maybe</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${counts.no}</strong><br><span class="muted small">No</span></div>
      <div class="card stat-card"><strong style="font-size:1.6rem">${headcount}</strong><br><span class="muted small">Headcount (yes + guests)</span></div>
    </div>
    <p class="muted small"><a href="/admin/events/${escape(ev.id)}/rsvps">See RSVP list →</a> · <a href="/admin/events/${escape(ev.id)}/rsvps.csv">CSV</a></p>

    <h2 style="margin-top:1.5rem">Sign-up sheets</h2>
    ${
      ev.slots.length
        ? `<table class="ing-table">
            <thead><tr><th>Slot</th><th class="num">Filled</th><th class="num">Open</th><th class="num">Waiting</th></tr></thead>
            <tbody>${slotRows}
              <tr><td><strong>Totals</strong></td>
                <td class="num"><strong>${totalFilled} / ${totalCapacity}</strong></td>
                <td class="num"><strong>${Math.max(0, totalCapacity - totalFilled)}</strong></td>
                <td class="num"><strong>${totalWaitlisted}</strong></td>
              </tr>
            </tbody>
          </table>`
        : `<p class="muted">No sign-up sheet for this event.</p>`
    }

    <h2 style="margin-top:1.5rem">Credits granted</h2>
    ${
      ev.serviceHours || ev.campingNights || ev.hikingMiles
        ? `<div class="row" style="gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
            ${ev.serviceHours ? `<div class="card stat-card"><strong style="font-size:1.6rem">${fmtNum(creditsHours)}</strong><br><span class="muted small">Service hr (${ev.serviceHours} × ${counts.yes})</span></div>` : ""}
            ${ev.campingNights ? `<div class="card stat-card"><strong style="font-size:1.6rem">${creditsNights}</strong><br><span class="muted small">Camping nt (${ev.campingNights} × ${counts.yes})</span></div>` : ""}
            ${ev.hikingMiles ? `<div class="card stat-card"><strong style="font-size:1.6rem">${fmtNum(creditsMiles)}</strong><br><span class="muted small">Miles (${ev.hikingMiles} × ${counts.yes})</span></div>` : ""}
          </div>`
        : `<p class="muted">No per-attendee credits set on this event. <a href="/admin/events/${escape(ev.id)}/edit">Edit</a> to add some.</p>`
    }

    <h2 style="margin-top:1.5rem">Cost</h2>
    ${
      ev.cost
        ? `<div class="card stat-card" style="display:inline-block;min-width:240px">
            <strong style="font-size:1.6rem">$${totalCost}</strong>
            <br><span class="muted small">$${ev.cost} per attendee × ${counts.yes} yes-RSVPs</span>
          </div>`
        : `<p class="muted">No per-attendee cost set on this event.</p>`
    }

    <style>.stat-card{flex:1;min-width:140px;text-align:center}</style>
  `;
  res.type("html").send(layout(req, { title: `Report · ${ev.title}`, body }));
});

/* ------------------------------------------------------------------ */
/* Carpool plan (per-event rides + riders)                             */
/* ------------------------------------------------------------------ */

adminRouter.get("/events/:id/rides", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!ev) return res.status(404).send("Not found");

  const [rides, members] = await Promise.all([
    prisma.carRide.findMany({
      where: { eventId: ev.id },
      orderBy: [{ departureTime: "asc" }, { createdAt: "asc" }],
      include: { riders: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.member.findMany({
      where: { orgId: req.org.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, isYouth: true },
    }),
  ]);

  const memberOpts = members
    .map(
      (m) =>
        `<option value="${escape(m.id)}">${escape(m.firstName)} ${escape(m.lastName)}${
          m.isYouth ? "" : " (adult)"
        }</option>`,
    )
    .join("");

  const fmtDt = (d) =>
    d ? new Date(d).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  const renderRide = (r) => {
    const filled = r.riders.length;
    const remaining = Math.max(0, r.seats - filled);
    const overFilled = filled > r.seats;
    const ridersList = r.riders
      .map(
        (rd) => `
        <li class="row" style="align-items:center;gap:.5rem">
          <div style="flex:1">
            <strong>${escape(rd.name)}</strong>${rd.isYouth ? "" : ` <span class="tag">adult</span>`}
            ${rd.notes ? `<div class="muted small">${escape(rd.notes)}</div>` : ""}
          </div>
          <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/rides/${escape(r.id)}/riders/${escape(rd.id)}/delete">
            <button class="btn btn-danger small" type="submit">×</button>
          </form>
        </li>`,
      )
      .join("");

    return `
      <article class="card" style="margin-bottom:1rem">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <h3 style="margin:0 0 .15rem">${escape(r.driverName)}${
              r.vehicleNote ? ` <span class="muted small">— ${escape(r.vehicleNote)}</span>` : ""
            }</h3>
            <p class="muted small" style="margin:0">
              ${filled} / ${r.seats} seat${r.seats === 1 ? "" : "s"}${overFilled ? ` <span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">over capacity</span>` : remaining === 0 ? ` <span class="tag">full</span>` : ""}
              ${r.departureTime ? ` · departs ${escape(fmtDt(r.departureTime))}` : ""}
              ${r.departureLocation ? ` from ${escape(r.departureLocation)}` : ""}
              ${r.driverPhone ? ` · ${escape(r.driverPhone)}` : ""}
              ${r.driverEmail ? ` · <a href="mailto:${escape(r.driverEmail)}">${escape(r.driverEmail)}</a>` : ""}
            </p>
            ${r.notes ? `<p class="muted small" style="margin:.25rem 0 0">${escape(r.notes)}</p>` : ""}
          </div>
          <form class="inline" method="post" action="/admin/events/${escape(ev.id)}/rides/${escape(r.id)}/delete" onsubmit="return confirm('Delete this ride?')">
            <button class="btn btn-danger small" type="submit">Delete ride</button>
          </form>
        </div>

        ${ridersList ? `<ul class="items" style="margin-top:.5rem">${ridersList}</ul>` : `<p class="muted small" style="margin:.5rem 0 0">No riders assigned yet.</p>`}

        <form method="post" action="/admin/events/${escape(ev.id)}/rides/${escape(r.id)}/riders" class="row" style="margin-top:.5rem;gap:.4rem;flex-wrap:wrap">
          <select name="memberId" style="flex:1;min-width:160px">
            <option value="">— pick a rider —</option>
            ${memberOpts}
          </select>
          <input name="name" type="text" maxlength="80" placeholder="…or free-form name" style="flex:1;min-width:140px">
          <input name="notes" type="text" maxlength="120" placeholder="Notes (optional)" style="flex:1;min-width:140px">
          <button class="btn btn-primary small" type="submit">Add rider</button>
        </form>
      </article>`;
  };

  const body = `
    <a class="back" href="/admin/events" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Calendar</a>
    <h1>Carpool plan · ${escape(ev.title)}</h1>
    <p class="muted">Build the ride list for this event. Each ride is a driver + vehicle + seats; assign riders from the roster (or free-form names for guests).</p>

    <h2 style="margin-top:1.25rem">Add a ride</h2>
    <form class="card" method="post" action="/admin/events/${escape(ev.id)}/rides">
      <div class="row">
        <label style="margin:0;flex:1">Driver name<input name="driverName" type="text" required maxlength="80"></label>
        <label style="margin:0;flex:1">Vehicle note<input name="vehicleNote" type="text" maxlength="80" placeholder="Honda Pilot · silver"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Driver email<input name="driverEmail" type="email" maxlength="120"></label>
        <label style="margin:0;flex:1">Driver phone<input name="driverPhone" type="tel" maxlength="40"></label>
      </div>
      <div class="row">
        <label style="margin:0;flex:1">Seats (excluding driver)<input name="seats" type="number" min="1" max="20" value="4" required></label>
        <label style="margin:0;flex:1">Departs at<input name="departureTime" type="datetime-local"></label>
        <label style="margin:0;flex:1">Returns at<input name="returnTime" type="datetime-local"></label>
      </div>
      <label>Departure location<input name="departureLocation" type="text" maxlength="120" placeholder="Holy Nativity parking lot"></label>
      <label>Notes<textarea name="notes" rows="2" maxlength="200"></textarea></label>
      <button class="btn btn-primary" type="submit">Create ride</button>
    </form>

    <h2 style="margin-top:1.5rem">Rides ${rides.length ? `<span class="muted" style="font-weight:400">(${rides.length})</span>` : ""}</h2>
    ${rides.length ? rides.map(renderRide).join("") : `<div class="empty">No rides yet. Add one above.</div>`}
  `;
  res.type("html").send(layout(req, { title: `Carpool · ${ev.title}`, body }));
});

function rideDataFromBody(body) {
  const seats = parseInt(body?.seats, 10);
  const dep = body?.departureTime ? new Date(body.departureTime) : null;
  const ret = body?.returnTime ? new Date(body.returnTime) : null;
  return {
    driverName: (body?.driverName || "").trim() || "Driver",
    driverEmail: (body?.driverEmail || "").trim().toLowerCase() || null,
    driverPhone: (body?.driverPhone || "").trim() || null,
    vehicleNote: (body?.vehicleNote || "").trim() || null,
    seats: Number.isFinite(seats) && seats >= 1 ? Math.min(20, seats) : 4,
    departureTime: dep && !isNaN(dep) ? dep : null,
    returnTime: ret && !isNaN(ret) ? ret : null,
    departureLocation: (body?.departureLocation || "").trim() || null,
    notes: (body?.notes || "").trim() || null,
  };
}

adminRouter.post("/events/:id/rides", requireLeader, async (req, res) => {
  const ev = await prisma.event.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!ev) return res.status(404).send("Not found");
  await prisma.carRide.create({
    data: { orgId: req.org.id, eventId: ev.id, ...rideDataFromBody(req.body) },
  });
  res.redirect(`/admin/events/${ev.id}/rides`);
});

adminRouter.post("/events/:id/rides/:rideId/delete", requireLeader, async (req, res) => {
  await prisma.carRide.deleteMany({
    where: { id: req.params.rideId, orgId: req.org.id, eventId: req.params.id },
  });
  res.redirect(`/admin/events/${req.params.id}/rides`);
});

adminRouter.post("/events/:id/rides/:rideId/riders", requireLeader, async (req, res) => {
  const ride = await prisma.carRide.findFirst({
    where: { id: req.params.rideId, orgId: req.org.id, eventId: req.params.id },
    select: { id: true },
  });
  if (!ride) return res.status(404).send("Not found");

  let memberId = (req.body?.memberId || "").trim() || null;
  let name = (req.body?.name || "").trim() || null;
  let isYouth = true;
  if (memberId) {
    const m = await prisma.member.findFirst({
      where: { id: memberId, orgId: req.org.id },
      select: { firstName: true, lastName: true, isYouth: true },
    });
    if (m) {
      name = `${m.firstName} ${m.lastName}`;
      isYouth = m.isYouth;
    } else {
      memberId = null;
    }
  }
  if (!name) return res.redirect(`/admin/events/${req.params.id}/rides`);

  await prisma.carRideRider.create({
    data: {
      orgId: req.org.id,
      rideId: ride.id,
      memberId,
      name,
      isYouth,
      notes: (req.body?.notes || "").trim() || null,
    },
  });
  res.redirect(`/admin/events/${req.params.id}/rides`);
});

adminRouter.post(
  "/events/:id/rides/:rideId/riders/:riderId/delete",
  requireLeader,
  async (req, res) => {
    await prisma.carRideRider.deleteMany({
      where: {
        id: req.params.riderId,
        orgId: req.org.id,
        rideId: req.params.rideId,
      },
    });
    res.redirect(`/admin/events/${req.params.id}/rides`);
  },
);

/* ------------------------------------------------------------------ */
/* Surveys                                                             */
/* ------------------------------------------------------------------ */

const QUESTION_TYPES = [
  { value: "text", label: "Short text" },
  { value: "long", label: "Paragraph" },
  { value: "yesno", label: "Yes / No" },
  { value: "select", label: "Pick one" },
  { value: "multi", label: "Pick any" },
  { value: "scale", label: "1–5 scale" },
];

function questionsFromBody(body) {
  // Form fields arrive as parallel arrays: q_label[], q_type[], q_options[], q_required[].
  const labels = Array.isArray(body?.q_label) ? body.q_label : body?.q_label ? [body.q_label] : [];
  const types = Array.isArray(body?.q_type) ? body.q_type : body?.q_type ? [body.q_type] : [];
  const options = Array.isArray(body?.q_options) ? body.q_options : body?.q_options ? [body.q_options] : [];
  const required = Array.isArray(body?.q_required) ? body.q_required : body?.q_required ? [body.q_required] : [];

  const out = [];
  for (let i = 0; i < labels.length; i++) {
    const label = (labels[i] || "").trim();
    if (!label) continue;
    const type = QUESTION_TYPES.some((t) => t.value === types[i]) ? types[i] : "text";
    const opts = (options[i] || "")
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push({
      id: `q${i}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      type,
      ...(type === "select" || type === "multi" ? { options: opts } : {}),
      required: required[i] === "1",
    });
  }
  return out;
}

function renderQuestionEditor(questions = []) {
  const rows = questions.length ? questions : [{ label: "", type: "text", options: [], required: false }];
  const types = (selected) =>
    QUESTION_TYPES.map(
      (t) => `<option value="${escape(t.value)}"${t.value === selected ? " selected" : ""}>${escape(t.label)}</option>`
    ).join("");
  return `
    <div id="q-list">
      ${rows
        .map(
          (q) => `
      <div class="q-row" style="border:1px solid var(--line);border-radius:10px;padding:.75rem;margin-bottom:.5rem">
        <div class="row">
          <label style="margin:0;flex:2">Question<input name="q_label" type="text" value="${escape(q.label || "")}" placeholder="e.g. How was the camporee?"></label>
          <label style="margin:0;flex:1">Type<select name="q_type">${types(q.type || "text")}</select></label>
          <label style="margin:0;align-self:end"><input type="checkbox" name="q_required" value="1"${q.required ? " checked" : ""} style="width:auto;display:inline;margin-right:.4rem">Required</label>
        </div>
        <label>Options (for "Pick one" / "Pick any" — comma- or newline-separated)
          <input name="q_options" type="text" value="${escape(((q.options || []).join(", ")))}" placeholder="Option A, Option B, Option C">
        </label>
      </div>`
        )
        .join("")}
    </div>
    <p><button type="button" class="btn btn-ghost small" onclick="(function(){const tpl=document.querySelector('.q-row').cloneNode(true);tpl.querySelectorAll('input').forEach(i=>i.value='');tpl.querySelectorAll('input[type=checkbox]').forEach(i=>i.checked=false);document.getElementById('q-list').appendChild(tpl);})()">+ Add another question</button></p>
  `;
}

adminRouter.get("/surveys", requireLeader, async (req, res) => {
  const surveys = await prisma.survey.findMany({
    where: { orgId: req.org.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });
  const items = surveys
    .map(
      (s) => `
    <li>
      <div style="flex:1">
        <h3>${escape(s.title)}</h3>
        <p class="muted small">
          <a href="/surveys/${escape(s.slug)}" target="_blank" rel="noopener">/surveys/${escape(s.slug)}</a>
          <span class="tag">${escape(s.audience)}</span>
          <span class="tag">${s._count.responses} response${s._count.responses === 1 ? "" : "s"}</span>
          ${s.closesAt ? `<span class="tag">closes ${escape(s.closesAt.toISOString().slice(0, 10))}</span>` : ""}
        </p>
      </div>
      <div class="row">
        <a class="btn btn-ghost small" href="/admin/surveys/${escape(s.id)}/responses">Responses</a>
        <a class="btn btn-ghost small" href="/admin/surveys/${escape(s.id)}/edit">Edit</a>
        <form class="inline" method="post" action="/admin/surveys/${escape(s.id)}/delete" onsubmit="return confirm('Delete this survey and all responses?')">
          <button class="btn btn-danger small" type="submit">Delete</button>
        </form>
      </div>
    </li>`
    )
    .join("");

  const body = `
    <h1>Surveys</h1>
    <p class="muted">Quick polls and feedback forms. Surveys live at <code>/surveys/&lt;slug&gt;</code>; share the link in a broadcast.</p>

    <form class="card" method="post" action="/admin/surveys">
      <h2 style="margin-top:0">New survey</h2>
      <label>Title<input name="title" type="text" required maxlength="120" placeholder="e.g. Camporee feedback"></label>
      <label>Description (optional)<textarea name="description" rows="2" maxlength="500"></textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">Who can respond
          <select name="audience">
            <option value="anyone">Anyone (anonymous OK — name + email required)</option>
            <option value="members">Signed-in members only</option>
          </select>
        </label>
        <label style="margin:0;flex:1">Closes (optional)<input name="closesAt" type="date"></label>
      </div>

      <h3 style="margin-top:1rem">Questions</h3>
      ${renderQuestionEditor()}

      <button class="btn btn-primary" type="submit">Create</button>
    </form>

    <h2 style="margin-top:1.25rem">Surveys</h2>
    ${surveys.length ? `<ul class="items">${items}</ul>` : `<div class="empty">No surveys yet.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Surveys", body }));
});

function slugifySurvey(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "survey";
}

async function pickUniqueSurveySlug(orgId, base, excludeId) {
  let slug = slugifySurvey(base);
  let n = 1;
  while (true) {
    const existing = await prisma.survey.findUnique({
      where: { orgId_slug: { orgId, slug } },
    });
    if (!existing || existing.id === excludeId) return slug;
    n++;
    slug = `${slugifySurvey(base)}-${n}`;
  }
}

adminRouter.post("/surveys", requireLeader, async (req, res) => {
  const title = req.body?.title?.trim();
  if (!title) return res.redirect("/admin/surveys");
  const slug = await pickUniqueSurveySlug(req.org.id, title);
  await prisma.survey.create({
    data: {
      orgId: req.org.id,
      slug,
      title,
      description: req.body?.description?.trim() || null,
      audience: req.body?.audience === "members" ? "members" : "anyone",
      closesAt: req.body?.closesAt ? new Date(req.body.closesAt) : null,
      questions: questionsFromBody(req.body),
    },
  });
  res.redirect("/admin/surveys");
});

adminRouter.get("/surveys/:id/edit", requireLeader, async (req, res) => {
  const s = await prisma.survey.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!s) return res.status(404).send("Not found");
  const sel = (cond) => (cond ? " selected" : "");
  const body = `
    <a class="back" href="/admin/surveys" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Surveys</a>
    <h1>Edit survey</h1>
    <form class="card" method="post" action="/admin/surveys/${escape(s.id)}">
      <label>Title<input name="title" type="text" required maxlength="120" value="${escape(s.title)}"></label>
      <label>Description<textarea name="description" rows="2" maxlength="500">${escape(s.description ?? "")}</textarea></label>
      <div class="row">
        <label style="margin:0;flex:1">Audience
          <select name="audience">
            <option value="anyone"${sel(s.audience === "anyone")}>Anyone (anonymous OK)</option>
            <option value="members"${sel(s.audience === "members")}>Members only</option>
          </select>
        </label>
        <label style="margin:0;flex:1">Closes<input name="closesAt" type="date" value="${s.closesAt ? s.closesAt.toISOString().slice(0, 10) : ""}"></label>
      </div>

      <h3 style="margin-top:1rem">Questions</h3>
      ${renderQuestionEditor(Array.isArray(s.questions) ? s.questions : [])}

      <div class="row">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-ghost" href="/admin/surveys">Cancel</a>
      </div>
    </form>
  `;
  res.type("html").send(layout(req, { title: "Edit survey", body }));
});

adminRouter.post("/surveys/:id", requireLeader, async (req, res) => {
  const s = await prisma.survey.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!s) return res.status(404).send("Not found");
  await prisma.survey.update({
    where: { id: s.id },
    data: {
      title: req.body?.title?.trim() || s.title,
      description: req.body?.description?.trim() || null,
      audience: req.body?.audience === "members" ? "members" : "anyone",
      closesAt: req.body?.closesAt ? new Date(req.body.closesAt) : null,
      questions: questionsFromBody(req.body),
    },
  });
  res.redirect("/admin/surveys");
});

adminRouter.post("/surveys/:id/delete", requireLeader, async (req, res) => {
  await prisma.survey.deleteMany({
    where: { id: req.params.id, orgId: req.org.id },
  });
  res.redirect("/admin/surveys");
});

adminRouter.get("/surveys/:id/responses", requireLeader, async (req, res) => {
  const s = await prisma.survey.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: { responses: { orderBy: { createdAt: "asc" } } },
  });
  if (!s) return res.status(404).send("Not found");

  const questions = Array.isArray(s.questions) ? s.questions : [];

  const cell = (q, ans) => {
    const v = ans?.[q.id];
    if (v == null || v === "") return "<td class='muted small'>—</td>";
    if (Array.isArray(v)) return `<td>${v.map((x) => escape(String(x))).join(", ")}</td>`;
    if (typeof v === "boolean") return `<td>${v ? "Yes" : "No"}</td>`;
    return `<td>${escape(String(v))}</td>`;
  };

  const headerRow = `<tr><th>Respondent</th><th>When</th>${questions
    .map((q) => `<th>${escape(q.label)}</th>`)
    .join("")}</tr>`;
  const rows = s.responses
    .map(
      (r) => `<tr>
        <td>${escape(r.name)}${r.email ? ` <span class="muted small">${escape(r.email)}</span>` : ""}</td>
        <td class="muted small">${escape(r.createdAt.toLocaleString("en-US"))}</td>
        ${questions.map((q) => cell(q, r.answers || {})).join("")}
      </tr>`
    )
    .join("");

  const body = `
    <a class="back" href="/admin/surveys" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Surveys</a>
    <h1>${escape(s.title)} — responses</h1>
    <p class="muted">${s.responses.length} response${s.responses.length === 1 ? "" : "s"} ·
      <a href="/surveys/${escape(s.slug)}" target="_blank" rel="noopener">/surveys/${escape(s.slug)}</a> ·
      <a href="/admin/surveys/${escape(s.id)}/responses.csv">Export CSV</a>
    </p>

    ${
      s.responses.length
        ? `<div class="card" style="overflow-x:auto"><table class="ing-table">
            <thead>${headerRow}</thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<div class="empty" style="margin-top:1rem">No responses yet. Share <a href="/surveys/${escape(s.slug)}">the link</a> in a broadcast.</div>`
    }
  `;
  res.type("html").send(layout(req, { title: `Responses · ${s.title}`, body }));
});

adminRouter.get("/surveys/:id/responses.csv", requireLeader, async (req, res) => {
  const s = await prisma.survey.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: { responses: { orderBy: { createdAt: "asc" } } },
  });
  if (!s) return res.status(404).send("Not found");
  const questions = Array.isArray(s.questions) ? s.questions : [];
  const csvEscape = (v) => {
    const x = String(v ?? "");
    return /[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  const header = ["Name", "Email", "Submitted at", ...questions.map((q) => q.label)];
  const rows = [header];
  for (const r of s.responses) {
    const ans = r.answers || {};
    rows.push([
      r.name,
      r.email || "",
      r.createdAt.toISOString(),
      ...questions.map((q) => {
        const v = ans[q.id];
        if (Array.isArray(v)) return v.join("; ");
        if (typeof v === "boolean") return v ? "Yes" : "No";
        return v ?? "";
      }),
    ]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  const safe = s.slug.replace(/[^a-z0-9-_]+/gi, "-");
  res
    .set("Content-Type", "text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="survey-${safe}.csv"`)
    .send(csv);
});

/* ------------------------------------------------------------------ */
/* Newsletters                                                         */
/* ------------------------------------------------------------------ */

const NEWSLETTER_VISIBILITY = ["members", "public"];

function renderNewsletterStatusTag(n) {
  if (n.status === "sent") {
    const when = n.publishedAt
      ? new Date(n.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    return `<span class="tag" style="background:#bcd0f4;border-color:#1d4ed8;color:#0f172a">sent · ${escape(when)}</span>`;
  }
  return `<span class="tag" style="background:#fbf8ee;border-color:#eef0e7;color:#64748b">draft</span>`;
}

adminRouter.get("/newsletters", requireLeader, async (req, res) => {
  const issues = await prisma.newsletter.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ status: "asc" }, { publishedAt: "desc" }, { updatedAt: "desc" }],
    include: { author: { select: { displayName: true } } },
  });
  const rows = issues
    .map(
      (n) => `
      <li>
        <div style="flex:1">
          <h3 style="margin:0"><a href="/admin/newsletters/${escape(n.id)}/edit">${escape(n.title)}</a></h3>
          <p class="muted small" style="margin:.1rem 0 0">
            ${renderNewsletterStatusTag(n)}
            · ${n.includedPostIds.length} post${n.includedPostIds.length === 1 ? "" : "s"}
            · ${n.includedEventIds.length} event${n.includedEventIds.length === 1 ? "" : "s"}
            ${n.author ? ` · by ${escape(n.author.displayName)}` : ""}
          </p>
        </div>
        <div class="row">
          <a class="btn btn-ghost small" href="/admin/newsletters/${escape(n.id)}/edit">${n.status === "sent" ? "View" : "Edit"}</a>
        </div>
      </li>`,
    )
    .join("");

  const body = `
    <h1>Newsletters</h1>
    <p class="muted">The recurring digest you email families. Auto-composes from recent posts and upcoming events; you write the intro and decide who's in the audience.</p>
    <p style="margin:.6rem 0 1rem"><a class="btn btn-primary" href="/admin/newsletters/new">Compose new issue</a></p>
    ${issues.length ? `<ul class="items">${rows}</ul>` : `<div class="empty">No newsletters yet. Compose your first issue when you're ready.</div>`}
  `;
  res.type("html").send(layout(req, { title: "Newsletters", body }));
});

adminRouter.get("/newsletters/new", requireLeader, async (req, res) => {
  const composed = await composeNewsletter({
    orgId: req.org.id,
    prismaClient: prisma,
  });
  const [patrols, subgroups] = await Promise.all([
    prisma.member.findMany({
      where: { orgId: req.org.id, patrol: { not: null } },
      distinct: ["patrol"],
      select: { patrol: true },
      orderBy: { patrol: "asc" },
    }),
    prisma.subgroup.findMany({ where: { orgId: req.org.id }, orderBy: { name: "asc" } }),
  ]);
  const composerBody = newsletterComposerHtml({
    title: composed.suggestedTitle,
    intro: composed.suggestedIntro,
    posts: composed.posts,
    events: composed.events,
    pastEvents: composed.pastEvents,
    audience: "everyone",
    audiencePatrol: "",
    visibility: "members",
    selectedPostIds: composed.posts.map((p) => p.id),
    // Auto-check upcoming + past so the leader can deselect what they
    // don't want; matches the "auto-suggest, leader curates" flow.
    selectedEventIds: [
      ...composed.events.map((e) => e.id),
      ...composed.pastEvents.map((e) => e.id),
    ],
    patrols,
    subgroups,
    formAction: "/admin/newsletters",
    submitLabel: "Save draft",
    statusBlock: "",
    deleteAction: null,
    sendAction: null,
  });
  res.type("html").send(layout(req, { title: "Compose newsletter", body: composerBody }));
});

adminRouter.post("/newsletters", requireLeader, async (req, res) => {
  const data = newsletterFromBody(req.body);
  if (!data.title) return res.redirect("/admin/newsletters/new");
  const created = await prisma.newsletter.create({
    data: {
      orgId: req.org.id,
      authorId: req.user.id,
      ...data,
    },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Newsletter",
    entityId: created.id,
    action: "create",
    summary: created.title,
  });
  res.redirect(`/admin/newsletters/${created.id}/edit`);
});

adminRouter.get("/newsletters/:id/edit", requireLeader, async (req, res) => {
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: { author: { select: { displayName: true } } },
  });
  if (!issue) return res.status(404).send("Not found");

  const now = new Date();
  const recapSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [posts, events, pastEvents, patrols, subgroups] = await Promise.all([
    prisma.post.findMany({
      where: { orgId: req.org.id },
      orderBy: { publishedAt: "desc" },
      take: 20,
      include: {
        author: { select: { displayName: true } },
        photos: {
          take: 1,
          orderBy: { sortOrder: "asc" },
          select: { filename: true, caption: true },
        },
      },
    }),
    prisma.event.findMany({
      where: { orgId: req.org.id, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 30,
    }),
    prisma.event.findMany({
      where: { orgId: req.org.id, startsAt: { gte: recapSince, lt: now } },
      orderBy: { startsAt: "desc" },
      take: 12,
    }),
    prisma.member.findMany({
      where: { orgId: req.org.id, patrol: { not: null } },
      distinct: ["patrol"],
      select: { patrol: true },
      orderBy: { patrol: "asc" },
    }),
    prisma.subgroup.findMany({ where: { orgId: req.org.id }, orderBy: { name: "asc" } }),
  ]);

  const statusBlock = issue.status === "sent"
    ? `<div class="card" style="background:#bcd0f4;border:1px solid #1d4ed8"><strong>Sent ${escape(new Date(issue.publishedAt).toLocaleString("en-US"))}</strong>${issue.author ? ` by ${escape(issue.author.displayName)}` : ""}.${issue.mailLogId ? ` <a href="/admin/email/sent">See in mail history →</a>` : ""}</div>`
    : req.query.tested
      ? `<div class="flash flash-ok">Test sent to ${escape(req.user.email)}. Check your inbox to see the families' view.</div>`
      : "";

  const composerBody = newsletterComposerHtml({
    title: issue.title,
    intro: issue.intro,
    posts,
    events,
    pastEvents,
    audience: issue.audience,
    audiencePatrol: issue.audiencePatrol || "",
    visibility: issue.visibility,
    selectedPostIds: issue.includedPostIds,
    selectedEventIds: issue.includedEventIds,
    patrols,
    subgroups,
    formAction: `/admin/newsletters/${escape(issue.id)}`,
    submitLabel: issue.status === "sent" ? "Save edits (already sent)" : "Save draft",
    statusBlock,
    deleteAction: issue.status === "sent" ? null : `/admin/newsletters/${escape(issue.id)}/delete`,
    sendAction: issue.status === "sent" ? null : `/admin/newsletters/${escape(issue.id)}/send`,
    previewLink: `/admin/newsletters/${escape(issue.id)}/preview`,
    readonly: issue.status === "sent",
  });

  res.type("html").send(layout(req, { title: "Edit newsletter", body: composerBody }));
});

adminRouter.post("/newsletters/:id", requireLeader, async (req, res) => {
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, status: true },
  });
  if (!issue) return res.status(404).send("Not found");
  if (issue.status === "sent") {
    // Allow editing the title/intro on a sent issue (fix typos in the
    // archive) but never re-send. Audience/recipient state is frozen.
    const data = newsletterFromBody(req.body);
    await prisma.newsletter.update({
      where: { id: issue.id },
      data: { title: data.title, intro: data.intro, visibility: data.visibility },
    });
    return res.redirect(`/admin/newsletters/${issue.id}/edit`);
  }
  const data = newsletterFromBody(req.body);
  await prisma.newsletter.update({
    where: { id: issue.id },
    data,
  });
  res.redirect(`/admin/newsletters/${issue.id}/edit`);
});

adminRouter.post("/newsletters/:id/delete", requireLeader, async (req, res) => {
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, status: true, title: true },
  });
  if (!issue || issue.status === "sent") return res.redirect("/admin/newsletters");
  await prisma.newsletter.delete({ where: { id: issue.id } });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Newsletter",
    entityId: issue.id,
    action: "delete",
    summary: issue.title,
  });
  res.redirect("/admin/newsletters");
});

adminRouter.get("/newsletters/:id/preview", requireLeader, async (req, res) => {
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!issue) return res.status(404).send("Not found");
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
  // Re-sort to match the included-id order so the leader sees what they
  // composed, not whatever the DB returns.
  const orderedPosts = issue.includedPostIds
    .map((id) => posts.find((p) => p.id === id))
    .filter(Boolean);
  const orderedEvents = issue.includedEventIds
    .map((id) => events.find((e) => e.id === id))
    .filter(Boolean);
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const baseUrl = `https://${req.org.slug}.${apex}`;
  const { html } = renderNewsletterHtml({
    org: req.org,
    newsletter: issue,
    posts: orderedPosts,
    events: orderedEvents,
    baseUrl,
  });
  res.type("html").send(html);
});

// Send a single test copy of the newsletter to the leader's own email
// so they can see what families will see before broadcasting. Doesn't
// log a MailLog row, doesn't flip status, doesn't audit — it's a
// preview, not a publish.
adminRouter.post("/newsletters/:id/test-send", requireLeader, async (req, res) => {
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!issue) return res.status(404).send("Not found");
  if (!req.user.email) return res.status(400).type("text/plain").send("No email on your account.");

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
  const orderedPosts = issue.includedPostIds.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
  const orderedEvents = issue.includedEventIds.map((id) => events.find((e) => e.id === id)).filter(Boolean);

  const apex = process.env.APEX_DOMAIN || "compass.app";
  const baseUrl = `https://${req.org.slug}.${apex}`;
  const { html, text } = renderNewsletterHtml({
    org: req.org,
    newsletter: issue,
    posts: orderedPosts,
    events: orderedEvents,
    baseUrl,
  });
  const fromName = req.org.displayName.replace(/[<>"]/g, "");
  await sendBatch([
    {
      to: req.user.email,
      subject: `[TEST] ${issue.title}`,
      text: `(This is a test send to your own address. Family broadcasts go out via "Send now" on the newsletter page.)\n\n${text}`,
      html: html.replace(
        "</body>",
        `<p style="font-size:11px;color:#64748b;text-align:center;margin-top:18px;padding:.6rem;background:#f7f8fa;border-radius:6px">This is a test send to your own address. The audience copy goes out when you hit <strong>Send now</strong>.</p></body>`,
      ),
      from: `${fromName} <noreply@${req.org.slug}.${apex}>`,
      replyTo: req.user.email,
    },
  ]);
  res.redirect(`/admin/newsletters/${issue.id}/edit?tested=1`);
});

adminRouter.post("/newsletters/:id/send", requireLeader, async (req, res) => {
  const issue = await prisma.newsletter.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
  });
  if (!issue) return res.status(404).send("Not found");
  if (issue.status === "sent") return res.redirect(`/admin/newsletters/${issue.id}/edit`);

  // Resolve included posts + events at send time (fresh URLs / titles).
  const [posts, events, recipients] = await Promise.all([
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
    audienceFor(req.org.id, issue.audience, issue.audiencePatrol),
  ]);

  const orderedPosts = issue.includedPostIds
    .map((id) => posts.find((p) => p.id === id))
    .filter(Boolean);
  const orderedEvents = issue.includedEventIds
    .map((id) => events.find((e) => e.id === id))
    .filter(Boolean);

  const emailRecipients = emailableMembers(recipients);
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const orgHost = `${req.org.slug}.${apex}`;
  const baseUrl = `https://${orgHost}`;
  const mailLogId = newMailLogId();
  const { html, text } = renderNewsletterHtml({
    org: req.org,
    newsletter: issue,
    posts: orderedPosts,
    events: orderedEvents,
    baseUrl,
  });

  const fromAddr = `noreply@${orgHost}`;
  const fromName = `${req.org.displayName.replace(/[<>"]/g, "")}`;
  const messages = emailRecipients.map((m) => {
    const token = makeUnsubToken({ memberId: m.id, orgId: req.org.id });
    const unsubUrl = `${baseUrl}/unsubscribe/${token}`;
    const headers = {
      "List-Unsubscribe": `<${unsubUrl}?one_click=1>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    const personalText = `${text}\n\nUnsubscribe: ${unsubUrl}`;
    const personalHtml = html.replace(
      "</body>",
      `<p style="font-size:11px;color:#64748b;text-align:center;margin-top:18px"><a href="${escape(unsubUrl)}" style="color:#64748b">Unsubscribe</a></p></body>`,
    );
    return trackEmail({
      baseUrl,
      mailLogId,
      recipient: m.email,
      to: m.email,
      subject: issue.title,
      text: personalText,
      html: personalHtml,
      from: `${fromName} <${fromAddr}>`,
      replyTo: req.user.email,
      headers,
    });
  });

  const result = messages.length
    ? await sendBatch(messages)
    : { sent: 0, errors: [] };

  // Record a MailLog row so the newsletter shows up in /admin/email/sent
  // alongside one-off broadcasts. Recipient snapshot keeps history honest
  // even if the directory changes later.
  const mailLog = await prisma.mailLog.create({
    data: {
      id: mailLogId,
      orgId: req.org.id,
      authorId: req.user.id,
      subject: issue.title,
      body: issue.intro,
      channel: "email",
      audienceLabel: describeNewsletterAudience(issue),
      recipientCount: result.sent,
      status: result.errors.length ? (result.sent ? "partial" : "failed") : "sent",
      errors: result.errors.length ? JSON.stringify(result.errors) : null,
      recipients: emailRecipients.map((m) => ({
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        channel: "email",
      })),
    },
  });

  await prisma.newsletter.update({
    where: { id: issue.id },
    data: {
      status: "sent",
      publishedAt: new Date(),
      mailLogId: mailLog.id,
    },
  });

  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Newsletter",
    entityId: issue.id,
    action: "send",
    summary: `${issue.title} → ${result.sent} recipient${result.sent === 1 ? "" : "s"}`,
  });

  res.redirect(`/admin/newsletters/${issue.id}/edit`);
});

function describeNewsletterAudience(n) {
  if (n.audience === "patrol") return `Patrol: ${n.audiencePatrol || "—"}`;
  if (typeof n.audience === "string" && n.audience.startsWith("subgroup:")) return `Subgroup`;
  if (n.audience === "adults") return "Adults";
  if (n.audience === "youth") return "Youth";
  return "Everyone";
}

function newsletterFromBody(body) {
  const title = String(body?.title || "").trim().slice(0, 200);
  const intro = String(body?.intro || "").trim().slice(0, 5000);
  const audience = String(body?.audience || "everyone");
  const audiencePatrol = audience === "patrol" ? String(body?.audiencePatrol || "").trim() || null : null;
  const visibility = NEWSLETTER_VISIBILITY.includes(body?.visibility) ? body.visibility : "members";
  const includedPostIds = Array.isArray(body?.includedPostIds)
    ? body.includedPostIds.filter((s) => typeof s === "string" && s.length)
    : typeof body?.includedPostIds === "string"
      ? [body.includedPostIds]
      : [];
  const includedEventIds = Array.isArray(body?.includedEventIds)
    ? body.includedEventIds.filter((s) => typeof s === "string" && s.length)
    : typeof body?.includedEventIds === "string"
      ? [body.includedEventIds]
      : [];
  return {
    title,
    intro,
    audience,
    audiencePatrol,
    visibility,
    includedPostIds,
    includedEventIds,
  };
}

function newsletterComposerHtml({
  title,
  intro,
  posts,
  events,
  pastEvents = [],
  audience,
  audiencePatrol,
  visibility,
  selectedPostIds,
  selectedEventIds,
  patrols,
  subgroups,
  formAction,
  submitLabel,
  statusBlock,
  deleteAction,
  sendAction,
  previewLink,
  readonly = false,
}) {
  const selPosts = new Set(selectedPostIds);
  const selEvents = new Set(selectedEventIds);
  const audSel = (v) => (audience === v ? " selected" : "");
  const subSel = (id) => (audience === `subgroup:${id}` ? " selected" : "");
  const patrolOpts = patrols
    .map((p) => `<option value="${escape(p.patrol)}"${audiencePatrol === p.patrol ? " selected" : ""}>${escape(p.patrol)}</option>`)
    .join("");
  const subgroupOpts = subgroups
    .map((g) => `<option value="subgroup:${escape(g.id)}"${subSel(g.id)}>${escape(g.name)}</option>`)
    .join("");
  const fmtDate = (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const postChecks = posts.length
    ? posts
        .map(
          (p) => `
          <label class="row" style="align-items:flex-start;gap:.6rem;padding:.4rem 0;border-top:1px solid #eef0e7">
            <input type="checkbox" name="includedPostIds" value="${escape(p.id)}"${selPosts.has(p.id) ? " checked" : ""}${readonly ? " disabled" : ""} style="margin-top:.25rem">
            <span style="flex:1">
              <strong>${escape(p.title || "(untitled)")}</strong>
              <span class="muted small"> · ${escape(fmtDate(p.publishedAt))}${p.author?.displayName ? ` · ${escape(p.author.displayName)}` : ""}</span>
            </span>
          </label>`,
        )
        .join("")
    : `<p class="muted small">No posts in the lookback window.</p>`;
  const renderEventCheckRow = (e) => `
          <label class="row" style="align-items:flex-start;gap:.6rem;padding:.4rem 0;border-top:1px solid #eef0e7">
            <input type="checkbox" name="includedEventIds" value="${escape(e.id)}"${selEvents.has(e.id) ? " checked" : ""}${readonly ? " disabled" : ""} style="margin-top:.25rem">
            <span style="flex:1">
              <strong>${escape(e.title)}</strong>
              <span class="muted small"> · ${escape(fmtDate(e.startsAt))}${e.location ? ` · ${escape(e.location)}` : ""}</span>
            </span>
          </label>`;
  const eventChecks = events.length
    ? events.map(renderEventCheckRow).join("")
    : `<p class="muted small">Nothing on the calendar yet.</p>`;
  const pastEventChecks = pastEvents.length
    ? pastEvents.map(renderEventCheckRow).join("")
    : `<p class="muted small">No recent events to recap.</p>`;

  return `
    <a class="back" href="/admin/newsletters" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Newsletters</a>
    <h1>${readonly ? "Newsletter" : "Compose newsletter"}</h1>
    ${statusBlock || ""}
    <form class="card" method="post" action="${formAction}">
      <label>Title<input name="title" type="text" required maxlength="200" value="${escape(title)}"${readonly ? " readonly" : ""}></label>
      <label>Intro <span class="muted small">(markdown supported)</span>
        <textarea name="intro" rows="5" maxlength="5000"${readonly ? " readonly" : ""}>${escape(intro)}</textarea>
      </label>
      <div class="row">
        <label style="margin:0;flex:1">Audience
          <select name="audience"${readonly ? " disabled" : ""}>
            <option value="everyone"${audSel("everyone")}>Everyone</option>
            <option value="adults"${audSel("adults")}>Adults only</option>
            <option value="youth"${audSel("youth")}>Youth only</option>
            <option value="patrol"${audSel("patrol")}>Specific patrol</option>
            ${subgroups.length ? `<optgroup label="Saved subgroups">${subgroupOpts}</optgroup>` : ""}
          </select>
        </label>
        <label style="margin:0;flex:1">Patrol (if "Specific patrol")
          <select name="audiencePatrol"${readonly ? " disabled" : ""}>
            <option value="">—</option>
            ${patrolOpts}
          </select>
        </label>
        <label style="margin:0;flex:1">Public archive
          <select name="visibility"${readonly ? " disabled" : ""}>
            <option value="members"${visibility === "members" ? " selected" : ""}>Members only</option>
            <option value="public"${visibility === "public" ? " selected" : ""}>Public</option>
          </select>
        </label>
      </div>

      <h3 style="margin-top:1.5rem">Recent posts to include</h3>
      ${postChecks}

      <h3 style="margin-top:1.5rem">Recent events to recap <span class="muted small" style="font-weight:400">(things that already happened)</span></h3>
      ${pastEventChecks}

      <h3 style="margin-top:1.5rem">Upcoming events to include</h3>
      ${eventChecks}

      <div class="row" style="margin-top:1.25rem">
        ${!readonly ? `<button class="btn btn-primary" type="submit">${escape(submitLabel)}</button>` : ""}
        ${previewLink ? `<a class="btn btn-ghost" href="${previewLink}" target="_blank" rel="noopener">Preview</a>` : ""}
      </div>
    </form>

    ${
      sendAction || deleteAction
        ? `<div class="row" style="margin-top:.6rem">
            ${sendAction ? `<form class="inline" method="post" action="${sendAction.replace(/\/send$/, "/test-send")}">
              <button class="btn btn-ghost" type="submit" title="Send a single copy to your address — won't go to families.">Send a test to me</button>
            </form>` : ""}
            ${sendAction ? `<form class="inline" method="post" action="${sendAction}" onsubmit="return confirm('Send this newsletter to the audience now?')">
              <button class="btn btn-primary" type="submit">Send now</button>
            </form>` : ""}
            ${deleteAction ? `<form class="inline" method="post" action="${deleteAction}" onsubmit="return confirm('Delete this draft? This cannot be undone.')">
              <button class="btn btn-danger" type="submit">Delete draft</button>
            </form>` : ""}
          </div>
          <p class="muted small" style="margin-top:.4rem">${sendAction ? "Send-now uses the most recent saved state. Edit and save first if you want changes to land in the email. The test sends one copy to your own email so you can see what families will see." : ""}</p>`
        : ""
    }
  `;
}

/* ------------------------------------------------------------------ */
/* Group chat — admin oversight                                        */
/* ------------------------------------------------------------------ */

function channelKindLabel(kind) {
  return ({
    patrol: "Patrol",
    troop: "All members",
    parents: "Parents",
    leaders: "Leaders only",
    event: "Event",
    custom: "Custom",
  })[kind] || kind;
}

function channelStatusBadge(c) {
  if (c.archivedAt) {
    return `<span class="tag" style="opacity:.6">archived</span>`;
  }
  if (c.isSuspended) {
    return `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">suspended${c.suspendedReason ? `: ${escape(c.suspendedReason.replace(/-/g, " "))}` : ""}</span>`;
  }
  return `<span class="tag" style="background:#bcd0f4;border-color:#1d4ed8;color:#0f172a">active</span>`;
}

adminRouter.get("/channels", requireLeader, async (req, res) => {
  const channels = await prisma.channel.findMany({
    where: { orgId: req.org.id },
    orderBy: [{ kind: "asc" }, { archivedAt: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { members: true, messages: true } },
    },
  });

  // Fetch the latest message timestamp for each channel in one round-trip.
  const lastByChannel = await prisma.message.groupBy({
    by: ["channelId"],
    where: { channelId: { in: channels.map((c) => c.id) } },
    _max: { createdAt: true },
  });
  const lastMap = new Map(
    lastByChannel.map((r) => [r.channelId, r._max.createdAt]),
  );

  const overdueArchivedRaw = await archiveEndedEventChannels({
    prismaClient: prisma,
  });
  const archivedNote = overdueArchivedRaw.archived
    ? `<p class="muted small" style="margin:.4rem 0">Auto-archived ${overdueArchivedRaw.archived} event channel${overdueArchivedRaw.archived === 1 ? "" : "s"} whose event ended &gt; 24 hours ago.</p>`
    : "";

  const fmtRel = (d) => {
    if (!d) return "—";
    const ms = Date.now() - new Date(d).getTime();
    if (ms < 60_000) return "just now";
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  };

  const groups = {};
  for (const c of channels) {
    const k = c.kind;
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }

  const renderRow = (c) => `
    <li>
      <div style="flex:1">
        <h3 style="margin:0">
          <a href="/admin/channels/${escape(c.id)}">${escape(c.name)}</a>
          ${channelStatusBadge(c)}
        </h3>
        <p class="muted small" style="margin:.1rem 0 0">
          ${c._count.members} member${c._count.members === 1 ? "" : "s"}
          · ${c._count.messages} message${c._count.messages === 1 ? "" : "s"}
          · last ${escape(fmtRel(lastMap.get(c.id)))}
          ${c.patrolName ? ` · ${escape(c.patrolName)} patrol` : ""}
        </p>
      </div>
      <a class="btn btn-ghost small" href="/admin/channels/${escape(c.id)}">Open</a>
    </li>`;

  const sectionFor = (kind, label) =>
    groups[kind] && groups[kind].length
      ? `<h2 style="margin-top:1.5rem">${escape(label)} <span class="muted small" style="font-weight:400">(${groups[kind].length})</span></h2>
         <ul class="items">${groups[kind].map(renderRow).join("")}</ul>`
      : "";

  const body = `
    <h1>Channels</h1>
    <p class="muted">Group chat oversight. Channels are auto-managed: <strong>troop / parents / leaders</strong> are global, <strong>patrol</strong> follows <code>Member.patrol</code>, <strong>event</strong> auto-archives 24h after the event ends. Manual additions and custom channels are listed below the auto-managed ones.</p>
    ${archivedNote}
    <p style="margin:.6rem 0 1rem">
      <a class="btn btn-primary" href="/admin/channels/provision" onclick="return confirm('Re-run channel auto-provisioning? Idempotent — adds anything missing, doesn\\'t remove anything.')">Provision standing channels</a>
      <a class="btn btn-ghost" href="/admin/ypt" style="margin-left:.4rem">Manage YPT status →</a>
    </p>
    ${sectionFor("troop", "All-members")}
    ${sectionFor("parents", channelKindLabel("parents"))}
    ${sectionFor("leaders", channelKindLabel("leaders"))}
    ${sectionFor("patrol", "Patrol channels")}
    ${sectionFor("event", "Event channels")}
    ${sectionFor("custom", "Custom channels")}
    ${channels.length === 0 ? `<div class="empty">No channels yet. Click <em>Provision standing channels</em> to create the troop / parents / leaders + per-patrol channels for this org.</div>` : ""}
  `;
  res.type("html").send(layout(req, { title: "Channels", body }));
});

adminRouter.get("/channels/provision", requireLeader, async (req, res) => {
  await provisionStandingChannels({ org: req.org, prismaClient: prisma });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Channel",
    action: "provision",
    summary: "Standing channels reconciled",
  });
  res.redirect("/admin/channels");
});

adminRouter.get("/channels/:id", requireLeader, async (req, res) => {
  const channel = await prisma.channel.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              memberships: {
                where: { orgId: req.org.id },
                select: { role: true, yptCurrentUntil: true },
              },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!channel) return res.status(404).send("Not found");

  const messages = await prisma.message.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: { select: { displayName: true } } },
  });

  const yptCheck = await checkChannelTwoDeep(channel.id, { prismaClient: prisma });

  const memberRows = channel.members
    .map((cm) => {
      const om = cm.user.memberships[0];
      const role = om?.role || "—";
      const yptOk = role === "leader" || role === "admin"
        ? om?.yptCurrentUntil && new Date(om.yptCurrentUntil) > new Date()
        : null;
      const yptBadge = yptOk === null
        ? ""
        : yptOk
          ? `<span class="tag" style="background:#bcd0f4;border-color:#1d4ed8;color:#0f172a">YPT current</span>`
          : `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">YPT expired/missing</span>`;
      return `
        <li>
          <div style="flex:1">
            <strong>${escape(cm.user.displayName)}</strong>
            <span class="tag">${escape(role)}</span>
            ${yptBadge}
            ${cm.role === "moderator" ? `<span class="tag">moderator</span>` : ""}
            ${!cm.addedAutomatically ? `<span class="tag">manual</span>` : ""}
            <div class="muted small">${escape(cm.user.email)}</div>
          </div>
        </li>`;
    })
    .join("");

  const messageRows = messages.length
    ? messages
        .reverse()
        .map(
          (m) => `
        <li>
          <div style="flex:1">
            <strong>${escape(m.author?.displayName || "(system)")}</strong>
            <span class="muted small">${escape(new Date(m.createdAt).toLocaleString("en-US"))}</span>
            <p style="margin:.2rem 0 0">${m.deletedAt ? `<em class="muted">(deleted)</em>` : escape(m.body)}</p>
          </div>
        </li>`,
        )
        .join("")
    : `<p class="muted small">No messages yet.</p>`;

  const yptBlock = yptCheck.ok
    ? `<p class="muted small">YPT: ${yptCheck.hasYouth ? `${yptCheck.currentAdultCount} current adults watching this youth-containing channel.` : `Channel contains no youth — two-deep check skipped.`}</p>`
    : `<p style="background:#fbe8e3;border:1px solid #f0bcb1;border-radius:8px;padding:.65rem .85rem;color:#7d2614">
         <strong>YPT compliance:</strong> ${escape(yptCheck.reason.replace(/-/g, " "))}.
         The channel is suspended until two YPT-current adult leaders are members.
         Adjust YPT dates on <a href="/admin/ypt">Manage YPT status</a>.
       </p>`;

  const actionForms = channel.archivedAt
    ? `<p class="muted small">Archived ${escape(new Date(channel.archivedAt).toLocaleDateString("en-US"))}.</p>`
    : `
      <form class="inline" method="post" action="/admin/channels/${escape(channel.id)}/${channel.isSuspended ? "unsuspend" : "suspend"}">
        <button class="btn ${channel.isSuspended ? "btn-primary" : "btn-danger"} small" type="submit">${channel.isSuspended ? "Unsuspend" : "Suspend"}</button>
      </form>
      ${channel.kind === "custom" ? `<form class="inline" method="post" action="/admin/channels/${escape(channel.id)}/archive" onsubmit="return confirm('Archive this channel? Members will no longer see it.')">
        <button class="btn btn-ghost small" type="submit">Archive</button>
      </form>` : ""}
    `;

  const body = `
    <a class="back" href="/admin/channels" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Channels</a>
    <h1>${escape(channel.name)}</h1>
    <p class="muted">
      <span class="tag">${escape(channelKindLabel(channel.kind))}</span>
      ${channelStatusBadge(channel)}
      ${channel.patrolName ? ` · ${escape(channel.patrolName)} patrol` : ""}
      ${channel.eventId ? ` · linked to event` : ""}
    </p>
    ${yptBlock}
    <div class="row" style="margin:.6rem 0 1rem">${actionForms}</div>

    <form class="card" method="post" action="/admin/channels/${escape(channel.id)}/post-policy">
      <h3 style="margin-top:0">Who can post here?</h3>
      <p class="muted small">Adult leaders + admins always pass; this gate scopes everyone else. ${
        channel.kind === "patrol"
          ? `For patrol channels, "section" lets only ${escape(channel.patrolName || "patrol")} members post — useful so the Tiger Den parent doesn't post in the Wolf Den channel.`
          : channel.patrolName
            ? `Section policy keys off this channel's patrolName: ${escape(channel.patrolName)}.`
            : `"Section" needs a patrolName — this channel doesn't have one, so it falls back to "members" semantics.`
      }</p>
      ${POST_POLICIES.map(
        (p) => `
        <label style="display:flex;align-items:flex-start;gap:.6rem;margin:0 0 .55rem;font-weight:400">
          <input type="radio" name="postPolicy" value="${escape(p)}" ${channel.postPolicy === p ? "checked" : ""} style="width:auto;margin-top:.25rem;margin-right:0">
          <span><strong>${escape(POST_POLICY_LABELS[p])}</strong></span>
        </label>`,
      ).join("")}
      <div class="row" style="margin-top:.5rem">
        <button class="btn btn-primary small" type="submit">Save policy</button>
      </div>
    </form>

    <h2>Members <span class="muted small" style="font-weight:400">(${channel.members.length})</span></h2>
    <ul class="items">${memberRows || `<li class="empty">No members yet — try <a href="/admin/channels/provision">re-provisioning</a>.</li>`}</ul>

    <h2 style="margin-top:1.5rem">Recent messages <span class="muted small" style="font-weight:400">(last 50)</span></h2>
    <ul class="items">${messageRows}</ul>
  `;
  res.type("html").send(layout(req, { title: channel.name, body }));
});

adminRouter.post("/channels/:id/post-policy", requireLeader, async (req, res) => {
  const channel = await prisma.channel.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, postPolicy: true, name: true },
  });
  if (!channel) return res.status(404).send("Not found");
  let next;
  try {
    next = normalisePostPolicy(req.body?.postPolicy);
  } catch (e) {
    return res.status(400).type("text/plain").send(e.message);
  }
  if (next === channel.postPolicy) {
    return res.redirect(`/admin/channels/${channel.id}`);
  }
  await prisma.channel.update({
    where: { id: channel.id },
    data: { postPolicy: next },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Channel",
    entityId: channel.id,
    action: "update",
    summary: `Post policy: ${channel.postPolicy} → ${next} (${channel.name})`,
  });
  res.redirect(`/admin/channels/${channel.id}`);
});

adminRouter.post("/channels/:id/suspend", requireLeader, async (req, res) => {
  const channel = await prisma.channel.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true },
  });
  if (!channel) return res.status(404).send("Not found");
  await suspendChannel(channel.id, "manual", {
    prismaClient: prisma,
    org: req.org,
    user: req.user,
  });
  res.redirect(`/admin/channels/${channel.id}`);
});

adminRouter.post("/channels/:id/unsuspend", requireLeader, async (req, res) => {
  const channel = await prisma.channel.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, kind: true },
  });
  if (!channel) return res.status(404).send("Not found");
  // Re-check before lifting — if YPT still doesn't pass, refuse.
  const check = await checkChannelTwoDeep(channel.id, { prismaClient: prisma });
  if (!check.ok) {
    return res
      .status(409)
      .type("html")
      .send(
        layout(req, {
          title: "Can't unsuspend",
          body: `<h1>Can't unsuspend</h1>
            <p>This channel still doesn't meet two-deep: <strong>${escape(check.reason.replace(/-/g, " "))}</strong>.</p>
            <p>Add a second YPT-current adult leader to the channel before unsuspending.</p>
            <p><a class="btn btn-ghost" href="/admin/channels/${escape(channel.id)}">← Back</a></p>`,
        }),
      );
  }
  await unsuspendChannel(channel.id, {
    prismaClient: prisma,
    org: req.org,
    user: req.user,
  });
  res.redirect(`/admin/channels/${channel.id}`);
});

adminRouter.post("/channels/:id/archive", requireLeader, async (req, res) => {
  const channel = await prisma.channel.findFirst({
    where: { id: req.params.id, orgId: req.org.id },
    select: { id: true, kind: true, name: true },
  });
  if (!channel) return res.status(404).send("Not found");
  if (channel.kind !== "custom" && channel.kind !== "event") {
    return res
      .status(400)
      .send("Only custom and event channels can be archived.");
  }
  await prisma.channel.update({
    where: { id: channel.id },
    data: { archivedAt: new Date() },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "Channel",
    entityId: channel.id,
    action: "archive",
    summary: channel.name,
  });
  res.redirect("/admin/channels");
});

/* ------------------------------------------------------------------ */
/* YPT status entry                                                    */
/* ------------------------------------------------------------------ */

adminRouter.get("/ypt", requireLeader, async (req, res) => {
  const memberships = await prisma.orgMembership.findMany({
    where: { orgId: req.org.id, role: { in: ["leader", "admin"] } },
    include: { user: { select: { id: true, email: true, displayName: true } } },
    orderBy: { user: { displayName: "asc" } },
  });
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const today = new Date();

  const rows = memberships
    .map((m) => {
      const expired = !m.yptCurrentUntil || new Date(m.yptCurrentUntil) <= today;
      const tag = !m.yptCurrentUntil
        ? `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">missing</span>`
        : expired
          ? `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">expired</span>`
          : new Date(m.yptCurrentUntil).getTime() - today.getTime() < 60 * 86400000
            ? `<span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">expiring &lt; 60d</span>`
            : `<span class="tag" style="background:#bcd0f4;border-color:#1d4ed8;color:#0f172a">current</span>`;
      return `
        <tr>
          <td><strong>${escape(m.user.displayName)}</strong>${tag}<br><span class="muted small">${escape(m.user.email)} · ${escape(m.role)}</span></td>
          <td>
            <form method="post" action="/admin/ypt/${escape(m.id)}" class="row" style="gap:.4rem">
              <input type="date" name="yptCurrentUntil" value="${escape(fmt(m.yptCurrentUntil))}" />
              <button class="btn btn-primary small" type="submit">Save</button>
              ${m.yptCurrentUntil ? `<button class="btn btn-ghost small" type="submit" name="clear" value="1">Clear</button>` : ""}
            </form>
          </td>
        </tr>`;
    })
    .join("");

  const body = `
    <a class="back" href="/admin/channels" style="display:inline-block;margin-bottom:.6rem;color:var(--ink-muted);text-decoration:none">← Channels</a>
    <h1>YPT status</h1>
    <p class="muted">Youth Protection Training expiration date per registered leader. Drives the two-deep guard on every chat-channel write where youth are present. Leader-entered for v1; the BSA training-roster scrape is a separate fight.</p>
    ${memberships.length ? `<table class="items" style="width:100%;border-collapse:collapse">
      <thead><tr><th style="text-align:left;padding:.4rem 0">Leader</th><th style="text-align:left;padding:.4rem 0">YPT current until</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<div class="empty">No leaders or admins in this org yet.</div>`}
  `;
  res.type("html").send(layout(req, { title: "YPT status", body }));
});

adminRouter.post("/ypt/:membershipId", requireLeader, async (req, res) => {
  const membership = await prisma.orgMembership.findFirst({
    where: { id: req.params.membershipId, orgId: req.org.id },
    select: { id: true, userId: true },
  });
  if (!membership) return res.status(404).send("Not found");
  const clear = req.body?.clear === "1";
  const raw = String(req.body?.yptCurrentUntil || "").trim();
  let yptCurrentUntil = null;
  if (!clear && raw) {
    const d = new Date(raw + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) {
      return res.redirect("/admin/ypt");
    }
    yptCurrentUntil = d;
  }
  await prisma.orgMembership.update({
    where: { id: membership.id },
    data: { yptCurrentUntil },
  });
  await recordAudit({
    org: req.org,
    user: req.user,
    entityType: "OrgMembership",
    entityId: membership.id,
    action: "ypt-update",
    summary: yptCurrentUntil ? `current until ${yptCurrentUntil.toISOString().slice(0, 10)}` : "cleared",
  });

  // Re-reconcile every channel this user belongs to so suspension state
  // tracks the new YPT date immediately.
  const channelMemberships = await prisma.channelMember.findMany({
    where: { userId: membership.userId },
    select: { channelId: true },
  });
  for (const cm of channelMemberships) {
    const ch = await prisma.channel.findUnique({
      where: { id: cm.channelId },
      select: { orgId: true },
    });
    if (ch?.orgId !== req.org.id) continue;
    const check = await checkChannelTwoDeep(cm.channelId, { prismaClient: prisma });
    if (!check.ok) {
      await suspendChannel(cm.channelId, check.reason, { prismaClient: prisma });
    } else {
      // Auto-clear suspension when YPT update restores two-deep.
      await prisma.channel.updateMany({
        where: { id: cm.channelId, isSuspended: true },
        data: { isSuspended: false, suspendedReason: null },
      });
    }
  }

  res.redirect("/admin/ypt");
});

/* ------------------------------------------------------------------ */
/* Billing — Stripe checkout + status page                             */
/* ------------------------------------------------------------------ */

// GET /admin/billing — read-only status + actions for the current org.
// Always reachable (passes the gate above) so a leader who hits an
// expired-trial wall can land here and fix it.
adminRouter.get("/billing", requireLeader, async (req, res) => {
  const state = deriveBillingStatus(req.org);
  const banner = billingBanner(state);
  const apex = process.env.APEX_DOMAIN || "compass.app";
  const blocked = req.query.blocked ? String(req.query.blocked) : null;
  const flash = req.query.success === "1"
    ? `<div class="flash flash-ok">Subscription activated. Thanks for supporting Compass!</div>`
    : req.query.canceled === "1"
    ? `<div class="flash flash-warn">Cancellation scheduled. You'll keep access until ${escape(state.status === "active" && req.org.currentPeriodEnd ? new Date(req.org.currentPeriodEnd).toLocaleDateString() : "the end of your billing period")}.</div>`
    : "";
  const blockedNotice = blocked
    ? `<div class="flash flash-err">That action requires an active subscription (status: <strong>${escape(blocked)}</strong>). Subscribe below to restore write access.</div>`
    : "";
  const bannerHtml = banner
    ? `<div class="flash flash-${banner.tone === "danger" ? "err" : banner.tone === "warn" ? "warn" : "ok"}"><strong>${escape(banner.headline)}</strong><br>${escape(banner.body)}</div>`
    : "";

  const trialRow = state.status === "trialing"
    ? `<tr><th>Trial ends</th><td>${escape(req.org.trialEndsAt ? new Date(req.org.trialEndsAt).toLocaleDateString() : "—")} (${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"} left)</td></tr>`
    : "";
  const periodRow = req.org.currentPeriodEnd
    ? `<tr><th>Current period ends</th><td>${escape(new Date(req.org.currentPeriodEnd).toLocaleDateString())}</td></tr>`
    : "";
  const cancelRow = req.org.cancelAtPeriodEnd
    ? `<tr><th>Scheduled to cancel</th><td>Yes — at the end of the current period.</td></tr>`
    : "";

  const stripeReady = stripeConfigured();
  const showSubscribe = state.status === "trialing" || state.status === "expired" || state.status === "canceled";
  const showCancel = state.status === "active" && !req.org.cancelAtPeriodEnd;
  const showReactivate = state.status === "active" && req.org.cancelAtPeriodEnd;

  const csrfToken = res.locals?.csrfToken || req.csrfToken?.() || "";
  const csrfHidden = `<input type="hidden" name="_csrf" value="${escape(csrfToken)}">`;

  const subscribeBtn = showSubscribe
    ? stripeReady
      ? `<form method="POST" action="/admin/billing/checkout">${csrfHidden}<button class="btn btn-primary" type="submit">Subscribe — $99 / year</button></form>`
      : `<p class="muted">Stripe isn't configured on this deployment. Set <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_PRICE_ID</code>, and <code>STRIPE_WEBHOOK_SECRET</code> to enable checkout.</p>`
    : "";
  const cancelBtn = showCancel
    ? `<form method="POST" action="/admin/billing/cancel" onsubmit="return confirm('Cancel at the end of the current period? You\\'ll keep access until then.')">${csrfHidden}<button class="btn btn-secondary" type="submit">Cancel subscription</button></form>`
    : "";
  const reactivateBtn = showReactivate
    ? `<form method="POST" action="/admin/billing/reactivate">${csrfHidden}<button class="btn btn-primary" type="submit">Resume subscription</button></form>`
    : "";

  const body = `
<h1>Billing</h1>
${bannerHtml}
${blockedNotice}
${flash}
<table class="kv">
  <tr><th>Unit</th><td>${escape(req.org.displayName)} (<code>${escape(req.org.slug)}.${escape(apex)}</code>)</td></tr>
  <tr><th>Status</th><td><strong>${escape(state.status)}</strong></td></tr>
  ${trialRow}
  ${periodRow}
  ${cancelRow}
</table>
<div class="actions" style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1.5rem">
  ${subscribeBtn}
  ${cancelBtn}
  ${reactivateBtn}
</div>
<h2 style="margin-top:2.5rem">What you get</h2>
<ul>
  <li>Your unit's subdomain at <code>${escape(req.org.slug)}.${escape(apex)}</code>, on for the year.</li>
  <li>Unlimited members, leaders, events, RSVPs, and broadcasts.</li>
  <li>50 GB photo library with per-scout privacy controls.</li>
  <li>Email + chat support during US business hours.</li>
</ul>
<p class="muted" style="margin-top:1.5rem">Need a council-wide plan? <a href="mailto:hello@compass.app?subject=Compass%20for%20our%20district">Email us</a> for multi-unit pricing.</p>
<style>
table.kv{border-collapse:collapse;margin-top:1rem}
table.kv th{text-align:left;padding:0.5rem 1rem 0.5rem 0;color:#5a6268;font-weight:600;vertical-align:top}
table.kv td{padding:0.5rem 0;vertical-align:top}
.muted{color:#5a6268;font-size:0.9rem}
</style>
`;
  res.type("html").send(layout(req, { title: "Billing", body }));
});

// POST /admin/billing/checkout — start a Stripe Checkout session.
adminRouter.post("/billing/checkout", requireLeader, async (req, res) => {
  if (!stripeConfigured()) {
    return res.redirect("/admin/billing?blocked=stripe_not_configured");
  }
  try {
    const apex = process.env.APEX_DOMAIN || "compass.app";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const portSuffix = process.env.PORT && process.env.NODE_ENV !== "production"
      ? `:${process.env.PORT}` : "";
    const base = `${protocol}://${req.org.slug}.${apex}${portSuffix}`;
    const { url } = await createCheckoutSession(req.org, req.user, {
      successUrl: `${base}/admin/billing?success=1`,
      cancelUrl: `${base}/admin/billing`,
    });
    return res.redirect(303, url);
  } catch (err) {
    return res.status(500).type("html").send(
      layout(req, {
        title: "Billing",
        body: `<h1>Couldn't start checkout</h1><p>${escape(err.message)}</p><p><a href="/admin/billing">← Back to billing</a></p>`,
      })
    );
  }
});

// POST /admin/billing/cancel — schedule cancel at period end.
adminRouter.post("/billing/cancel", requireLeader, async (req, res) => {
  try {
    await stripeCancel(req.org);
    await recordAudit({
      org: req.org,
      user: req.user,
      entityType: "Org",
      entityId: req.org.id,
      action: "billing.cancel_requested",
      summary: "Leader scheduled cancellation at period end.",
    });
    return res.redirect("/admin/billing?canceled=1");
  } catch (err) {
    return res.redirect(`/admin/billing?blocked=${encodeURIComponent(err.message)}`);
  }
});

// POST /admin/billing/reactivate — undo a pending cancellation.
adminRouter.post("/billing/reactivate", requireLeader, async (req, res) => {
  try {
    await stripeReactivate(req.org);
    await recordAudit({
      org: req.org,
      user: req.user,
      entityType: "Org",
      entityId: req.org.id,
      action: "billing.reactivated",
      summary: "Leader resumed an in-flight cancellation.",
    });
    return res.redirect("/admin/billing?success=1");
  } catch (err) {
    return res.redirect(`/admin/billing?blocked=${encodeURIComponent(err.message)}`);
  }
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
