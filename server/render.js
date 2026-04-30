/**
 * Render an org's site by injecting org + CMS data into the template.
 *
 * Tokens are HTML-escaped by default. Values wrapped with `raw(html)` are
 * inserted verbatim — used only for trusted server-built fragments that
 * may contain HTML (announcement list, demo banner, etc.).
 *
 * Future phases will pull more dynamic content (events, members, photos);
 * this file is the seam where that happens.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gcalAddUrl, outlookAddUrl, mapUrls } from "../lib/calendar.js";
import { buildShoppingList } from "../lib/shoppingList.js";
import { MEAL_DIETARY_TAGS, mealConflicts } from "../lib/dietary.js";
import { renderMarkdown } from "../lib/markdown.js";
import { scoutbookUrl } from "../lib/scoutbook.js";
import { parseVideoUrl } from "../lib/videoEmbed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "template", "site.html");

const RAW = Symbol("raw");
const raw = (html) => ({ [RAW]: html });

let cachedTemplate = null;
function loadTemplate() {
  if (!cachedTemplate || process.env.NODE_ENV !== "production") {
    cachedTemplate = fs.readFileSync(TEMPLATE_PATH, "utf8");
  }
  return cachedTemplate;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Plain-text → HTML: escape, preserve double-newlines as paragraph breaks
// and single-newlines as <br>.
// CMS bodies (Page, Announcement, Post, CustomPage, Event description,
// Comment) accept a small markdown subset. Plain-text content renders
// the same as it did before — markdown is a superset.
function textToHtml(s) {
  return renderMarkdown(s ?? "");
}

function renderGallery(albums) {
  if (!albums || albums.length === 0) {
    return `
  <section id="gallery" class="section">
    <div class="wrap">
      <header class="section-head">
        <h2>Photo gallery</h2>
        <p>Albums from your unit's events show up here.</p>
      </header>
      <p class="muted">No albums yet.</p>
    </div>
  </section>`;
  }

  const tiles = albums
    .map((a) => {
      const cover = a.photos[0];
      const thumb = cover
        ? `style="background:center/cover url('/uploads/${escapeHtml(cover.filename)}')"`
        : `style="background:linear-gradient(135deg,#1f3b22,#79a05a)"`;
      const date = a.takenAt
        ? a.takenAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "";
      return `
      <figure>
        <div class="thumb" ${thumb}></div>
        <figcaption>
          <strong>${escapeHtml(a.title)}</strong>
          <span>${a._count.photos} photo${a._count.photos === 1 ? "" : "s"}${
            date ? ` · ${escapeHtml(date)}` : ""
          }</span>
        </figcaption>
      </figure>`;
    })
    .join("");

  return `
  <section id="gallery" class="section">
    <div class="wrap">
      <header class="section-head">
        <h2>Photo gallery</h2>
        <p>Recent troop adventures.</p>
      </header>
      <div class="grid gallery">${tiles}</div>
    </div>
  </section>`;
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtTime(d) {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
function fmtDateLong(d) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function renderEvents(events) {
  if (!events || events.length === 0) {
    return `
  <section id="calendar" class="section alt">
    <div class="wrap">
      <header class="section-head">
        <h2>Upcoming events</h2>
        <p>Once you create events in the admin, they'll appear here automatically.</p>
      </header>
      <p class="muted">Nothing on the calendar yet.</p>
    </div>
  </section>`;
  }

  const items = events
    .slice(0, 8)
    .map((e) => {
      const d = new Date(e.startsAt);
      return `
    <li>
      <time datetime="${escapeHtml(d.toISOString())}">
        <span class="m">${escapeHtml(MONTH_SHORT[d.getMonth()])}</span>
        <span class="d">${d.getDate()}</span>
      </time>
      <div>
        <h3><a href="/events/${escapeHtml(e.id)}" style="color:inherit;text-decoration:none">${escapeHtml(e.title)}</a></h3>
        <p>${escapeHtml(fmtTime(e.startsAt))}${e.location ? ` · ${escapeHtml(e.location)}` : ""}</p>
      </div>
    </li>`;
    })
    .join("");

  return `
  <section id="calendar" class="section alt">
    <div class="wrap">
      <header class="section-head">
        <h2>Upcoming events</h2>
        <p>The next few weeks at a glance.</p>
      </header>
      <ul class="events">${items}</ul>
      <p class="cta-row">
        <a class="btn ghost" href="/events">All events →</a>
        <a class="btn ghost" href="/calendar.ics">Subscribe to calendar (.ics)</a>
      </p>
    </div>
  </section>`;
}

/* ------------------ Standalone event pages ------------------ */

