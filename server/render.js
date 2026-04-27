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
function textToHtml(s) {
  const escaped = escapeHtml(s ?? "");
  return escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
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
      <span class="brand-mark" aria-hidden="true">${escapeHtml(org.unitNumber)}</span>
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

export function renderEventDetail(org, e) {
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

  const body = `
  <section class="event-detail">
    <a class="back" href="/events">← All events</a>
    <h1>${escapeHtml(e.title)}</h1>
    ${e.category ? `<p class="muted small" style="margin-top:-.4rem">${escapeHtml(e.category)}</p>` : ""}

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

    <p class="muted small" style="margin-top:2rem">
      Want every event in your phone calendar? <a href="/calendar.ics">Subscribe to the troop's calendar feed</a>.
    </p>
  </section>`;
  return pageShell(org, e.title, body);
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
  const renderRow = (m) => `
    <li>
      <div>
        <h3>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</h3>
        <p class="muted small">${
          m.position ? `${escapeHtml(m.position)} · ` : ""
        }${m.patrol ? `${escapeHtml(m.patrol)} patrol` : ""}</p>
      </div>
      <div>
        ${m.email ? `<a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a><br>` : ""}
        ${m.phone ? `<span class="muted small">${escapeHtml(m.phone)}</span>` : ""}
      </div>
    </li>`;
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>Member directory</h1>
      <p class="muted">${(members || []).length} on the roster · visible to ${escapeHtml(role)}s of ${escapeHtml(org.displayName)}.</p>
      ${
        youth.length
          ? `<h2 style="margin-top:1.5rem">Youth</h2><ul class="items">${youth.map(renderRow).join("")}</ul>`
          : ""
      }
      ${
        adults.length
          ? `<h2 style="margin-top:1.5rem">Adults</h2><ul class="items">${adults.map(renderRow).join("")}</ul>`
          : ""
      }
      ${(members || []).length === 0 ? `<p class="muted">No members yet.</p>` : ""}
    </section>
    <style>
      .event-list ul.items{list-style:none;padding:0;margin:0;display:grid;gap:.6rem}
      .event-list ul.items li{display:flex;gap:1.5rem;justify-content:space-between;align-items:flex-start;background:#fff;border:1px solid #eef0e7;border-radius:10px;padding:.85rem 1rem}
      .event-list ul.items h3{margin:0 0 .15rem;font-size:1rem;font-family:Inter,sans-serif}
      .event-list ul.items p{margin:0}
      .tag{display:inline-block;background:#fbf8ee;border:1px solid #eef0e7;padding:.1rem .45rem;border-radius:5px;font-size:.78rem;color:#6b7280;margin-right:.25rem}
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
  <section id="announcements" class="section">
    <div class="wrap">
      <header class="section-head">
        <h2>Announcements</h2>
      </header>
      <ul class="announcements">${items}</ul>
    </div>
  </section>`;
}

export function renderSite(org, extras = {}) {
  const { page, announcements, albums } = extras;
  const tpl = loadTemplate();

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
    EVENTS: raw(renderEvents(extras.events)),
    GALLERY: raw(renderGallery(albums)),
    DEMO_BANNER: org.isDemo
      ? raw(
          `<div class="demo-banner"><strong>Scouthosting demo site.</strong> ${escapeHtml(
            org.displayName
          )} is a fictional unit.</div>`
        )
      : "",
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = ctx[key];
    if (v && typeof v === "object" && v[RAW] !== undefined) return v[RAW];
    return escapeHtml(v ?? "");
  });
}