function pageShell(org, title, body) {
  // Reuse the templated site's CSS (loaded via demo/styles.css served at /styles.css).
  // The shell here is a lightweight document; the home page uses the full template.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(org.displayName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<style>
:root{--green-700:${escapeHtml(org.primaryColor || "#1d6b39")};--gold:${escapeHtml(org.accentColor || "#caa54a")}}
.event-detail{padding:3rem 0}
.event-detail .meta{display:grid;grid-template-columns:120px 1fr;gap:.6rem 1.5rem;margin:1.5rem 0;color:var(--ink-700)}
.event-detail .meta dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-500);font-weight:600}
.event-detail .meta dd{margin:0;font-weight:500}
.event-detail .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0 2rem}
.rsvp-card{background:#fff;border:1px solid #eef0e7;border-radius:14px;padding:1.5rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 8px 24px rgba(15,58,31,.06);margin:1rem 0 2rem}
.rsvp-card h2{margin-top:0;font-size:1.4rem}
.rsvp-card form{margin-top:.75rem}
.rsvp-row{display:flex;gap:1rem;margin-bottom:.6rem}
.rsvp-row label{flex:1}
.rsvp-card label{display:block;font-size:.88rem;font-weight:500;color:var(--ink-700);margin-bottom:.55rem}
.rsvp-card input,.rsvp-card select,.rsvp-card textarea{display:block;width:100%;margin-top:.3rem;padding:.55rem .7rem;border:1px solid var(--ink-300);border-radius:8px;font:inherit;background:#fff;color:var(--ink-900)}
.rsvp-card input:focus,.rsvp-card select:focus,.rsvp-card textarea:focus{outline:2px solid var(--green-700);outline-offset:1px;border-color:var(--green-700)}
.rsvp-actions{display:flex;align-items:center;gap:.75rem;margin-top:.4rem}
.rsvp-counts{display:flex;gap:1.5rem;margin:.4rem 0 .8rem;color:var(--ink-700);font-size:.95rem}
.rsvp-counts strong{color:var(--ink-900)}
.rsvp-flash{padding:.55rem .85rem;border-radius:8px;margin-bottom:.8rem;font-size:.9rem}
.rsvp-flash-ok{background:#eaf6ec;border:1px solid #b9dec1;color:#15532b}
.rsvp-flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614}
.slots-list{list-style:none;padding:0;margin:.5rem 0 0;display:grid;gap:.6rem}
.slots-list li{background:#fbf8ee;border:1px solid #eef0e7;border-radius:10px;padding:.85rem 1rem;display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
.slots-list h3{margin:0 0 .15rem;font-size:1rem;font-family:Inter,sans-serif}
.slots-list p{margin:0;color:var(--ink-700);font-size:.92rem}
.slots-list .slot-head{flex:1;min-width:220px}
.slots-list .tag{display:inline-block;background:#fff;border:1px solid #eef0e7;padding:.05rem .4rem;border-radius:5px;font-size:.78rem;color:var(--ink-500);margin-left:.25rem}
.slot-action{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.slot-action.slot-anon{flex-direction:column;align-items:stretch;gap:.4rem;min-width:240px}
.slot-action.slot-anon input{padding:.45rem .6rem;border:1px solid var(--ink-300);border-radius:8px;font:inherit}
.slot-action button{padding:.5rem .9rem !important;font-size:.9rem !important}
.event-detail .map-actions{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem}
.event-detail .map-actions a{font-size:.85rem;padding:.4rem .7rem}
.event-detail .body{max-width:65ch;line-height:1.65}
.event-detail .body p{margin:0 0 1em}
.event-list{padding:3rem 0}
.event-list .events li time{background:var(--green-700)}
.back{display:inline-block;margin-bottom:1rem;color:var(--ink-500);text-decoration:none;font-size:.92rem}
.back:hover{color:var(--green-700)}
</style>
</head>
<body>
<header class="site-header">
  <div class="bar wrap">
    <a class="brand" href="/">
      ${
        org.logoFilename
          ? `<img class="brand-logo" src="/uploads/${escapeHtml(org.logoFilename)}" alt="${escapeHtml(org.displayName)} logo">`
          : `<span class="brand-mark" aria-hidden="true">${escapeHtml(org.unitNumber)}</span>`
      }
      <span class="brand-text"><strong>${escapeHtml(org.displayName)}</strong><small>Scouts BSA · ${escapeHtml(org.city)}, ${escapeHtml(org.state)}</small></span>
    </a>
    <nav class="nav"><ul>
      <li><a href="/#about">About</a></li>
      <li><a href="/events">Calendar</a></li>
      <li><a href="/#gallery">Photos</a></li>
      <li><a href="/#contact">Contact</a></li>
    </ul></nav>
  </div>
</header>
<main class="wrap">${body}</main>
</body>
</html>`;
}

function renderSlotsBlock({ event, slots, user, flash }) {
  if (!slots || slots.length === 0) return "";

  const myMatch = (a) =>
    (user && a.userId === user.id) ||
    (user && a.email && a.email === user.email?.toLowerCase()) ||
    false;

  const flashHtml = flash
    ? `<div class="rsvp-flash rsvp-flash-${escapeHtml(flash.type || "ok")}">${escapeHtml(flash.message)}</div>`
    : "";

  const items = slots
    .map((s) => {
      const active = s.assignments.filter((a) => !a.waitlisted);
      const waiting = s.assignments.filter((a) => a.waitlisted);
      const filled = active.length;
      const remaining = Math.max(0, s.capacity - filled);
      const mine = s.assignments.find(myMatch) || null;
      const myWaitPos = mine && mine.waitlisted
        ? waiting.findIndex((a) => a.id === mine.id) + 1
        : 0;

      const activeLine = active.length
        ? `<p class="muted small">Signed up: ${active.map((a) => escapeHtml(a.name)).join(", ")}</p>`
        : `<p class="muted small">No takers yet.</p>`;
      const waitLine = waiting.length
        ? `<p class="muted small">Waitlist: ${waiting.map((a) => escapeHtml(a.name)).join(", ")}</p>`
        : "";

      let actionHtml;
      if (mine) {
        const status = mine.waitlisted
          ? `On waitlist${myWaitPos ? ` · #${myWaitPos}` : ""}`
          : "You're signed up";
        actionHtml = `
          <form method="post" action="/events/${escapeHtml(event.id)}/slots/${escapeHtml(s.id)}/release" class="slot-action">
            ${user ? "" : `<input type="hidden" name="email" value="${escapeHtml(mine.email || "")}">`}
            <button class="btn ghost" type="submit">Remove me</button>
            <span class="muted small">${escapeHtml(status)}</span>
          </form>`;
      } else if (remaining === 0 && !s.allowWaitlist) {
        actionHtml = `<p class="muted small"><strong>Filled.</strong> Thanks to those who signed up.</p>`;
      } else {
        const ctaLabel = remaining === 0 ? "Join waitlist" : "I'll do it";
        const counter = remaining === 0
          ? `Full · ${waiting.length} on waitlist`
          : `${remaining} spot${remaining === 1 ? "" : "s"} left`;
        if (user) {
          actionHtml = `
            <form method="post" action="/events/${escapeHtml(event.id)}/slots/${escapeHtml(s.id)}/take" class="slot-action">
              <button class="btn primary" type="submit">${escapeHtml(ctaLabel)}</button>
              <span class="muted small">${escapeHtml(counter)}</span>
            </form>`;
        } else {
          actionHtml = `
            <form method="post" action="/events/${escapeHtml(event.id)}/slots/${escapeHtml(s.id)}/take" class="slot-action slot-anon">
              <input name="name" type="text" required maxlength="80" placeholder="Your name" autocomplete="name">
              <input name="email" type="email" required maxlength="120" placeholder="you@example.com" autocomplete="email">
              <button class="btn primary" type="submit">${escapeHtml(ctaLabel)}</button>
              <span class="muted small">${escapeHtml(counter)}</span>
            </form>`;
        }
      }

      return `
      <li>
        <div class="slot-head">
          <h3>${escapeHtml(s.title)}${
            s.capacity > 1 ? ` <span class="tag">${filled}/${s.capacity}</span>` : ""
          }${waiting.length ? ` <span class="tag">+${waiting.length} waiting</span>` : ""}</h3>
          ${s.description ? `<p>${escapeHtml(s.description)}</p>` : ""}
          ${activeLine}
          ${waitLine}
        </div>
        ${actionHtml}
      </li>`;
    })
    .join("");

  return `
    <div class="rsvp-card">
      <h2>Help wanted</h2>
      ${flashHtml}
      <p class="muted small" style="margin-top:0">Claim a slot — drivers, food, gear. No login required.</p>
      <ul class="slots-list">${items}</ul>
    </div>`;
}

export function renderEventDetail(org, e, ctx = {}) {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : null;
  const sameDay = end && start.toDateString() === end.toDateString();
  const when = e.allDay
    ? fmtDateLong(start) + (end && !sameDay ? ` – ${fmtDateLong(end)}` : "")
    : `${fmtDateLong(start)} · ${fmtTime(start)}${
        end ? (sameDay ? `–${fmtTime(end)}` : ` – ${fmtDateLong(end)} ${fmtTime(end)}`) : ""
      }`;

  const maps = mapUrls(e.locationAddress || e.location);
  const gcal = gcalAddUrl(e);
  const outlook = outlookAddUrl(e);

  const mapBlock = maps
    ? `<div class="map-actions">
        <a class="btn ghost" href="${escapeHtml(maps.google)}" target="_blank" rel="noopener">Google Maps</a>
        <a class="btn ghost" href="${escapeHtml(maps.apple)}" target="_blank" rel="noopener">Apple Maps</a>
        <a class="btn ghost" href="${escapeHtml(maps.waze)}" target="_blank" rel="noopener">Waze</a>
      </div>`
    : "";

  const counts = ctx.counts || { yes: 0, no: 0, maybe: 0, total: 0, totalGuests: 0 };
  const myRsvp = ctx.myRsvp || null;
  const user = ctx.user || null;
  const flash = ctx.flash || null;

  const rsvpBlock = renderRsvpBlock({ event: e, user, myRsvp, counts, flash });
  const slotsBlock = renderSlotsBlock({
    event: e,
    slots: ctx.slots,
    user,
    flash: ctx.slotFlash,
  });

  const body = `
  <section class="event-detail">
    <a class="back" href="/events">← All events</a>
    <h1>${escapeHtml(e.title)}</h1>
    ${e.category ? `<p class="muted small" style="margin-top:-.4rem">${escapeHtml(e.category)}</p>` : ""}

    ${rsvpBlock}
    ${slotsBlock}

    <div class="actions">
      <a class="btn primary" href="${escapeHtml(gcal)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      <a class="btn ghost" href="/events/${escapeHtml(e.id)}.ics">Add to Apple Calendar (.ics)</a>
      <a class="btn ghost" href="${escapeHtml(outlook)}" target="_blank" rel="noopener">Add to Outlook</a>
    </div>

    <dl class="meta">
      <dt>When</dt><dd>${escapeHtml(when)}</dd>
      ${
        e.location || e.locationAddress
          ? `<dt>Where</dt><dd>${e.location ? escapeHtml(e.location) : ""}${
              e.locationAddress ? `<br><span class="muted small">${escapeHtml(e.locationAddress)}</span>` : ""
            }${mapBlock}</dd>`
          : ""
      }
      ${e.cost != null ? `<dt>Cost</dt><dd>$${escapeHtml(String(e.cost))}</dd>` : ""}
      ${e.capacity != null ? `<dt>Capacity</dt><dd>${escapeHtml(String(e.capacity))} spots</dd>` : ""}
      ${e.signupRequired ? `<dt>Sign-up</dt><dd>Required</dd>` : ""}
    </dl>

    ${e.description ? `<div class="body">${textToHtml(e.description)}</div>` : ""}

    ${
      ctx.user
        ? `<p style="margin-top:1.25rem"><a class="btn ghost" href="/events/${escapeHtml(e.id)}/plan">View trip plan &amp; shopping list →</a></p>`
        : ""
    }

    <p class="muted small" style="margin-top:2rem">
      Want every event in your phone calendar? <a href="/calendar.ics">Subscribe to the troop's calendar feed</a>.
    </p>
  </section>`;
  return pageShell(org, e.title, body);
}

function renderRsvpBlock({ event, user, myRsvp, counts, flash }) {
  const summary = `
    <div class="rsvp-counts">
      <span><strong>${counts.yes}</strong> going${counts.totalGuests ? ` (+${counts.totalGuests} guests)` : ""}</span>
      <span><strong>${counts.maybe}</strong> maybe</span>
      <span><strong>${counts.no}</strong> can't make it</span>
    </div>`;

  const flashHtml = flash
    ? `<div class="rsvp-flash rsvp-flash-${escapeHtml(flash.type || "ok")}">${escapeHtml(flash.message)}</div>`
    : "";

  const cur = myRsvp?.response || "";
  const sel = (v) => (cur === v ? " selected" : "");
  const nameValue = escapeHtml(myRsvp?.name ?? user?.displayName ?? "");
  const emailValue = escapeHtml(myRsvp?.email ?? user?.email ?? "");
  const guestsValue = escapeHtml(String(myRsvp?.guests ?? 0));
  const notesValue = escapeHtml(myRsvp?.notes ?? "");

  // Anon users see name + email fields. Signed-in users get those
  // pre-filled (as hidden values; we read them server-side from req.user).
  const identityFields = user
    ? `<p class="muted small" style="margin:.2rem 0 .8rem">Signed in as <strong>${escapeHtml(user.displayName)}</strong> · <a href="/logout" onclick="event.preventDefault();fetch('/logout',{method:'POST'}).then(()=>location.reload())">sign out</a></p>`
    : `<div class="rsvp-row">
        <label>Your name<input name="name" type="text" required maxlength="80" value="${nameValue}" autocomplete="name"></label>
        <label>Email<input name="email" type="email" required maxlength="120" value="${emailValue}" autocomplete="email"></label>
      </div>
      <p class="muted small" style="margin:-.2rem 0 .8rem">Have an account? <a href="/login?next=/events/${escapeHtml(event.id)}">Sign in</a> to skip this.</p>`;

  return `
    <div class="rsvp-card">
      <h2>RSVP</h2>
      ${flashHtml}
      ${summary}
      <form method="post" action="/events/${escapeHtml(event.id)}/rsvp">
        ${identityFields}
        <div class="rsvp-row">
          <label>
            Your response
            <select name="response">
              <option value="yes"${sel("yes")}>Going</option>
              <option value="maybe"${sel("maybe")}>Maybe</option>
              <option value="no"${sel("no")}>Can't make it</option>
            </select>
          </label>
          <label>
            Guests
            <input name="guests" type="number" min="0" max="20" value="${guestsValue}">
          </label>
        </div>
        <label>
          Notes (dietary, what you're bringing, anything else)
          <textarea name="notes" rows="2" maxlength="500">${notesValue}</textarea>
        </label>
        <div class="rsvp-actions">
          <button class="btn primary" type="submit">${myRsvp ? "Update RSVP" : "Submit RSVP"}</button>
        </div>
      </form>
    </div>`;
}

export function renderForms(org, forms, { user, role } = {}) {
  const byCat = {};
  for (const f of forms) {
    const c = f.category || "Other";
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(f);
  }
  const groups = Object.keys(byCat)
    .sort()
    .map((cat) => {
      const items = byCat[cat]
        .map((f) => {
          const target = f.filename ? `/uploads/${escapeHtml(f.filename)}` : escapeHtml(f.url || "#");
          const sizeKb = f.sizeBytes ? Math.round(f.sizeBytes / 1024) : null;
          const ext = (f.mimeType || "").split("/").pop().toUpperCase();
          return `
            <li>
              <a href="${target}" target="_blank" rel="noopener">
                <strong>${escapeHtml(f.title)}</strong>
                ${f.visibility === "leaders" ? `<span class="tag">leaders</span>` : ""}
              </a>
              <span class="muted small">${
                f.filename ? `${escapeHtml(ext || "FILE")}${sizeKb ? ` · ${sizeKb} KB` : ""}` : "External link"
              }</span>
            </li>`;
        })
        .join("");
      return `<h2>${escapeHtml(cat)}</h2><ul class="forms-list">${items}</ul>`;
    })
    .join("");

  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Forms &amp; documents</h1>
      <p class="muted">${
        user && role
          ? "Documents available to members of " + escapeHtml(org.displayName) + "."
          : "Public documents only — sign in to see members-only files."
      }</p>
      ${forms.length ? groups : `<p class="muted">No documents yet.</p>`}
    </section>
    <style>
      .forms-list{list-style:none;padding:0;margin:0 0 1.5rem;display:grid;gap:.5rem}
      .forms-list li{background:#fff;border:1px solid #eef0e7;border-radius:10px;padding:.7rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
      .forms-list a{text-decoration:none;color:inherit}
      .forms-list a strong{color:var(--green-700)}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.05rem .4rem;border-radius:5px;font-size:.75rem;color:#6b7280;margin-left:.4rem}
    </style>`;
  return pageShell(org, "Forms & documents", body);
}

export function renderDirectory(org, members, { needsSignIn, notAMember, role } = {}) {
  if (needsSignIn) {
    const body = `
      <section class="event-list">
        <a class="back" href="/">← Home</a>
        <h1>Member directory</h1>
        <p class="muted">Sign in to view the family directory, contact info, and patrol rosters.</p>
        <p style="margin-top:1rem">
          <a class="btn primary" href="/admin/login?next=/members">Sign in</a>
        </p>
      </section>`;
    return pageShell(org, "Members", body);
  }
  if (notAMember) {
    const body = `
      <section class="event-list">
        <a class="back" href="/">← Home</a>
        <h1>Members only</h1>
        <p class="muted">Your account isn't connected to ${escapeHtml(org.displayName)}. Contact a current admin to be added.</p>
      </section>`;
    return pageShell(org, "Members", body);
  }

  const youth = (members || []).filter((m) => m.isYouth);
  const adults = (members || []).filter((m) => !m.isYouth);

  // Group youth under their first listed parent — most useful for parents
  // checking the directory. Youth without parents fall into "Unassigned."
  const adultsById = new Map(adults.map((a) => [a.id, a]));
  const familyMap = new Map();
  for (const a of adults) familyMap.set(a.id, { adult: a, kids: [] });
  const orphans = [];
  for (const y of youth) {
    const parentId = (y.parentIds || []).find((id) => adultsById.has(id));
    if (parentId) familyMap.get(parentId).kids.push(y);
    else orphans.push(y);
  }

  const renderMember = (m, opts = {}) => `
    <li${opts.indent ? ' class="indent"' : ""}>
      <div>
        <h3>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</h3>
        <p class="muted small">${
          m.position ? `${escapeHtml(m.position)} · ` : ""
        }${m.patrol ? `${escapeHtml(m.patrol)} patrol` : ""}${
          m.scoutbookUserId ? ` · <a href="https://scoutbook.scouting.org/" target="_blank" rel="noopener">Scoutbook ↗</a>` : ""
        }</p>
        ${
          (m.dietaryFlags || []).length
            ? `<p class="diet-flags">${m.dietaryFlags
                .map((f) => `<span class="tag tag-diet">${escapeHtml(f)}</span>`)
                .join("")}</p>`
            : ""
        }
      </div>
      <div>
        ${m.email ? `<a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a><br>` : ""}
        ${m.phone ? `<span class="muted small">${escapeHtml(m.phone)}</span>` : ""}
      </div>
    </li>`;
  const renderRow = renderMember;
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Member directory</h1>
      <p class="muted">${(members || []).length} on the roster · visible to ${escapeHtml(role)}s of ${escapeHtml(org.displayName)}.</p>
      ${
        familyMap.size
          ? `<h2 style="margin-top:1.5rem">Families</h2>
            <ul class="items">${[...familyMap.values()]
              .filter((f) => f.kids.length || f.adult)
              .map(
                (f) => `
                ${renderMember(f.adult)}
                ${f.kids.map((k) => renderMember(k, { indent: true })).join("")}`
              )
              .join("")}</ul>`
          : ""
      }
      ${
        orphans.length
          ? `<h2 style="margin-top:1.5rem">Other youth</h2><ul class="items">${orphans.map(renderRow).join("")}</ul>`
          : ""
      }
      ${(members || []).length === 0 ? `<p class="muted">No members yet.</p>` : ""}
    </section>
    <style>
      .event-list ul.items{list-style:none;padding:0;margin:0;display:grid;gap:.6rem}
      .event-list ul.items li{display:flex;gap:1.5rem;justify-content:space-between;align-items:flex-start;background:#fff;border:1px solid #eef0e7;border-radius:10px;padding:.85rem 1rem}
      .event-list ul.items li.indent{margin-left:1.5rem;background:#fbf8ee}
      .event-list ul.items h3{margin:0 0 .15rem;font-size:1rem;font-family:Inter,sans-serif}
      .event-list ul.items p{margin:0}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.1rem .45rem;border-radius:5px;font-size:.78rem;color:#6b7280;margin-right:.25rem}
      .tag-diet{background:#fff7e6;border-color:#ecd87a;color:#7d5a00}
      .diet-flags{margin:.3rem 0 0 !important}
    </style>`;
  return pageShell(org, "Members", body);
}

export function renderEventsList(org, events) {
  const items = events.length
    ? events
        .map((e) => {
          const d = new Date(e.startsAt);
          return `
    <li>
      <time datetime="${escapeHtml(d.toISOString())}">
        <span class="m">${escapeHtml(MONTH_SHORT[d.getMonth()])}</span>
        <span class="d">${d.getDate()}</span>
      </time>
      <div>
        <h3><a href="/events/${escapeHtml(e.id)}" style="color:inherit;text-decoration:none">${escapeHtml(e.title)}</a></h3>
        <p>${escapeHtml(fmtTime(e.startsAt))}${e.location ? ` · ${escapeHtml(e.location)}` : ""}${
            e.category ? ` · ${escapeHtml(e.category)}` : ""
          }</p>
      </div>
    </li>`;
        })
        .join("")
    : "";
  const body = `
  <section class="event-list">
    <a class="back" href="/">← Home</a>
    <h1>Upcoming events</h1>
    <p class="muted">All scheduled events — subscribe once and keep them in your phone calendar.</p>
    <p style="margin:1rem 0 2rem">
      <a class="btn primary" href="/calendar.ics">Subscribe to calendar (.ics)</a>
    </p>
    ${
      events.length
        ? `<ul class="events">${items}</ul>`
        : `<p class="muted">No upcoming events on the calendar.</p>`
    }
  </section>`;
  return pageShell(org, "Events", body);
}

function renderCommentBlock({ post, comments, user, role }) {
  const visible = (comments || []).filter((c) => !c.hidden || role === "admin" || role === "leader");
  const isLeader = role === "admin" || role === "leader";

  const items = visible
    .map(
      (c) => `
    <li class="comment${c.hidden ? " hidden" : ""}">
      <header>
        <strong>${escapeHtml(c.author?.displayName || "Member")}</strong>
        <span class="muted small"> · ${escapeHtml(
          new Date(c.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        )}</span>
        ${c.hidden ? `<span class="tag">hidden</span>` : ""}
      </header>
      <div class="body">${textToHtml(c.body)}</div>
      ${
        isLeader
          ? `<form class="inline" method="post" action="/posts/${escapeHtml(post.id)}/comments/${escapeHtml(c.id)}/${c.hidden ? "show" : "hide"}">
              <button class="link-btn" type="submit">${c.hidden ? "Unhide" : "Hide"}</button>
            </form>
            <form class="inline" method="post" action="/posts/${escapeHtml(post.id)}/comments/${escapeHtml(c.id)}/delete" onsubmit="return confirm('Delete this comment?')">
              <button class="link-btn danger" type="submit">Delete</button>
            </form>`
          : ""
      }
    </li>`
    )
    .join("");

  const form = user
    ? `<form method="post" action="/posts/${escapeHtml(post.id)}/comments" class="comment-form">
        <textarea name="body" rows="2" required maxlength="2000" placeholder="Write a comment…"></textarea>
        <button class="btn primary" type="submit">Post comment</button>
      </form>`
    : `<p class="muted small"><a href="/login?next=/posts/${escapeHtml(post.id)}">Sign in</a> to comment.</p>`;

  return `
    <section class="comments">
      <h2>${visible.length} comment${visible.length === 1 ? "" : "s"}</h2>
      ${visible.length ? `<ul class="comment-list">${items}</ul>` : ""}
      ${form}
    </section>`;
}

function renderPostCard(p, { showLink = true } = {}) {
  const date = p.publishedAt
    ? new Date(p.publishedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const photos = (p.photos || []).slice(0, 4);
  const photoGrid = photos.length
    ? `<div class="post-photos post-photos-${photos.length}">
         ${photos
           .map(
             (ph) => `<a href="/uploads/${escapeHtml(ph.filename)}" target="_blank" rel="noopener" aria-label="${escapeHtml(ph.caption || ph.originalName || "Open full-size photo")}"><img src="/uploads/${escapeHtml(
               ph.filename
             )}" alt="${escapeHtml(ph.caption || "")}" loading="lazy"></a>`
           )
           .join("")}
       </div>`
    : "";

  const titleHtml = p.title
    ? showLink
      ? `<h3><a href="/posts/${escapeHtml(p.id)}" style="color:inherit;text-decoration:none">${escapeHtml(p.title)}</a></h3>`
      : `<h3>${escapeHtml(p.title)}</h3>`
    : "";

  return `
    <article class="post${p.pinned ? " post-pinned" : ""}">
      ${p.pinned ? `<span class="badge">Pinned</span>` : ""}
      ${titleHtml}
      <div class="post-body">${textToHtml(p.body)}</div>
      ${photoGrid}
      <footer class="muted small">${escapeHtml(date)}${
        p.author?.displayName ? ` · ${escapeHtml(p.author.displayName)}` : ""
      }${
        showLink && p.title
          ? ` · <a href="/posts/${escapeHtml(p.id)}">Permalink</a>`
          : ""
      }</footer>
    </article>`;
}

function renderFeed(posts) {
  if (!posts || posts.length === 0) return "";
  const items = posts.map((p) => renderPostCard(p)).join("");
  return `
  <section id="feed" class="section">
    <div class="wrap">
      <header class="section-head">
        <h2>Latest from the troop</h2>
      </header>
      <div class="post-feed">${items}</div>
      <p class="cta-row" style="margin-top:1rem">
        <a class="btn ghost" href="/posts">All posts →</a>
      </p>
    </div>
  </section>`;
}

export function renderCustomPage(org, page) {
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>${escapeHtml(page.title)}</h1>
      <div class="prose" style="max-width:65ch;line-height:1.65">${textToHtml(page.body)}</div>
    </section>`;
  return pageShell(org, page.title, body);
}

export function renderEagleList(org, eagles, scoutbookByMemberId = new Map()) {
  const items = eagles.length
    ? `<ul class="eagle-list">${eagles
        .map((e) => {
          const sbId = e.memberId ? scoutbookByMemberId.get(e.memberId) : null;
          const sbLink = sbId
            ? ` · <a href="${escapeHtml(scoutbookUrl(sbId))}" target="_blank" rel="noopener">Scoutbook ↗</a>`
            : "";
          return `
        <li>
          <strong>${escapeHtml(e.firstName)} ${escapeHtml(e.lastName)}</strong>
          <span class="muted small"> · ${escapeHtml(
            new Date(e.earnedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          )}${sbLink}</span>
          ${e.projectName ? `<p class="muted small">${escapeHtml(e.projectName)}</p>` : ""}
        </li>`;
        })
        .join("")}</ul>`
    : `<p class="muted">No Eagles on the list yet.</p>`;
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Eagle Scouts of ${escapeHtml(org.displayName)}</h1>
      <p class="muted">${eagles.length} Eagle${eagles.length === 1 ? "" : "s"} since ${escapeHtml(org.founded || "the troop's founding")}.</p>
      ${items}
    </section>
    <style>
      .eagle-list{list-style:none;padding:0;margin:1.5rem 0;display:grid;gap:.5rem}
      .eagle-list li{background:#fff;border:1px solid #eef0e7;border-radius:10px;padding:.75rem 1rem}
      .eagle-list li p{margin:.2rem 0 0}
    </style>`;
  return pageShell(org, "Eagle Scouts", body);
}

export function renderMbcList(org, list) {
  const items = list.length
    ? `<ul class="mbc-list">${list
        .map(
          (c) => `
        <li>
          <h3>${escapeHtml(c.name)}</h3>
          <p class="muted small">
            ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : ""}
            ${c.phone ? ` · ${escapeHtml(c.phone)}` : ""}
          </p>
          ${
            c.badges.length
              ? `<p class="badges">${c.badges
                  .map((b) => `<span class="tag">${escapeHtml(b)}</span>`)
                  .join(" ")}</p>`
              : ""
          }
          ${c.notes ? `<p class="muted small">${escapeHtml(c.notes)}</p>` : ""}
        </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No counselors on the list yet.</p>`;
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Merit Badge Counselors</h1>
      <p class="muted">${escapeHtml(org.displayName)}'s preferred counselor list. Local — distinct from Scoutbook's national directory. Reach out directly to schedule.</p>
      ${items}
    </section>
    <style>
      .mbc-list{list-style:none;padding:0;margin:1.5rem 0;display:grid;gap:.6rem}
      .mbc-list li{background:#fff;border:1px solid #eef0e7;border-radius:10px;padding:.85rem 1rem}
      .mbc-list h3{margin:0;font-size:1rem}
      .mbc-list .badges{margin:.4rem 0 0}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.05rem .45rem;border-radius:5px;font-size:.78rem;color:var(--ink-500);margin-right:.2rem}
    </style>`;
  return pageShell(org, "Merit Badge Counselors", body);
}

export function renderVideoGallery(org, list, { isMember } = {}) {
  const cards = list
    .map((v) => {
      const meta = parseVideoUrl(v.url);
      const headerMeta = `${v.recordedAt ? `<span class="muted small"> · ${escapeHtml(new Date(v.recordedAt).toISOString().slice(0, 10))}</span>` : ""}${
        v.visibility === "members" ? ` <span class="tag">members</span>` : ""
      }`;
      const noteHtml = v.notes ? `<p class="muted small">${escapeHtml(v.notes)}</p>` : "";

      if (meta && (meta.kind === "youtube" || meta.kind === "vimeo")) {
        return `
          <article class="vid-card">
            <div class="vid-frame"><iframe src="${escapeHtml(meta.embedUrl)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${escapeHtml(v.title)}"></iframe></div>
            <h3>${escapeHtml(v.title)}${headerMeta}</h3>
            ${noteHtml}
          </article>`;
      }
      // External / unsupported host: render a clickable card with no embed.
      return `
        <article class="vid-card vid-external">
          <h3>${escapeHtml(v.title)}${headerMeta}</h3>
          <p><a href="${escapeHtml(meta?.watchUrl || v.url)}" target="_blank" rel="noopener">Watch on the original site ↗</a></p>
          ${noteHtml}
        </article>`;
    })
    .join("");

  const memberHint = isMember
    ? ""
    : `<p class="muted small">Sign in for the members-only videos. <a href="/login?next=/videos">Sign in</a></p>`;

  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Videos</h1>
      <p class="muted">${escapeHtml(org.displayName)} on tape — campouts, ceremonies, scoutmaster minutes.</p>
      ${memberHint}
      ${list.length ? `<div class="vid-grid">${cards}</div>` : `<p class="muted">No videos yet.</p>`}
    </section>
    <style>
      .vid-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.25rem;margin-top:1.25rem}
      .vid-card{background:#fff;border:1px solid #eef0e7;border-radius:12px;padding:.85rem 1rem 1rem}
      .vid-frame{position:relative;padding-top:56.25%;border-radius:8px;overflow:hidden;background:#000;margin-bottom:.6rem}
      .vid-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .vid-card h3{margin:0 0 .15rem;font-size:1.05rem}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.05rem .45rem;border-radius:5px;font-size:.78rem;margin-left:.25rem}
    </style>`;
  return pageShell(org, "Videos", body);
}

export function renderReimburseForm(org, user, events, mine, csrfToken) {
  const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtMoney = (cents) => `$${(cents / 100).toFixed(2)}`;
  const statusTag = (s) => {
    if (s === "paid") return `<span class="tag" style="background:#eaf6ec;border-color:#b9dec1;color:#15532b">paid</span>`;
    if (s === "approved") return `<span class="tag" style="background:#fff7e6;border-color:#ecd87a;color:#7d5a00">approved</span>`;
    if (s === "denied") return `<span class="tag" style="background:#fbe8e3;border-color:#f0bcb1;color:#7d2614">denied</span>`;
    return `<span class="tag">pending</span>`;
  };

  const eventOpts = events
    .map(
      (e) =>
        `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)} · ${escapeHtml(fmtDate(e.startsAt))}</option>`,
    )
    .join("");

  const mineHtml = mine.length
    ? `<ul class="rb-list">${mine
        .map(
          (r) => `
        <li>
          <div style="flex:1">
            <strong>${escapeHtml(fmtMoney(r.amountCents))}</strong> ${statusTag(r.status)}
            <div class="muted small">${escapeHtml(r.purpose)}${r.event ? ` · ${escapeHtml(r.event.title)}` : ""}</div>
            <div class="muted small">Submitted ${escapeHtml(fmtDate(r.submittedAt))}${
              r.decidedAt ? ` · ${escapeHtml(r.status)} ${escapeHtml(fmtDate(r.decidedAt))}${r.decidedByDisplay ? ` by ${escapeHtml(r.decidedByDisplay)}` : ""}` : ""
            }</div>
            ${r.notes ? `<div class="muted small">Treasurer note: ${escapeHtml(r.notes)}</div>` : ""}
          </div>
          ${r.receiptFilename ? `<a class="btn ghost" href="/uploads/${escapeHtml(r.receiptFilename)}">Receipt</a>` : ""}
        </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No requests yet.</p>`;

  const errorParam = "";
  const okParam = "";

  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Reimbursement requests</h1>
      <p class="muted">Submit an expense for the troop to repay you. The treasurer will review and mark it paid. Receipts are optional but speed approval.</p>

      <form class="rb-form" method="post" action="/reimburse" enctype="multipart/form-data">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken || "")}">
        <label>Amount (USD)
          <input name="amount" type="number" step="0.01" min="0.01" max="99999" required placeholder="e.g. 42.18">
        </label>
        <label>What was it for?
          <textarea name="purpose" rows="3" maxlength="500" required placeholder="e.g. Propane refill for Fall Camporee"></textarea>
        </label>
        <label>Related event (optional)
          <select name="eventId">
            <option value="">— none —</option>
            ${eventOpts}
          </select>
        </label>
        <label>Receipt (optional — image or PDF)
          <input name="receipt" type="file" accept="image/*,application/pdf">
        </label>
        <button class="btn primary" type="submit">Submit request</button>
      </form>

      <h2 style="margin-top:1.5rem">Your requests</h2>
      ${mineHtml}
    </section>
    <style>
      .rb-form{background:#fff;border:1px solid #eef0e7;border-radius:14px;padding:1.25rem;display:grid;gap:.75rem;max-width:560px;margin-top:1rem}
      .rb-form label{display:block;font-weight:500}
      .rb-form input,.rb-form textarea,.rb-form select{display:block;width:100%;margin-top:.3rem;padding:.5rem .65rem;border:1px solid var(--ink-300);border-radius:8px;font:inherit}
      .rb-form .btn{padding:.6rem 1.1rem;border-radius:8px;border:0;background:${escapeHtml(org.primaryColor || "#1d6b39")};color:#fff;font-weight:600;cursor:pointer}
      .rb-list{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.6rem}
      .rb-list li{background:#fff;border:1px solid #eef0e7;border-radius:10px;padding:.75rem 1rem;display:flex;gap:.75rem;align-items:center}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.05rem .45rem;border-radius:5px;font-size:.78rem;margin-left:.25rem}
    </style>`;
  return pageShell(org, "Reimbursements", body);
}

export function renderCohProgram(org, ev, awards) {
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
      <h2>${escapeHtml(cat)}</h2>
      <ul class="awards">${byCat[cat]
        .map(
          (a) =>
            `<li><strong>${escapeHtml(a.recipient)}</strong> — ${escapeHtml(a.award)}${
              a.notes ? `<br><span class="muted small">${escapeHtml(a.notes)}</span>` : ""
            }</li>`
        )
        .join("")}</ul>`
    )
    .join("");

  const body = `
    <section class="event-list program">
      <a class="back no-print" href="/events/${escapeHtml(ev.id)}">← Back to event</a>
      <header class="program-head">
        <p class="eyebrow">Court of Honor · ${escapeHtml(
          new Date(ev.startsAt).toLocaleDateString("en-US", { dateStyle: "long" })
        )}</p>
        <h1>${escapeHtml(org.displayName)}</h1>
        ${ev.location ? `<p class="muted">${escapeHtml(ev.location)}</p>` : ""}
      </header>
      ${awards.length ? groups : `<p class="muted">No awards on the program yet.</p>`}
      <p class="no-print" style="margin-top:1.5rem"><button class="btn ghost" onclick="window.print()">Print program</button></p>
    </section>
    <style>
      .program{max-width:60ch}
      .program-head{text-align:center;margin:2rem 0}
      .program-head h1{margin:0;font-size:2rem}
      .program-head .eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.78rem;color:var(--ink-500,#6b7280);margin:0 0 .4rem}
      .program h2{margin:1.5rem 0 .5rem;text-align:center}
      .awards{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
      .awards li{padding:.6rem 0;border-bottom:1px dotted #d4d8c8;text-align:center}
      .awards li:last-child{border-bottom:0}
      @media print{.site-header,.no-print{display:none}.program{padding:0}body{background:#fff}}
    </style>`;
  return pageShell(org, `Program — ${ev.title}`, body);
}

export function renderSurvey(org, survey, { user, flash } = {}) {
  const closed = survey.closesAt && new Date(survey.closesAt) < new Date();
  const questions = Array.isArray(survey.questions) ? survey.questions : [];

  const fieldFor = (q) => {
    const reqd = q.required ? " required" : "";
    switch (q.type) {
      case "long":
        return `<textarea name="${escapeHtml(q.id)}" rows="3" maxlength="2000"${reqd}></textarea>`;
      case "yesno":
        return `<select name="${escapeHtml(q.id)}"${reqd}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>`;
      case "select":
        return `<select name="${escapeHtml(q.id)}"${reqd}><option value="">—</option>${(q.options || [])
          .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
          .join("")}</select>`;
      case "multi":
        return `<div class="survey-multi">${(q.options || [])
          .map(
            (o) =>
              `<label class="survey-multi-opt"><input type="checkbox" name="${escapeHtml(q.id)}" value="${escapeHtml(o)}"> ${escapeHtml(o)}</label>`
          )
          .join("")}</div>`;
      case "scale":
        return `<div class="survey-scale">${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<label><input type="radio" name="${escapeHtml(q.id)}" value="${n}"${reqd && n === 1 ? " required" : ""}> ${n}</label>`
          )
          .join("")}</div>`;
      default:
        return `<input type="text" name="${escapeHtml(q.id)}" maxlength="500"${reqd}>`;
    }
  };

  const fields = questions
    .map(
      (q) => `
    <div class="survey-q">
      <label class="survey-q-label">
        <span>${escapeHtml(q.label)}${q.required ? ' <span class="muted">(required)</span>' : ""}</span>
        ${fieldFor(q)}
      </label>
    </div>`
    )
    .join("");

  const identity = user
    ? `<p class="muted small">Signed in as <strong>${escapeHtml(user.displayName)}</strong>. Your name + email are recorded with your response.</p>`
    : `<div class="rsvp-row">
        <label>Your name<input name="name" type="text" required maxlength="80" autocomplete="name"></label>
        <label>Email<input name="email" type="email" required maxlength="120" autocomplete="email"></label>
      </div>`;

  const flashHtml = flash
    ? `<div class="rsvp-flash rsvp-flash-${escapeHtml(flash.type || "ok")}">${escapeHtml(flash.message)}</div>`
    : "";

  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>${escapeHtml(survey.title)}</h1>
      ${survey.description ? `<p class="muted">${escapeHtml(survey.description)}</p>` : ""}
      ${flashHtml}
      ${
        closed
          ? `<div class="rsvp-flash rsvp-flash-err">This survey closed on ${escapeHtml(new Date(survey.closesAt).toLocaleDateString("en-US"))}.</div>`
          : `<form method="post" action="/surveys/${escapeHtml(survey.slug)}" class="rsvp-card" style="margin-top:1rem">
              ${identity}
              ${fields}
              <button class="btn primary" type="submit" style="margin-top:.5rem">Submit response</button>
            </form>`
      }
    </section>
    <style>
      .survey-q{margin-bottom:1rem}
      .survey-q input[type=text],.survey-q input[type=email],.survey-q select,.survey-q textarea{margin-top:.3rem;padding:.55rem .7rem;border:1px solid var(--ink-300,#c8ccd4);border-radius:8px;font:inherit;width:100%}
      .survey-q-label > span{display:block;font-weight:500;margin-bottom:.25rem}
      .survey-multi{display:grid;gap:.3rem;margin-top:.3rem}
      .survey-multi-opt{display:flex;align-items:center;gap:.45rem;font-weight:400}
      .survey-multi-opt input{width:auto}
      .survey-scale{display:flex;gap:1rem;margin-top:.3rem}
      .survey-scale label{font-weight:400;display:inline-flex;align-items:center;gap:.3rem}
    </style>`;
  return pageShell(org, survey.title, body);
}

export function renderSurveyAck(org, survey) {
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Thanks!</h1>
      <p>We've recorded your response to <strong>${escapeHtml(survey.title)}</strong>.</p>
    </section>`;
  return pageShell(org, "Thanks", body);
}

export function renderTripPlan(org, ev, plan, headcount, flagged) {
  const meals = plan?.meals || [];
  const gear = plan?.gear || [];
  const list = buildShoppingList(meals, headcount);

  let costPerPerson = 0;
  for (const m of meals) {
    for (const i of m.ingredients || []) {
      if (i.unitCost == null) continue;
      costPerPerson += (i.quantityPerPerson || 0) * (i.unitCost || 0);
    }
  }
  costPerPerson = Math.round(costPerPerson * 100) / 100;
  const totalCost = Math.round(costPerPerson * headcount * 100) / 100;

  const tagLabel = (key) =>
    MEAL_DIETARY_TAGS.find((t) => t.key === key)?.label || key;

  const mealCards = meals.length
    ? meals
        .map((m) => {
          const tags = m.dietaryTags || [];
          const tagBadges = tags.length
            ? `<p class="muted small" style="margin:.25rem 0 0">${tags
                .map((t) => `<span class="trip-tag">${escapeHtml(tagLabel(t))}</span>`)
                .join(" ")}</p>`
            : "";
          const conflicts = mealConflicts(flagged || [], tags);
          const warn = conflicts.length
            ? `<div class="trip-warn"><strong>⚠ Heads-up</strong> — ${conflicts
                .map(
                  (c) =>
                    `<strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.flag)})`,
                )
                .join(", ")} on the roster.</div>`
            : "";
          return `
      <article class="trip-meal">
        <header>
          <h3>${escapeHtml(m.name)}</h3>
          ${m.recipeName ? `<p class="muted small">Recipe: ${escapeHtml(m.recipeName)}</p>` : ""}
          ${tagBadges}
        </header>
        ${warn}
        ${
          m.ingredients.length
            ? `<table>
                <thead><tr><th>Ingredient</th><th class="num">Per person</th><th class="num">For ${escapeHtml(String(headcount))}</th><th>Unit</th></tr></thead>
                <tbody>${m.ingredients
                  .map(
                    (i) => `<tr>
                      <td>${escapeHtml(i.name)}</td>
                      <td class="num">${escapeHtml(String(i.quantityPerPerson))}</td>
                      <td class="num"><strong>${escapeHtml(String(Math.round(i.quantityPerPerson * headcount * 100) / 100))}</strong></td>
                      <td>${escapeHtml(i.unit)}</td>
                    </tr>`,
                  )
                  .join("")}</tbody>
              </table>`
            : `<p class="muted small">No ingredients yet.</p>`
        }
      </article>`;
        })
        .join("")
    : `<p class="muted">No meals planned yet.</p>`;

  const shoppingHtml = list.length
    ? list
        .map(
          (g) => `
      <h3 style="margin:1.25rem 0 .35rem">${escapeHtml(g.category)}</h3>
      <table class="shopping">
        <thead><tr><th>Item</th><th class="num">Total</th><th>Unit</th><th>For</th></tr></thead>
        <tbody>${g.items
          .map(
            (i) => `<tr>
              <td>${escapeHtml(i.name)}</td>
              <td class="num"><strong>${escapeHtml(String(i.quantity))}</strong></td>
              <td>${escapeHtml(i.unit)}</td>
              <td class="muted small">${escapeHtml(i.fromMeals.join(", "))}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`
        )
        .join("")
    : `<p class="muted">Add ingredients to a meal to start the shopping list.</p>`;

  const flagsHtml = (flagged || []).length
    ? `<ul style="margin:0;padding-left:1.25rem">
        ${flagged
          .map(
            (m) => `<li><strong>${escapeHtml(m.firstName)} ${escapeHtml(
              m.lastName
            )}</strong>: ${m.dietaryFlags
              .map((f) => `<span class="tag">${escapeHtml(f)}</span>`)
              .join(" ")}</li>`
          )
          .join("")}
      </ul>`
    : `<p class="muted small">No dietary flags on the roster.</p>`;

  const body = `
    <section class="event-list">
      <a class="back" href="/events/${escapeHtml(ev.id)}">← ${escapeHtml(ev.title)}</a>
      <h1>Trip plan</h1>
      <p class="muted">Cooking for <strong>${escapeHtml(String(headcount))}</strong> · ${escapeHtml(
        new Date(ev.startsAt).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      )}</p>

      <div class="trip-actions"><button class="btn ghost" onclick="window.print()">Print</button></div>

      <h2 style="margin-top:1.5rem">Meals</h2>
      ${mealCards}

      <h2 style="margin-top:2rem">Shopping list</h2>
      <div class="trip-shop">${shoppingHtml}</div>

      ${
        costPerPerson > 0
          ? `<h2 style="margin-top:2rem">Estimated cost</h2>
             <div class="trip-shop" style="display:flex;gap:2rem;flex-wrap:wrap">
               <div><strong style="font-size:1.5rem">$${costPerPerson.toFixed(2)}</strong> <span class="muted">per person</span></div>
               <div><strong style="font-size:1.5rem">$${totalCost.toFixed(2)}</strong> <span class="muted">for ${headcount}</span></div>
             </div>`
          : ""
      }

      ${
        gear.length
          ? `<h2 style="margin-top:2rem">Gear / packing list</h2>
             <div class="trip-shop">
               <table class="shopping">
                 <thead><tr><th></th><th>Item</th><th class="num">Qty</th><th>Assigned to</th></tr></thead>
                 <tbody>${gear
                   .map(
                     (g) => `<tr style="${g.packed ? "opacity:.55" : ""}">
                       <td>${g.packed ? "☑" : "☐"}</td>
                       <td>${escapeHtml(g.name)}${g.notes ? ` <span class="muted small">${escapeHtml(g.notes)}</span>` : ""}</td>
                       <td class="num">${escapeHtml(String(g.quantity))}</td>
                       <td>${escapeHtml(g.assignedTo || "—")}</td>
                     </tr>`
                   )
                   .join("")}</tbody>
               </table>
             </div>`
          : ""
      }

      <h2 style="margin-top:2rem">Dietary flags on the roster</h2>
      <div class="trip-shop">${flagsHtml}</div>
    </section>
    <style>
      .trip-actions{margin:.6rem 0 1rem}
      .trip-meal{background:#fff;border:1px solid #eef0e7;border-radius:14px;padding:1rem 1.25rem;margin-bottom:1rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 6px 18px rgba(15,58,31,.04)}
      .trip-meal h3{margin:0 0 .15rem;font-size:1.1rem;font-family:Inter,sans-serif}
      .trip-meal table,.trip-shop table.shopping{width:100%;border-collapse:collapse;margin-top:.5rem;font-size:.93rem}
      .trip-meal th,.trip-shop th{text-align:left;padding:.4rem .55rem;border-bottom:1px solid #eef0e7;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-500);font-weight:600}
      .trip-meal td,.trip-shop td{padding:.4rem .55rem;border-bottom:1px solid #eef0e7}
      .trip-meal tr:last-child td,.trip-shop tr:last-child td{border-bottom:0}
      .trip-meal .num,.trip-shop .num{text-align:right;font-variant-numeric:tabular-nums}
      .trip-shop{background:#fff;border:1px solid #eef0e7;border-radius:14px;padding:1.25rem 1.5rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 6px 18px rgba(15,58,31,.04)}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.05rem .4rem;border-radius:5px;font-size:.78rem;color:var(--ink-500);margin-right:.25rem}
      .trip-tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;border-radius:999px;padding:.1rem .55rem;font-size:.78rem;color:var(--ink-500);margin-right:.25rem}
      .trip-warn{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.55rem .85rem;border-radius:8px;margin:.55rem 0;font-size:.92rem}
      @media print{.site-header,.back,.trip-actions{display:none}.event-list{padding:0}}
    </style>`;
  return pageShell(org, `Trip plan · ${ev.title}`, body);
}

export function renderPostsList(org, posts) {
  const items = posts.length
    ? posts.map((p) => renderPostCard(p)).join("")
    : `<p class="muted">No posts yet.</p>`;
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Posts</h1>
      <p class="muted">Recent updates from ${escapeHtml(org.displayName)}.</p>
      <div class="post-feed" style="margin-top:1.5rem">${items}</div>
    </section>
    <style>${POST_STYLES}</style>`;
  return pageShell(org, "Posts", body);
}

/* ------------------------------------------------------------------ */
/* Chat — parent web fallback                                          */
/* ------------------------------------------------------------------ */

export function renderChatPage(org, { needsSignIn, notAMember } = {}) {
  if (needsSignIn) {
    const body = `
      <section class="event-list">
        <a class="back" href="/">← Home</a>
        <h1>Chat</h1>
        <p class="muted">Sign in to chat with the rest of ${escapeHtml(org.displayName)}.</p>
        <p style="margin-top:1rem"><a class="btn primary" href="/login?next=/chat">Sign in</a></p>
      </section>`;
    return pageShell(org, "Chat", body);
  }
  if (notAMember) {
    const body = `
      <section class="event-list">
        <a class="back" href="/">← Home</a>
        <h1>Chat</h1>
        <p class="muted">Chat is members-only. Once a leader adds you to ${escapeHtml(org.displayName)}, you'll be able to read and post here.</p>
      </section>`;
    return pageShell(org, "Chat", body);
  }

  // The page is mostly a thin client over /api/v1. The browser already
  // carries the Lucia session cookie, so resolveApiUser accepts it as
  // auth and we don't need a bearer token in the web client.
  const orgId = String(org.id);
  const body = `
    <section class="chat" id="chat-root" data-org-id="${escapeHtml(orgId)}">
      <a class="back" href="/">← Home</a>
      <h1>Chat</h1>
      <p class="muted small">If you'd rather use a phone, the Compass mobile app talks to the same channels.</p>
      <div class="chat-shell">
        <aside class="chat-sidebar" aria-label="Channels">
          <ul id="chat-channels" class="chat-channels"></ul>
        </aside>
        <main class="chat-main" aria-live="polite">
          <header class="chat-header" id="chat-header">
            <h2 id="chat-title">Pick a channel</h2>
            <div class="chat-status" id="chat-status"></div>
          </header>
          <div id="chat-banner" class="chat-banner" hidden></div>
          <ol class="chat-messages" id="chat-messages"></ol>
          <form class="chat-form" id="chat-form" hidden>
            <textarea name="body" rows="2" placeholder="Type a message…" maxlength="10000" required></textarea>
            <button class="btn primary" type="submit">Send</button>
          </form>
        </main>
      </div>
    </section>
    <style>${CHAT_STYLES}</style>
    <script type="module">${chatClientScript()}</script>`;
  return pageShell(org, "Chat", body);
}

const CHAT_STYLES = `
  .chat { padding-bottom: 2rem; }
  .chat-shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 1rem;
    margin-top: 1rem;
    border: 1px solid #d4c8a8;
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    min-height: 480px;
  }
  .chat-sidebar { border-right: 1px solid #e6dcc0; background: #faf3e3; }
  .chat-channels { list-style: none; margin: 0; padding: .4rem; display: grid; gap: .15rem; }
  .chat-channels li { padding: .5rem .65rem; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .chat-channels li:hover { background: #f1ead5; }
  .chat-channels li.is-active { background: #0e3320; color: #fff; }
  .chat-channels li.is-active .chat-meta { color: rgba(255,255,255,.7); }
  .chat-channels .chat-meta { display: block; font-size: 11px; color: #5a6258; }
  .chat-main { display: flex; flex-direction: column; min-height: 480px; }
  .chat-header { padding: .75rem 1rem; border-bottom: 1px solid #e6dcc0; }
  .chat-header h2 { margin: 0; font-family: Newsreader, Georgia, serif; font-weight: 500; font-size: 22px; }
  .chat-status { font-size: 12px; color: #5a6258; margin-top: .15rem; }
  .chat-status .ok { color: #3d6b3a; }
  .chat-status .warn { color: #a82e1d; }
  .chat-banner { background: #fbe8e3; border: 1px solid #f0bcb1; color: #7d2614; padding: .65rem .85rem; margin: .65rem 1rem; border-radius: 8px; font-size: 13px; }
  .chat-messages { list-style: none; margin: 0; padding: 1rem; flex: 1; display: flex; flex-direction: column; gap: .65rem; overflow-y: auto; max-height: 60vh; }
  .chat-messages li { display: grid; grid-template-columns: minmax(0, 1fr); gap: .15rem; }
  .chat-messages .author { font-size: 12px; color: #5a6258; font-weight: 600; }
  .chat-messages .body { background: #f4ecdc; border-radius: 10px; padding: .55rem .75rem; font-size: 14px; line-height: 1.45; word-wrap: break-word; white-space: pre-wrap; }
  .chat-messages li.system .body { background: #fff7e6; font-style: italic; color: #7d5a00; }
  .chat-messages li.deleted .body { font-style: italic; color: #5a6258; }
  .chat-messages .ts { font-size: 11px; color: #5a6258; margin-top: .1rem; }
  .chat-form { display: flex; gap: .4rem; padding: .65rem 1rem; border-top: 1px solid #e6dcc0; align-items: flex-end; }
  .chat-form textarea { flex: 1; resize: vertical; min-height: 44px; padding: .55rem .65rem; border: 1px solid #d4c8a8; border-radius: 8px; font-family: inherit; font-size: 14px; }
  .chat-form button { align-self: stretch; }
  @media (max-width: 720px) {
    .chat-shell { grid-template-columns: 1fr; min-height: auto; }
    .chat-sidebar { border-right: 0; border-bottom: 1px solid #e6dcc0; max-height: 200px; overflow-y: auto; }
  }
`;

function chatClientScript() {
  // Stringified module: client polls the JSON API at /api/v1, since SSE
  // is a follow-up PR. ~5s poll is fine for v1; SSE drops the latency to
  // sub-second once it lands.
  return `
const root = document.getElementById('chat-root');
const orgId = root?.dataset.orgId;
const channelsEl = document.getElementById('chat-channels');
const messagesEl = document.getElementById('chat-messages');
const headerTitle = document.getElementById('chat-title');
const statusEl = document.getElementById('chat-status');
const bannerEl = document.getElementById('chat-banner');
const formEl = document.getElementById('chat-form');

let activeChannelId = null;
let lastMessageId = null;
// EventSource holding the SSE connection for the active channel.
// Recreated on every channel switch + on visibility-change reconnect.
let stream = null;

const KIND_LABEL = {
  patrol: 'Patrol',
  troop: 'All members',
  parents: 'Parents',
  leaders: 'Leaders',
  event: 'Event',
  custom: 'Custom',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function loadChannels() {
  const r = await fetch('/api/v1/channels?orgId=' + encodeURIComponent(orgId), {
    credentials: 'same-origin',
  });
  if (!r.ok) {
    channelsEl.innerHTML = '<li class="muted small">' + escapeHtml('Couldn\\'t load channels.') + '</li>';
    return;
  }
  const data = await r.json();
  channelsEl.innerHTML = data.channels.map((c) => {
    const status = c.isSuspended ? ' (paused)' : c.archivedAt ? ' (archived)' : '';
    return '<li data-channel-id="' + escapeHtml(c.id) + '" class="' + (c.id === activeChannelId ? 'is-active' : '') + '">' +
      '<strong>' + escapeHtml(c.name) + '</strong>' + escapeHtml(status) +
      '<span class="chat-meta">' + escapeHtml(KIND_LABEL[c.kind] || c.kind) + '</span>' +
    '</li>';
  }).join('');
  for (const li of channelsEl.querySelectorAll('li[data-channel-id]')) {
    li.addEventListener('click', () => selectChannel(li.dataset.channelId, data.channels.find((x) => x.id === li.dataset.channelId)));
  }
  if (!activeChannelId && data.channels.length) {
    selectChannel(data.channels[0].id, data.channels[0]);
  }
}

function setActiveStyles() {
  for (const li of channelsEl.querySelectorAll('li')) {
    li.classList.toggle('is-active', li.dataset.channelId === activeChannelId);
  }
}

async function selectChannel(id, summary) {
  activeChannelId = id;
  lastMessageId = null;
  setActiveStyles();
  headerTitle.textContent = summary?.name || 'Channel';
  statusEl.innerHTML = '';
  bannerEl.hidden = true;
  messagesEl.innerHTML = '';
  formEl.hidden = !(summary?.canPost);
  if (summary?.isSuspended) {
    bannerEl.hidden = false;
    bannerEl.textContent = 'This channel is paused. ' + (summary.suspendedReason ? '(' + summary.suspendedReason.replace(/-/g, ' ') + ')' : '');
  }
  await loadMessages();
  startStream();
}

async function loadMessages() {
  if (!activeChannelId) return;
  const r = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId), {
    credentials: 'same-origin',
  });
  if (!r.ok) {
    messagesEl.innerHTML = '<li class="system"><div class="body">' + escapeHtml('Couldn\\'t load this channel.') + '</div></li>';
    return;
  }
  const data = await r.json();
  renderMessages(data.messages, /* replace */ true);
}

function renderMessages(list, replace) {
  if (replace) messagesEl.innerHTML = '';
  for (const m of list) {
    const li = document.createElement('li');
    if (!m.author) li.classList.add('system');
    if (m.deleted) li.classList.add('deleted');
    const author = m.author?.displayName || 'system';
    li.innerHTML = '<span class="author">' + escapeHtml(author) + '</span>' +
      '<div class="body">' + escapeHtml(m.deleted ? '(deleted)' : m.body) + '</div>' +
      '<span class="ts">' + escapeHtml(fmtTime(m.createdAt)) + '</span>';
    messagesEl.appendChild(li);
    lastMessageId = m.id;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Open an SSE subscription to the active channel. EventSource auths via
// the existing Lucia cookie (credentials: 'same-origin' equivalent —
// EventSource sends cookies by default for same-origin URLs). Browsers
// auto-reconnect when the connection drops; we just need to handle the
// onmessage / typed event handlers.
function startStream() {
  stopStream();
  if (!activeChannelId) return;
  const url = '/api/v1/channels/' + encodeURIComponent(activeChannelId) + '/stream';
  try {
    stream = new EventSource(url, { withCredentials: true });
  } catch {
    // Fall back to a polling refresh every 10s if the browser refuses
    // EventSource. Older browsers, some embedded webviews.
    stream = null;
    setTimeout(refreshOnly, 10000);
    return;
  }
  stream.addEventListener('message', (ev) => {
    try {
      const event = JSON.parse(ev.data);
      if (event.message) renderMessages([event.message], false);
    } catch { /* ignore malformed event */ }
  });
  stream.addEventListener('suspended', () => {
    void loadChannels();
    if (formEl) formEl.hidden = true;
    bannerEl.hidden = false;
    bannerEl.textContent = 'Channel paused — a leader needs to restore two-deep.';
  });
  stream.addEventListener('unsuspended', () => {
    void loadChannels();
    if (formEl) formEl.hidden = false;
    bannerEl.hidden = true;
  });
  stream.addEventListener('archived', () => {
    void loadChannels();
    if (formEl) formEl.hidden = true;
    bannerEl.hidden = false;
    bannerEl.textContent = 'This channel has been archived.';
  });
  stream.addEventListener('error', () => {
    // EventSource auto-reconnects on transient errors; if it drops
    // permanently (auth revoked, channel deleted), stop trying.
    if (stream && stream.readyState === EventSource.CLOSED) {
      stopStream();
    }
  });
}

function stopStream() {
  if (stream) {
    try { stream.close(); } catch { /* ignore */ }
    stream = null;
  }
}

async function refreshOnly() {
  // Best-effort polling fallback when EventSource isn't available.
  if (!activeChannelId) return;
  const r = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId), {
    credentials: 'same-origin',
  });
  if (!r.ok) return;
  const data = await r.json();
  const fresh = [];
  let seen = false;
  for (const m of data.messages) {
    if (m.id === lastMessageId) seen = true;
    else if (seen) fresh.push(m);
  }
  if (fresh.length) renderMessages(fresh, false);
  if (!stream) setTimeout(refreshOnly, 10000);
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeChannelId) return;
  const ta = formEl.elements.namedItem('body');
  const body = String(ta.value || '').trim();
  if (!body) return;
  ta.disabled = true;
  try {
    const r = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId) + '/messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      bannerEl.hidden = false;
      bannerEl.textContent = data.error === 'channel_suspended'
        ? 'Channel is paused (' + (data.reason || 'YPT compliance') + '). Reach out to a leader.'
        : 'Couldn\\'t send: ' + (data.error || r.status);
      return;
    }
    const { message } = await r.json();
    renderMessages([message], false);
    ta.value = '';
  } finally {
    ta.disabled = false;
    ta.focus();
  }
});

void loadChannels();
`;
}

/* ------------------------------------------------------------------ */
/* Newsletter archive                                                   */
/* ------------------------------------------------------------------ */

export function renderNewsletterArchive(org, issues, { needsSignIn, notAMember } = {}) {
  if (needsSignIn) {
    const body = `
      <section class="event-list">
        <a class="back" href="/">← Home</a>
        <h1>Newsletters</h1>
        <p class="muted">Sign in to read past issues of ${escapeHtml(org.displayName)}'s newsletter.</p>
        <p style="margin-top:1rem"><a class="btn primary" href="/login?next=/newsletters">Sign in</a></p>
      </section>`;
    return pageShell(org, "Newsletters", body);
  }
  if (notAMember) {
    const body = `
      <section class="event-list">
        <a class="back" href="/">← Home</a>
        <h1>Newsletters</h1>
        <p class="muted">This archive is members-only. Once you're added to ${escapeHtml(org.displayName)} you'll be able to read past issues here.</p>
      </section>`;
    return pageShell(org, "Newsletters", body);
  }

  const items = issues.length
    ? `<ul class="newsletter-list">${issues
        .map(
          (n) => `
        <li>
          <a href="/newsletters/${escapeHtml(n.id)}">
            <strong>${escapeHtml(n.title)}</strong>
            <span class="muted small"> · ${escapeHtml(
              new Date(n.publishedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            )}${n.author?.displayName ? ` · ${escapeHtml(n.author.displayName)}` : ""}</span>
          </a>
        </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No newsletters yet.</p>`;

  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Newsletters</h1>
      <p class="muted">The recurring digest of what's happening at ${escapeHtml(org.displayName)}.</p>
      ${items}
    </section>
    <style>
      .newsletter-list { list-style:none; padding:0; margin:1.5rem 0; display:grid; gap:.5rem; }
      .newsletter-list li { background:#fff; border:1px solid #eef0e7; border-radius:10px; padding:.85rem 1.1rem; }
      .newsletter-list a { display:block; color:inherit; text-decoration:none; }
      .newsletter-list a:hover { color:#1d6b39; }
    </style>`;
  return pageShell(org, "Newsletters", body);
}

export function renderNewsletterPage({
  org,
  newsletter,
  posts,
  events,
  needsSignIn,
  notAMember,
}) {
  if (needsSignIn) {
    const body = `
      <section class="event-list">
        <a class="back" href="/newsletters">← Newsletters</a>
        <h1>Members-only newsletter</h1>
        <p class="muted">This issue is members-only. Sign in to read it.</p>
        <p style="margin-top:1rem"><a class="btn primary" href="/login?next=/newsletters/${escapeHtml(newsletter.id)}">Sign in</a></p>
      </section>`;
    return pageShell(org, newsletter.title, body);
  }
  if (notAMember) {
    const body = `
      <section class="event-list">
        <a class="back" href="/newsletters">← Newsletters</a>
        <h1>Members only</h1>
        <p class="muted">This issue is restricted to members of ${escapeHtml(org.displayName)}.</p>
      </section>`;
    return pageShell(org, newsletter.title, body);
  }

  const introHtml = textToHtml(newsletter.intro || "");
  const postsHtml = posts.length
    ? `<h2>Recent posts</h2>
       <ul class="newsletter-posts">${posts
         .map(
           (p) => `
         <li>
           <a href="/posts/${escapeHtml(p.id)}"><strong>${escapeHtml(p.title || "(untitled)")}</strong></a>
           <span class="muted small"> · ${escapeHtml(
             new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
           )}${p.author?.displayName ? ` · ${escapeHtml(p.author.displayName)}` : ""}</span>
         </li>`,
         )
         .join("")}</ul>`
    : "";
  const eventsHtml = events.length
    ? `<h2>On the calendar</h2>
       <ul class="newsletter-events">${events
         .map(
           (e) => `
         <li>
           <a href="/events/${escapeHtml(e.id)}">
             <strong>${escapeHtml(e.title)}</strong>
             <span class="muted small"> · ${escapeHtml(
               new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
             )}${e.location ? ` · ${escapeHtml(e.location)}` : ""}</span>
           </a>
         </li>`,
         )
         .join("")}</ul>`
    : "";

  const body = `
    <section class="event-list">
      <a class="back" href="/newsletters">← Newsletters</a>
      <h1>${escapeHtml(newsletter.title)}</h1>
      <p class="muted small">${escapeHtml(
        new Date(newsletter.publishedAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
      )}${newsletter.author?.displayName ? ` · ${escapeHtml(newsletter.author.displayName)}` : ""}</p>
      <div class="prose" style="margin:1.5rem 0">${introHtml}</div>
      ${postsHtml}
      ${eventsHtml}
    </section>
    <style>
      .newsletter-posts, .newsletter-events { list-style:none; padding:0; margin:.75rem 0 1.5rem; display:grid; gap:.4rem; }
      .newsletter-posts li, .newsletter-events li { background:#fff; border:1px solid #eef0e7; border-radius:8px; padding:.65rem .85rem; }
      .newsletter-posts a, .newsletter-events a { color:inherit; text-decoration:none; }
      .newsletter-posts a:hover, .newsletter-events a:hover { color:#1d6b39; }
    </style>`;
  return pageShell(org, newsletter.title, body);
}

export function renderPostDetail(org, post, ctx = {}) {
  const body = `
    <section class="event-list">
      <a class="back" href="/posts">← All posts</a>
      ${renderPostCard(post, { showLink: false })}
      ${renderCommentBlock({ post, comments: post.comments, user: ctx.user, role: ctx.role })}
    </section>
    <style>${POST_STYLES}</style>`;
  return pageShell(org, post.title || "Post", body);
}

const POST_STYLES = `
.post-feed{display:grid;gap:1.25rem}
.post{background:#fff;border:1px solid #eef0e7;border-radius:14px;padding:1.25rem 1.4rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 8px 24px rgba(15,58,31,.06);position:relative}
.post.post-pinned{border-color:var(--gold,#caa54a)}
.post .badge{position:absolute;top:.85rem;right:.85rem;background:var(--gold,#caa54a);color:#15181c;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:5px;letter-spacing:.06em;text-transform:uppercase}
.post h3{margin:0 0 .35rem;font-size:1.2rem}
.post .post-body p{margin:0 0 .8em}
.post .post-body p:last-child{margin-bottom:0}
.post footer{margin-top:.75rem}
.post-photos{display:grid;gap:.4rem;margin-top:.85rem;border-radius:10px;overflow:hidden}
.post-photos img{display:block;width:100%;height:100%;object-fit:cover;background:#eef0e7}
.post-photos-1{grid-template-columns:1fr}
.post-photos-1 img{aspect-ratio:16/9}
.post-photos-2{grid-template-columns:1fr 1fr}
.post-photos-2 img{aspect-ratio:1/1}
.post-photos-3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;height:280px}
.post-photos-3 a:first-child{grid-row:span 2}
.post-photos-3 img{height:100%}
.post-photos-4{grid-template-columns:1fr 1fr}
.post-photos-4 img{aspect-ratio:1/1}
.comments{margin-top:2rem}
.comments h2{font-size:1.2rem;margin-bottom:.75rem}
.comment-list{list-style:none;padding:0;margin:0 0 1rem;display:grid;gap:.6rem}
.comment{background:#fbf8ee;border:1px solid #eef0e7;border-radius:10px;padding:.75rem 1rem}
.comment.hidden{opacity:.55;background:#fff}
.comment header{display:flex;align-items:baseline;gap:.4rem;margin-bottom:.25rem}
.comment .body{color:var(--ink-700,#3a4049)}
.comment .body p{margin:0 0 .35em}
.comment .body p:last-child{margin-bottom:0}
.link-btn{background:none;border:0;padding:0;margin-right:.6rem;color:var(--ink-500,#6b7280);font:inherit;font-size:.82rem;cursor:pointer;text-decoration:underline}
.link-btn:hover{color:var(--ink-900,#15181c)}
.link-btn.danger{color:#7d2614}
.comment-form{display:grid;gap:.5rem}
.comment-form textarea{padding:.55rem .75rem;border:1px solid var(--ink-300,#c8ccd4);border-radius:8px;font:inherit;resize:vertical}
.comment-form button{justify-self:start}
.tag{display:inline-block;background:#fff;border:1px solid #eef0e7;padding:.05rem .4rem;border-radius:5px;font-size:.78rem;color:#6b7280;margin-left:.4rem}
`;

function renderAnnouncements(list) {
  if (!list || list.length === 0) return "";
  const items = list
    .map(
      (a) => `
    <li${a.pinned ? ' class="pinned"' : ""}>
      ${a.pinned ? '<span class="badge">Pinned</span>' : ""}
      <h3>${escapeHtml(a.title)}</h3>
      <div class="ann-body">${textToHtml(a.body)}</div>
      <time datetime="${escapeHtml(a.publishedAt.toISOString())}">${escapeHtml(
        a.publishedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      )}</time>
    </li>`
    )
    .join("");
  return `
  <section id="announcements" class="section" aria-labelledby="ann-heading">
    <div class="wrap">
      <header class="section-head">
        <h2 id="ann-heading">Announcements</h2>
      </header>
      <ul class="announcements" role="list">${items}</ul>
    </div>
  </section>`;
}

export function renderSite(org, extras = {}) {
  const { page, announcements, albums, posts, user, role, customPages } = extras;
  const tpl = loadTemplate();
  const navAuth = user
    ? `${role === "admin" || role === "leader" ? `<li><a href="/admin">Admin</a></li>` : ""}
       <li><a class="cta" href="/logout" onclick="event.preventDefault();fetch('/logout',{method:'POST'}).then(()=>location.href='/');">Sign out</a></li>`
    : `<li><a href="/login">Sign in</a></li>
       <li><a class="cta" href="#join">Join</a></li>`;
  const navCustom = (customPages || [])
    .filter((p) => p.showInNav)
    .map((p) => `<li><a href="/p/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`)
    .join("");

  const tagline =
    page?.heroLede ||
    org.tagline ||
    `${org.unitType} ${org.unitNumber}, chartered to ${org.charterOrg}.`;

  const heroHeadline =
    page?.heroHeadline ||
    `Adventure, leadership, and the outdoors — since ${org.founded || "now"}.`;

  const aboutBody =
    page?.aboutBody ||
    `${org.displayName} is sponsored by ${org.charterOrg} in ${org.city}, ${org.state}. We are part of ${
      org.district || "our district"
    } in the ${org.council || "our council"}.`;

  const joinBody =
    page?.joinBody ||
    `Any Scout-aged youth is welcome to drop in on a ${org.meetingDay} meeting at ${
      org.meetingLocation || org.charterOrg
    }.`;

  const ctx = {
    UNIT_TYPE: org.unitType,
    UNIT_NUMBER: org.unitNumber,
    DISPLAY_NAME: org.displayName,
    BRAND_MARK: org.unitNumber,
    HERO_HEADLINE: heroHeadline,
    HERO_LEDE: tagline,
    CHARTER_ORG: org.charterOrg,
    CITY: org.city,
    STATE: org.state,
    COUNCIL: org.council || "your council",
    DISTRICT: org.district || "your district",
    FOUNDED: org.founded || "—",
    FOUNDED_LINE: org.founded ? ` · Est. ${org.founded}` : "",
    MEETING_DAY: org.meetingDay,
    MEETING_TIME: org.meetingTime,
    MEETING_LOCATION: org.meetingLocation || org.charterOrg,
    SCOUTMASTER_NAME: org.scoutmasterName,
    SCOUTMASTER_EMAIL: org.scoutmasterEmail,
    COMMITTEE_EMAIL: org.committeeChairEmail || org.scoutmasterEmail,
    PRIMARY_COLOR: org.primaryColor,
    ACCENT_COLOR: org.accentColor,
    ABOUT_BODY: raw(textToHtml(aboutBody)),
    JOIN_BODY: raw(textToHtml(joinBody)),
    CONTACT_NOTE: raw(page?.contactNote ? textToHtml(page.contactNote) : ""),
    ANNOUNCEMENTS: raw(renderAnnouncements(announcements)),
    FEED: raw(renderFeed(posts)),
    EVENTS: raw(renderEvents(extras.events)),
    GALLERY: raw(renderGallery(albums)),
    NAV_AUTH: raw(navAuth),
    NAV_CUSTOM: raw(navCustom),
    DEMO_BANNER: org.isDemo
      ? raw(
          `<div class="demo-banner" role="note"><strong>Compass demo site.</strong> ${escapeHtml(
            org.displayName
          )} is a fictional unit. <a href="https://${process.env.APEX_DOMAIN || "compass.app"}/signup.html">Start one for your real troop →</a></div>`
        )
      : "",
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = ctx[key];
    if (v && typeof v === "object" && v[RAW] !== undefined) return v[RAW];
    return escapeHtml(v ?? "");
  });
}
