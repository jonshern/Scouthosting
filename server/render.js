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
import { isLiveBlockType, renderLiveBlock } from "../lib/blocks/index.js";

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

// Hero photo strip — three or four most-recent public-album photos
// laid out as a 2/1/1 grid under the hero text. Each tile gets a
// secondary-spectrum top border so the strip echoes the marketing
// site's locked design. Returns an empty string when no photos so
// the hero collapses gracefully.
function renderHeroPhotos(photos) {
  if (!photos || !photos.length) return "";
  const tones = ["accent", "sky", "raspberry", "plum"];
  const slice = photos.slice(0, 4);
  const tiles = slice
    .map((p, i) => {
      const tone = tones[i % tones.length];
      const caption = p.caption ? escapeHtml(p.caption) : "";
      return `<a class="hero-photo hero-photo--${escapeHtml(tone)}" href="/photos" aria-label="${caption || "Open the photo gallery"}" style="--cc:var(--${escapeHtml(tone)})">
        <img src="/uploads/${escapeHtml(p.filename)}" alt="${caption}" loading="lazy">
      </a>`;
    })
    .join("");
  return `<div class="hero__photos" aria-hidden="false">${tiles}</div>
    <style>
      .hero__photos{margin-top:32px;display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;height:340px;border-radius:6px;overflow:hidden}
      .hero-photo{display:block;border-top:5px solid var(--cc);border-radius:6px;overflow:hidden;background:#0f172a;position:relative}
      .hero-photo:first-child{grid-row:1 / span 2}
      .hero-photo img{display:block;width:100%;height:100%;object-fit:cover}
      .hero-photo:focus-visible{outline:3px solid var(--cc);outline-offset:2px}
      @media (max-width:720px){
        .hero__photos{grid-template-columns:1fr 1fr;grid-template-rows:auto auto;height:auto;gap:6px}
        .hero-photo:first-child{grid-row:auto;grid-column:1/-1}
        .hero-photo img{aspect-ratio:16/9;height:auto}
      }
    </style>`;
}

// Render the leader-defined custom blocks (text, image, CTA, plus
// live blocks like events/photos/posts/contact) that follow the
// gallery on the public homepage. Blocks render in the order they
// appear in `page.customBlocks` — the canvas array IS the source of
// truth for ordering.
//
// `liveBlocksData` is a map of block.id → pre-fetched data, built by
// `fetchLiveBlocksData` from lib/blocks/. Static blocks (text/image/
// cta) ignore it; live blocks pull their content out of it.
// Take a blocks array (Page.customBlocks for the homepage,
// CustomPage.blocks for /p/:slug) and a live-data map keyed by
// block.id (built by lib/blocks#fetchLiveBlocksData) and return the
// rendered HTML string. If the array is empty, return "" so callers
// can decide on their own fallback.
export function renderBlockList(blocks, liveBlocksData = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const html = list
    .filter((b) => b && b.id && b.type)
    .map((b) => renderCustomBlock(b, liveBlocksData[b.id]))
    .filter(Boolean)
    .join("\n");
  if (!html) return "";
  return `${html}
    <style>
      .cms-block{padding:3rem 0}
      .cms-block .wrap{max-width:65ch}
      .cms-block--image .wrap{max-width:980px}
      .cms-block h2{font-family:'Newsreader',Georgia,serif;font-size:2rem;margin:0 0 1rem;color:var(--ink-900)}
      .cms-block .cms-body{line-height:1.7;color:var(--ink-800)}
      .cms-block--image figure{margin:0}
      .cms-block--image img{display:block;width:100%;height:auto;border-radius:12px}
      .cms-block--image figcaption{margin-top:.6rem;color:var(--ink-500);font-size:.9rem;text-align:center}
      .cms-block--cta .wrap{background:var(--primary);color:#fff;border-radius:14px;padding:2rem 2.25rem;text-align:center;max-width:720px}
      .cms-block--cta h2{color:#fff;font-family:'Inter Tight',Inter,sans-serif;font-size:1.6rem}
      .cms-block--cta p{margin:0 0 1.25rem;color:rgba(255,255,255,.85)}
      .cms-block--cta .btn{background:var(--accent);color:var(--ink);border:0;padding:.7rem 1.4rem;border-radius:8px;font-weight:600;text-decoration:none;display:inline-block}
    </style>`;
}

function renderCustomBlocks(page, liveBlocksData = {}) {
  const html = renderBlockList(page?.customBlocks, liveBlocksData);
  // Empty-canvas fallback: site.html now defers everything between
  // hero and footer to this function, so a homepage with no blocks
  // would otherwise be a void. Render a neutral "in progress" stub
  // so leaders have an obvious next action.
  if (!html) {
    return `
    <section class="section cms-empty">
      <div class="wrap" style="max-width:560px;text-align:center;padding:4rem 1rem">
        <p style="color:var(--ink-500);margin:0 0 .5rem;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase">Homepage in progress</p>
        <h2 style="font-family:'Newsreader',Georgia,serif;font-size:1.6rem;color:var(--ink-800);margin:0 0 1rem">This unit's homepage is still being set up.</h2>
        <p style="color:var(--ink-600);line-height:1.6">Sign-ins, calendar, photos, and forms still work — visit them from the menu above.</p>
      </div>
    </section>`;
  }
  return html;
}

function renderCustomBlock(b, liveData) {
  if (!b || !b.type) return "";
  if (isLiveBlockType(b.type)) {
    return renderLiveBlock(b, liveData, { escapeHtml, textToHtml });
  }
  if (b.type === "text") {
    const heading = b.title ? `<h2>${escapeHtml(b.title)}</h2>` : "";
    const body = b.body ? `<div class="cms-body">${textToHtml(b.body)}</div>` : "";
    if (!heading && !body) return "";
    return `
    <section class="section cms-block cms-block--text">
      <div class="wrap">${heading}${body}</div>
    </section>`;
  }
  if (b.type === "image") {
    if (!b.filename) return "";
    const alt = escapeHtml(b.alt || b.caption || "");
    const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : "";
    return `
    <section class="section cms-block cms-block--image">
      <div class="wrap">
        <figure>
          <img src="/uploads/${escapeHtml(b.filename)}" alt="${alt}" loading="lazy">
          ${caption}
        </figure>
      </div>
    </section>`;
  }
  if (b.type === "cta") {
    const heading = b.title ? `<h2>${escapeHtml(b.title)}</h2>` : "";
    const body = b.body ? `<p>${escapeHtml(b.body)}</p>` : "";
    const button =
      b.buttonLabel && b.buttonLink
        ? `<a class="btn" href="${escapeHtml(b.buttonLink)}">${escapeHtml(b.buttonLabel)}</a>`
        : "";
    if (!heading && !body && !button) return "";
    return `
    <section class="section cms-block cms-block--cta">
      <div class="wrap">${heading}${body}${button}</div>
    </section>`;
  }
  return "";
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


/* ------------------ Standalone event pages ------------------ */

function pageShell(org, title, body, seoExtras = {}) {
  const headSeo = (seoExtras.meta || "") + (seoExtras.jsonLd || "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(org.displayName)}</title>
${headSeo}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<style>
:root{--primary:${escapeHtml(org.primaryColor || "#0f172a")};--accent:${escapeHtml(org.accentColor || "#1d4ed8")}}
.event-detail{padding:3rem 0}
.event-detail .meta{display:grid;grid-template-columns:120px 1fr;gap:.6rem 1.5rem;margin:1.5rem 0;color:var(--ink-700)}
.event-detail .meta dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-500);font-weight:600}
.event-detail .meta dd{margin:0;font-weight:500}
.event-detail .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0 2rem}
.rsvp-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:1.5rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 8px 24px rgba(15,58,31,.06);margin:1rem 0 2rem}
.rsvp-card h2{margin-top:0;font-size:1.4rem}
.rsvp-card form{margin-top:.75rem}
.rsvp-row{display:flex;gap:1rem;margin-bottom:.6rem}
.rsvp-row label{flex:1}
.rsvp-card label{display:block;font-size:.88rem;font-weight:500;color:var(--ink-700);margin-bottom:.55rem}
.rsvp-card input,.rsvp-card select,.rsvp-card textarea{display:block;width:100%;margin-top:.3rem;padding:.55rem .7rem;border:1px solid var(--ink-300);border-radius:8px;font:inherit;background:#fff;color:var(--ink-900)}
.rsvp-card input:focus,.rsvp-card select:focus,.rsvp-card textarea:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
.rsvp-actions{display:flex;align-items:center;gap:.75rem;margin-top:.4rem}
.rsvp-counts{display:flex;gap:1.5rem;margin:.4rem 0 .8rem;color:var(--ink-700);font-size:.95rem}
.rsvp-counts strong{color:var(--ink-900)}
.rsvp-flash{padding:.55rem .85rem;border-radius:8px;margin-bottom:.8rem;font-size:.9rem}
.rsvp-flash-ok{background:#eaf6ec;border:1px solid #b9dec1;color:#15532b}
.rsvp-flash-err{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614}
.slots-list{list-style:none;padding:0;margin:.5rem 0 0;display:grid;gap:.6rem}
.slots-list li{background:var(--line-soft);border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem;display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
.slots-list h3{margin:0 0 .15rem;font-size:1rem;font-family:'Inter Tight',Inter,sans-serif}
.slots-list p{margin:0;color:var(--ink-700);font-size:.92rem}
.slots-list .slot-head{flex:1;min-width:220px}
.slots-list .tag{display:inline-block;background:#fff;border:1px solid var(--line);padding:.05rem .4rem;border-radius:5px;font-size:.78rem;color:var(--ink-500);margin-left:.25rem}
.slot-action{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.slot-action.slot-anon{flex-direction:column;align-items:stretch;gap:.4rem;min-width:240px}
.slot-action.slot-anon input{padding:.45rem .6rem;border:1px solid var(--ink-300);border-radius:8px;font:inherit}
.slot-action button{padding:.5rem .9rem !important;font-size:.9rem !important}
.event-detail .map-actions{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem}
.event-detail .map-actions a{font-size:.85rem;padding:.4rem .7rem}
.event-detail .body{max-width:65ch;line-height:1.65}
.event-detail .body p{margin:0 0 1em}
.event-list{padding:3rem 0}
.event-list .events li time{background:var(--primary)}
.back{display:inline-block;margin-bottom:1rem;color:var(--ink-500);text-decoration:none;font-size:.92rem}
.back:hover{color:var(--primary)}
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
      <li><a href="/calendar">Calendar</a></li>
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

import { metaTags, eventJsonLd, organizationJsonLd } from "../lib/seo.js";
import { categoryMeta } from "../lib/eventCategories.js";

const PALETTE_VAR = (key) => `var(--${key})`;

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
    ${
      e.category
        ? (() => {
            const meta = categoryMeta(e.category);
            const ink = meta.color === "accent" || meta.color === "butter";
            return `<p style="margin-top:-.4rem"><span class="event-cat-tag" style="background:${PALETTE_VAR(meta.color)};${ink ? "color:var(--ink)" : "color:#fff"};display:inline-block;padding:.18rem .65rem;border-radius:999px;font-size:.7rem;font-weight:700;letter-spacing:.04em">${escapeHtml(meta.label)}</span></p>`;
          })()
        : ""
    }

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
  const url = ctx.canonicalUrl || `https://${org.slug}.${ctx.apexDomain || "compass.app"}/events/${e.id}`;
  const seo = {
    meta: metaTags({
      title: `${e.title} — ${org.displayName}`,
      description: e.description?.slice(0, 220) || `${e.title} on ${e.startsAt.toLocaleDateString("en-US")}`,
      url,
      type: "event",
    }),
    jsonLd: eventJsonLd({ event: e, org, url }),
  };
  return pageShell(org, e.title, body, seo);
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
      .forms-list li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:.7rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
      .forms-list a{text-decoration:none;color:inherit}
      .forms-list a strong{color:var(--primary)}
      .tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);padding:.05rem .4rem;border-radius:5px;font-size:.75rem;color:#6b7280;margin-left:.4rem}
    </style>`;
  return pageShell(org, "Forms & documents", body);
}

export function renderDirectory(org, members, { needsSignIn, notAMember, role, messagableIds } = {}) {
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
        ${
          messagableIds && messagableIds.has(m.id)
            ? `<br><a class="btn small" href="/messages/${escapeHtml(m.id)}" style="margin-top:.4rem;display:inline-block">Message in Compass</a>`
            : ""
        }
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
      .event-list ul.items li{display:flex;gap:1.5rem;justify-content:space-between;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem}
      .event-list ul.items li.indent{margin-left:1.5rem;background:var(--line-soft)}
      .event-list ul.items h3{margin:0 0 .15rem;font-size:1rem;font-family:'Inter Tight',Inter,sans-serif}
      .event-list ul.items p{margin:0}
      .tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);padding:.1rem .45rem;border-radius:5px;font-size:.78rem;color:#6b7280;margin-right:.25rem}
      .tag-diet{background:#fff7e6;border-color:#ecd87a;color:#7d5a00}
      .diet-flags{margin:.3rem 0 0 !important}
    </style>`;
  return pageShell(org, "Members", body);
}

// Public calendar — full-featured FullCalendar control with month,
// week, day, list, and year views. The control fetches events from
// /calendar.json and handles its own navigation. We still server-render
// a category-filter chip row that reloads the page with ?cat=<slug>;
// the chips show up regardless of JS state and let URL-shared calendars
// stay scoped.
//
// `events` is the already-expanded list for the current visible window
// — used here only to derive which category chips to surface. The
// canonical events feed is the JSON endpoint.
export function renderCalendarMonth(org, events, ctx = {}) {
  const filter = ctx.categoryFilter ? String(ctx.categoryFilter) : "";
  const slug = (s) => String(s || "").toLowerCase().replace(/[\s_]+/g, "-");

  // Build the category-filter chip row from whatever's present in the
  // visible window. Chip clicks reload the page with ?cat=<slug>; the
  // FullCalendar feed URL also picks up the filter.
  const presentCategories = Array.from(
    new Map(events.filter((e) => e.category).map((e) => [e.category, categoryMeta(e.category)])).entries(),
  );
  const chipHref = (cat) => (cat ? `/calendar?cat=${encodeURIComponent(cat)}` : "/calendar");
  const filterChips = presentCategories.length
    ? `<div class="cal-filters">
        <a class="event-chip${!filter ? " event-chip--on" : ""}" href="${chipHref("")}">All</a>
        ${presentCategories
          .map(([raw, meta]) => {
            const s = slug(raw);
            const on = s === slug(filter);
            return `<a class="event-chip${on ? " event-chip--on" : ""}" href="${chipHref(s)}" style="--cc:${PALETTE_VAR(meta.color)}">${escapeHtml(meta.label)}</a>`;
          })
          .join("")}
      </div>`
    : "";

  // The events feed URL — FullCalendar appends ?start=&end= itself.
  const feedUrl = filter ? `/calendar.json?cat=${encodeURIComponent(filter)}` : "/calendar.json";

  // The init script is JSON-encoded so safely embeds in HTML.
  const fcConfig = JSON.stringify({
    feedUrl,
    primary: org.primaryColor || "#0f172a",
    accent: org.accentColor || "#1d4ed8",
  });

  const body = `
  <section class="event-list">
    <a class="back" href="/">← Home</a>
    <h1>Calendar</h1>
    <p class="muted">Click any event for details and to RSVP. Use the toolbar to switch between month, week, day, list, and year views.</p>

    ${filterChips}

    <div class="cal-actions-row">
      <a class="btn ghost small" href="/events">Events list</a>
      <a class="btn ghost small" href="/calendar.ics">Subscribe (.ics)</a>
    </div>

    <div id="fc" class="fc-host" aria-busy="true">
      <p class="cal-empty fc-loading">Loading calendar…</p>
    </div>

    <noscript>
      <div class="cal-empty" style="margin-top:1.25rem;padding:1rem;background:#fff;border:1px solid var(--line);border-radius:10px">
        The calendar needs JavaScript. <a href="/events">See the events list →</a>
      </div>
    </noscript>
  </section>

  <script src="/vendor/fullcalendar/index.global.min.js" defer></script>
  <script>
    (function () {
      var cfg = ${fcConfig};
      function init() {
        if (typeof FullCalendar === "undefined") {
          // Library failed to load (offline / CSP / blocker).
          var host = document.getElementById("fc");
          if (host) {
            host.removeAttribute("aria-busy");
            host.innerHTML = '<p class="cal-empty">Calendar couldn\\'t load. <a href="/events">See the events list →</a></p>';
          }
          return;
        }
        var el = document.getElementById("fc");
        if (!el) return;
        el.removeAttribute("aria-busy");
        el.innerHTML = "";
        var cal = new FullCalendar.Calendar(el, {
          initialView: "dayGridMonth",
          headerToolbar: {
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth,multiMonthYear",
          },
          buttonText: {
            today: "Today",
            month: "Month",
            week: "Week",
            day: "Day",
            list: "List",
            multiMonthYear: "Year",
          },
          height: "auto",
          firstDay: 0,
          nowIndicator: true,
          dayMaxEventRows: 3,
          eventDisplay: "block",
          eventTimeFormat: { hour: "numeric", minute: "2-digit", meridiem: "short" },
          events: cfg.feedUrl,
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
    .cal-filters{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0}
    .cal-actions-row{display:flex;gap:.4rem;flex-wrap:wrap;margin:0 0 1rem}
    .cal-empty{padding:2rem 1rem;text-align:center;color:var(--ink-500);font-size:.95rem}

    /* FullCalendar host — keep the control inside the page chrome and
       restyle a few defaults to fit Scouthosting's typography. */
    .fc-host{background:#fff;border:1px solid var(--line);border-radius:12px;padding:1.1rem;box-shadow:0 1px 2px rgba(15,58,31,.04)}
    .fc-host.fc{font-family:inherit}
    .fc-loading{opacity:.6;font-style:italic}
    .fc .fc-toolbar-title{font-family:'Inter Tight',Inter,sans-serif;font-size:1.4rem;font-weight:600;letter-spacing:-0.01em;color:var(--ink-900)}
    .fc .fc-button{background:#f7f4e8;border:1px solid #e2dab8;color:var(--ink-700);font-weight:600;text-transform:none;box-shadow:none;padding:.42rem .85rem;font-size:.88rem}
    .fc .fc-button:hover{background:#efe9d2;border-color:#cdc093;color:var(--ink-900)}
    .fc .fc-button:focus{box-shadow:0 0 0 2px rgba(14,51,32,.18)}
    .fc .fc-button-primary:not(:disabled).fc-button-active,
    .fc .fc-button-primary:not(:disabled):active{background:var(--primary);border-color:var(--primary);color:#fff}
    .fc .fc-col-header-cell-cushion{font-family:'Inter Tight',Inter,sans-serif;font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-500);padding:.6rem 0}
    .fc .fc-daygrid-day-number{font-family:'Inter Tight',Inter,sans-serif;color:var(--ink-700);font-weight:600;padding:.4rem .5rem}
    .fc .fc-day-today{background:#fffbe6 !important}
    .fc .fc-day-today .fc-daygrid-day-number{color:var(--primary)}
    .fc .fc-event{border-radius:5px;font-size:.78rem;font-weight:500;cursor:pointer}
    .fc .fc-event:hover{filter:brightness(1.05)}
    .fc .fc-list-event:hover td{background:var(--line-soft)}
    .fc .fc-list-day-cushion{background:var(--line-soft);font-family:'Inter Tight',Inter,sans-serif;font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-700)}
    .fc-direction-ltr .fc-list-event-time{color:var(--ink-500);font-variant-numeric:tabular-nums}

    @media (max-width:720px){
      .fc-host{padding:.6rem}
      .fc .fc-toolbar{gap:.4rem}
      .fc .fc-toolbar-title{font-size:1.1rem}
      .fc .fc-button{padding:.35rem .55rem;font-size:.78rem}
    }
  </style>`;
  const url = `https://${org.slug}.${ctx.apexDomain || "compass.app"}/calendar`;
  const seo = {
    meta: metaTags({
      title: `Calendar — ${org.displayName}`,
      description: `Calendar of meetings, campouts, service projects, and ceremonies for ${org.displayName}.`,
      url,
    }),
    jsonLd: organizationJsonLd({ org, url: `https://${org.slug}.${ctx.apexDomain || "compass.app"}/` }),
  };
  return pageShell(org, "Calendar", body, seo);
}

export function renderEventsList(org, events, ctx = {}) {
  // Build a category-filter chip row from the categories actually
  // present in the visible events. URL-driven so it works without JS:
  // /events?category=campout filters to that bucket, /events clears.
  const filter = ctx.categoryFilter ? String(ctx.categoryFilter) : "";
  const visible = filter
    ? events.filter((e) => (e.category || "").toLowerCase().replace(/[\s_]+/g, "-") === filter.toLowerCase().replace(/[\s_]+/g, "-"))
    : events;
  const presentCategories = Array.from(
    new Map(
      events
        .filter((e) => e.category)
        .map((e) => [e.category, categoryMeta(e.category)]),
    ).entries(),
  );
  const filterChips = presentCategories.length
    ? `<div class="event-filters" style="display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0">
        <a class="event-chip${!filter ? " event-chip--on" : ""}" href="/events">All</a>
        ${presentCategories
          .map(([raw, meta]) => {
            const slug = String(raw).toLowerCase().replace(/[\s_]+/g, "-");
            const on = slug === filter.toLowerCase().replace(/[\s_]+/g, "-");
            return `<a class="event-chip${on ? " event-chip--on" : ""}" href="/events?category=${encodeURIComponent(slug)}" style="--cc:${PALETTE_VAR(meta.color)}">${escapeHtml(meta.label)}</a>`;
          })
          .join("")}
      </div>
      <style>
        .event-chip{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .85rem;border-radius:999px;font-size:.82rem;font-weight:600;color:var(--ink);background:var(--surface);border:1.5px solid var(--line);text-decoration:none}
        .event-chip:hover{border-color:var(--ink)}
        .event-chip--on{background:var(--cc,var(--primary));color:#fff;border-color:var(--cc,var(--primary))}
        .event-chip[href="/events"].event-chip--on{background:var(--ink);color:#fff;border-color:var(--ink)}
        .event-cat-tag{display:inline-block;padding:.15rem .55rem;border-radius:999px;font-size:.7rem;font-weight:700;letter-spacing:.04em;color:#fff}
        .event-list .events li{position:relative}
      </style>`
    : "";
  const items = visible.length
    ? visible
        .map((e) => {
          const d = new Date(e.startsAt);
          const meta = e.category ? categoryMeta(e.category) : null;
          const tag = meta
            ? `<span class="event-cat-tag" style="background:${PALETTE_VAR(meta.color)};${meta.color === "accent" || meta.color === "butter" ? "color:var(--ink)" : ""}">${escapeHtml(meta.label)}</span>`
            : "";
          return `
    <li>
      <time datetime="${escapeHtml(d.toISOString())}">
        <span class="m">${escapeHtml(MONTH_SHORT[d.getMonth()])}</span>
        <span class="d">${d.getDate()}</span>
      </time>
      <div>
        <h3><a href="/events/${escapeHtml(e.id)}" style="color:inherit;text-decoration:none">${escapeHtml(e.title)}</a> ${tag}</h3>
        <p>${escapeHtml(fmtTime(e.startsAt))}${e.location ? ` · ${escapeHtml(e.location)}` : ""}</p>
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
    <p style="margin:1rem 0 0;display:flex;gap:.4rem;flex-wrap:wrap">
      <a class="btn primary" href="/calendar">Month view</a>
      <a class="btn ghost" href="/calendar.ics">Subscribe (.ics)</a>
    </p>
    ${filterChips}
    ${
      visible.length
        ? `<ul class="events">${items}</ul>`
        : filter
          ? `<p class="muted">No <strong>${escapeHtml(filter)}</strong> events scheduled. <a href="/events">See all →</a></p>`
          : `<p class="muted">No upcoming events on the calendar.</p>`
    }
  </section>`;
  const url = `https://${org.slug}.${ctx.apexDomain || "compass.app"}/events`;
  const seo = {
    meta: metaTags({
      title: `Events — ${org.displayName}`,
      description: `Upcoming meetings, campouts, service projects, and ceremonies for ${org.displayName}.`,
      url,
    }),
    jsonLd: organizationJsonLd({ org, url: `https://${org.slug}.${ctx.apexDomain || "compass.app"}/` }),
  };
  return pageShell(org, "Events", body, seo);
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

function renderPostCard(p, { showLink = true, viewerUserId = null } = {}) {
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

  // Reaction buttons. p.reactions is the optional summary
  // ({ likes, bookmarks, youLiked, youBookmarked }) the route handler
  // attaches per post. Anonymous viewers see the like count but the
  // toggle button only works for signed-in members.
  const reactions = p.reactions || { likes: 0, bookmarks: 0, youLiked: false, youBookmarked: false };
  const reactionsHtml = `
    <div class="post-reactions" style="margin-top:.6rem;display:flex;gap:.5rem;align-items:center">
      ${
        viewerUserId
          ? `<form method="post" action="/posts/${escapeHtml(p.id)}/react" class="inline">
              <input type="hidden" name="kind" value="like">
              <button type="submit" class="post-react-btn${reactions.youLiked ? " on" : ""}" aria-pressed="${reactions.youLiked ? "true" : "false"}">
                <span aria-hidden="true">👏</span>
                <span>${reactions.likes || ""}</span>
              </button>
            </form>
            <form method="post" action="/posts/${escapeHtml(p.id)}/react" class="inline">
              <input type="hidden" name="kind" value="bookmark">
              <button type="submit" class="post-react-btn${reactions.youBookmarked ? " on" : ""}" aria-pressed="${reactions.youBookmarked ? "true" : "false"}" aria-label="Bookmark">
                <span aria-hidden="true">${reactions.youBookmarked ? "🔖" : "🏷️"}</span>
                <span class="visually-hidden">Bookmark</span>
              </button>
            </form>`
          : reactions.likes
            ? `<span class="post-react-btn" aria-disabled="true"><span aria-hidden="true">👏</span><span>${reactions.likes}</span></span>`
            : ""
      }
    </div>`;
  return `
    <article class="post${p.pinned ? " post-pinned" : ""}">
      ${p.pinned ? `<span class="badge">Pinned</span>` : ""}
      ${titleHtml}
      <div class="post-body">${textToHtml(p.body)}</div>
      ${photoGrid}
      ${reactionsHtml}
      <footer class="muted small">${escapeHtml(date)}${
        p.author?.displayName ? ` · ${escapeHtml(p.author.displayName)}` : ""
      }${
        showLink && p.title
          ? ` · <a href="/posts/${escapeHtml(p.id)}">Permalink</a>`
          : ""
      }</footer>
    </article>`;
}


export function renderCustomPage(org, page, { liveBlocksData = {} } = {}) {
  // Prefer the canvas blocks when present; fall back to the legacy
  // markdown body so pre-PR-2 content keeps rendering during the
  // cutover. Either way the page title sits on top with a back-to-
  // home link.
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const blocksHtml = blocks.length ? renderBlockList(blocks, liveBlocksData) : "";
  const inner = blocksHtml
    || `<div class="prose" style="max-width:65ch;line-height:1.65">${textToHtml(page.body || "")}</div>`;
  const body = `
    <section class="event-list">
      <a class="back" href="/">← Home</a>
      <h1>${escapeHtml(page.title)}</h1>
      ${inner}
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
      .eagle-list li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:.75rem 1rem}
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
      .mbc-list li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem}
      .mbc-list h3{margin:0;font-size:1rem}
      .mbc-list .badges{margin:.4rem 0 0}
      .tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);padding:.05rem .45rem;border-radius:5px;font-size:.78rem;color:var(--ink-500);margin-right:.2rem}
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
      .vid-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:.85rem 1rem 1rem}
      .vid-frame{position:relative;padding-top:56.25%;border-radius:8px;overflow:hidden;background:#000;margin-bottom:.6rem}
      .vid-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .vid-card h3{margin:0 0 .15rem;font-size:1.05rem}
      .tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);padding:.05rem .45rem;border-radius:5px;font-size:.78rem;margin-left:.25rem}
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
      .rb-form{background:#fff;border:1px solid var(--line);border-radius:14px;padding:1.25rem;display:grid;gap:.75rem;max-width:560px;margin-top:1rem}
      .rb-form label{display:block;font-weight:500}
      .rb-form input,.rb-form textarea,.rb-form select{display:block;width:100%;margin-top:.3rem;padding:.5rem .65rem;border:1px solid var(--ink-300);border-radius:8px;font:inherit}
      .rb-form .btn{padding:.6rem 1.1rem;border-radius:8px;border:0;background:${escapeHtml(org.primaryColor || "#1d6b39")};color:#fff;font-weight:600;cursor:pointer}
      .rb-list{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.6rem}
      .rb-list li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:.75rem 1rem;display:flex;gap:.75rem;align-items:center}
      .tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);padding:.05rem .45rem;border-radius:5px;font-size:.78rem;margin-left:.25rem}
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
      .trip-meal{background:#fff;border:1px solid var(--line);border-radius:14px;padding:1rem 1.25rem;margin-bottom:1rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 6px 18px rgba(15,58,31,.04)}
      .trip-meal h3{margin:0 0 .15rem;font-size:1.1rem;font-family:'Inter Tight',Inter,sans-serif}
      .trip-meal table,.trip-shop table.shopping{width:100%;border-collapse:collapse;margin-top:.5rem;font-size:.93rem}
      .trip-meal th,.trip-shop th{text-align:left;padding:.4rem .55rem;border-bottom:1px solid var(--line);font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-500);font-weight:600}
      .trip-meal td,.trip-shop td{padding:.4rem .55rem;border-bottom:1px solid var(--line)}
      .trip-meal tr:last-child td,.trip-shop tr:last-child td{border-bottom:0}
      .trip-meal .num,.trip-shop .num{text-align:right;font-variant-numeric:tabular-nums}
      .trip-shop{background:#fff;border:1px solid var(--line);border-radius:14px;padding:1.25rem 1.5rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 6px 18px rgba(15,58,31,.04)}
      .tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);padding:.05rem .4rem;border-radius:5px;font-size:.78rem;color:var(--ink-500);margin-right:.25rem}
      .trip-tag{display:inline-block;background:var(--line-soft);border:1px solid var(--line);border-radius:999px;padding:.1rem .55rem;font-size:.78rem;color:var(--ink-500);margin-right:.25rem}
      .trip-warn{background:#fbe8e3;border:1px solid #f0bcb1;color:#7d2614;padding:.55rem .85rem;border-radius:8px;margin:.55rem 0;font-size:.92rem}
      @media print{
        @page{margin:0.6in}
        .site-header,.site-footer,.back,.trip-actions,.no-print{display:none !important}
        .event-list{padding:0}
        body{background:#fff !important;color:#000 !important;font-size:11pt}
        h1{font-size:18pt}
        h2{font-size:14pt;page-break-after:avoid}
        h3{font-size:12pt;page-break-after:avoid}
        .trip-section{page-break-inside:avoid}
        .trip-tag{border-color:#999 !important;background:#fff !important}
        .trip-warn{background:#fff !important;border:1.5px solid #000 !important;color:#000 !important}
        a{color:#000 !important;text-decoration:none}
        ul,ol{page-break-inside:avoid}
        table{page-break-inside:auto}
        tr{page-break-inside:avoid;page-break-after:auto}
      }
    </style>`;
  return pageShell(org, `Trip plan · ${ev.title}`, body);
}

export function renderPostsList(org, posts, { viewerUserId = null } = {}) {
  const items = posts.length
    ? posts.map((p) => renderPostCard(p, { viewerUserId })).join("")
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
            <div class="chat-form-actions">
              <button class="btn primary" type="submit">Send</button>
              <button class="btn ghost" type="button" id="chat-poll-btn" title="Add a poll">📊 Poll</button>
              <button class="btn ghost" type="button" id="chat-rsvp-btn" title="Embed an event RSVP">🗓 Event</button>
              <label class="btn ghost" for="chat-photo-input" title="Attach a photo" style="cursor:pointer">📷 Photo</label>
              <input type="file" id="chat-photo-input" accept="image/*" hidden>
            </div>
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
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    min-height: 480px;
  }
  .chat-sidebar { border-right: 1px solid #eef1f5; background: #faf3e3; }
  .chat-channels { list-style: none; margin: 0; padding: .4rem; display: grid; gap: .15rem; }
  .chat-channels li[data-channel-id] { padding: .5rem .65rem; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .chat-channels li[data-channel-id]:hover { background: #f1ead5; }
  .chat-channels li.is-active { background: #0f172a; color: #fff; }
  .chat-channels li.is-active .chat-meta,
  .chat-channels li.is-active .chat-preview,
  .chat-channels li.is-active .chat-ts { color: rgba(255,255,255,.7); }
  .chat-channels .chat-meta { display: block; font-size: 11px; color: #64748b; margin-top: .15rem; }
  .chat-channels .chat-channel-row { display: flex; align-items: baseline; gap: .4rem; }
  .chat-channels .chat-channel-row strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chat-channels .chat-ts { font-size: 11px; color: #64748b; flex-shrink: 0; }
  .chat-channels .chat-preview {
    font-size: 12px; color: #64748b; margin-top: .15rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chat-channels li.is-unread strong,
  .chat-channels li.is-unread .chat-preview { color: #0f172a; font-weight: 600; }
  .chat-channels li.is-unread.is-active strong,
  .chat-channels li.is-unread.is-active .chat-preview { color: #fff; }
  .chat-channels .chat-unread-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: #1d4ed8; margin-right: .35rem; vertical-align: middle;
  }
  .chat-channels .chat-section-label {
    font-size: 11px; color: #64748b; text-transform: uppercase;
    letter-spacing: .08em; padding: .75rem .65rem .25rem; cursor: default;
  }
  .chat-channels .chat-section-label:first-child { padding-top: .25rem; }
  .chat-main { display: flex; flex-direction: column; min-height: 480px; }
  .chat-header { padding: .75rem 1rem; border-bottom: 1px solid #eef1f5; }
  .chat-header h2 { margin: 0; font-family: Newsreader, Georgia, serif; font-weight: 500; font-size: 22px; }
  .chat-status { font-size: 12px; color: #64748b; margin-top: .15rem; }
  .chat-status .ok { color: #059669; }
  .chat-status .warn { color: #dc2626; }
  .chat-banner { background: #fbe8e3; border: 1px solid #f0bcb1; color: #7d2614; padding: .65rem .85rem; margin: .65rem 1rem; border-radius: 8px; font-size: 13px; }
  .chat-messages { list-style: none; margin: 0; padding: 1rem; flex: 1; display: flex; flex-direction: column; gap: .65rem; overflow-y: auto; max-height: 60vh; }
  .chat-messages li { display: grid; grid-template-columns: minmax(0, 1fr); gap: .15rem; }
  .chat-messages .author { font-size: 12px; color: #64748b; font-weight: 600; }
  .chat-messages .body { background: #f7f8fa; border-radius: 10px; padding: .55rem .75rem; font-size: 14px; line-height: 1.45; word-wrap: break-word; white-space: pre-wrap; }
  .chat-messages li.system .body { background: #fff7e6; font-style: italic; color: #7d5a00; }
  .chat-messages li.deleted .body { font-style: italic; color: #64748b; }
  .chat-messages .ts { font-size: 11px; color: #64748b; margin-top: .1rem; }
  .chat-form { display: flex; gap: .4rem; padding: .65rem 1rem; border-top: 1px solid #eef1f5; align-items: flex-end; }
  .chat-form textarea { flex: 1; resize: vertical; min-height: 44px; padding: .55rem .65rem; border: 1px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 14px; }
  .chat-form-actions { display: flex; flex-direction: column; gap: .35rem; }
  .chat-form-actions button { white-space: nowrap; }
  .chat-reactions { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; }
  .chat-reaction { display: inline-flex; align-items: center; gap: .25rem; padding: .15rem .5rem; background: #faf3e3; border: 1px solid #eef1f5; border-radius: 999px; font-size: 12px; cursor: pointer; line-height: 1.2; }
  .chat-reaction:hover { background: #f1ead5; }
  .chat-reaction.is-mine { background: #bcd0f4; border-color: #1d4ed8; color: #0f172a; font-weight: 600; }
  .chat-reaction-count { font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
  .chat-reaction.is-mine .chat-reaction-count { color: #0f172a; }
  .chat-reaction-add { background: transparent; color: #64748b; padding: .15rem .5rem; }
  .chat-reaction-add:hover { background: #f7f8fa; color: #0f172a; }
  .chat-poll { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: .65rem .85rem; margin-top: .45rem; }
  .chat-poll-question { font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: .5rem; }
  .chat-poll-options { display: grid; gap: .35rem; }
  .chat-poll-option { position: relative; display: flex; align-items: center; gap: .5rem; padding: .45rem .65rem; border: 1px solid #e2e8f0; background: #faf3e3; border-radius: 8px; font-size: 13px; cursor: pointer; overflow: hidden; }
  .chat-poll-option:hover:not(:disabled) { border-color: #0f172a; }
  .chat-poll-option.is-mine { border-color: #1d4ed8; background: #bcd0f4; }
  .chat-poll-option.is-closed { cursor: default; opacity: .85; }
  .chat-poll-bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(200,233,74,0.3); pointer-events: none; }
  .chat-poll-option.is-mine .chat-poll-bar { background: rgba(200,233,74,0.55); }
  .chat-poll-label { position: relative; flex: 1; }
  .chat-poll-count { position: relative; font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; min-width: 1.5rem; text-align: right; }
  .chat-poll-meta { font-size: 11px; color: #64748b; margin-top: .35rem; }
  .chat-rsvp { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: .75rem .85rem; margin-top: .45rem; }
  .chat-rsvp-deleted { background: #faf3e3; }
  .chat-rsvp-head { margin-bottom: .55rem; }
  .chat-rsvp-title { font-family: 'Newsreader', Georgia, serif; font-size: 17px; color: #0f172a; text-decoration: none; font-weight: 500; }
  .chat-rsvp-title:hover { color: #1d6b39; }
  .chat-rsvp-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
  .chat-rsvp-actions { display: flex; gap: .35rem; flex-wrap: wrap; }
  .chat-rsvp-btn { display: inline-flex; align-items: center; gap: .35rem; padding: .35rem .7rem; border: 1px solid #e2e8f0; background: #faf3e3; border-radius: 999px; font-family: inherit; font-size: 13px; cursor: pointer; }
  .chat-rsvp-btn:hover { border-color: #0f172a; }
  .chat-rsvp-btn.is-mine { background: #bcd0f4; border-color: #1d4ed8; color: #0f172a; font-weight: 600; }
  .chat-rsvp-glyph { font-size: 14px; }
  .chat-rsvp-count { font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; }
  .chat-rsvp-btn.is-mine .chat-rsvp-count { color: #0f172a; }
  .chat-photo { margin-top: .45rem; max-width: 360px; }
  .chat-photo img { display: block; max-width: 100%; height: auto; border-radius: 10px; border: 1px solid #e2e8f0; cursor: zoom-in; }
  .chat-photo-caption { font-size: 12px; color: #64748b; margin-top: .25rem; }
  .chat-photo-deleted { background: #faf3e3; border: 1px dashed #e2e8f0; padding: .65rem; border-radius: 8px; color: #64748b; font-style: italic; font-size: 13px; }
  @media (max-width: 720px) {
    .chat-shell { grid-template-columns: 1fr; min-height: auto; }
    .chat-sidebar { border-right: 0; border-bottom: 1px solid #eef1f5; max-height: 200px; overflow-y: auto; }
    .chat-form { flex-direction: column; align-items: stretch; }
    .chat-form-actions { flex-direction: row; }
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
  dm: 'Direct',
};

function relTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm';
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diff < 7 * 86400_000) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderChannelLi(c, isActive) {
  const status = c.isSuspended ? ' (paused)' : c.archivedAt ? ' (archived)' : '';
  const isDm = c.kind === 'dm';
  const title = isDm
    ? (c.dmCounterpartyName || 'Direct message')
    : c.name;
  const meta = isDm ? '' : (KIND_LABEL[c.kind] || c.kind);
  const last = c.lastMessage;
  const preview = last
    ? (last.authorDisplayName ? last.authorDisplayName + ': ' : '') + (last.body || '').slice(0, 80)
    : (isDm ? 'Start a conversation' : 'No messages yet');
  const ts = last ? relTime(last.createdAt) : '';
  const unread = c.unread ? '<span class="chat-unread-dot" aria-label="unread"></span>' : '';
  return '<li data-channel-id="' + escapeHtml(c.id) + '" class="' + (isActive ? 'is-active' : '') + (c.unread ? ' is-unread' : '') + '">' +
    '<div class="chat-channel-row">' +
      '<strong>' + unread + escapeHtml(title) + '</strong>' + escapeHtml(status) +
      (ts ? '<span class="chat-ts">' + escapeHtml(ts) + '</span>' : '') +
    '</div>' +
    '<div class="chat-preview">' + escapeHtml(preview) + '</div>' +
    (meta ? '<span class="chat-meta">' + escapeHtml(meta) + '</span>' : '') +
  '</li>';
}

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
  // Sort each section by last activity (most recent first), DMs above
  // group channels. DMs and group channels render with the same row
  // markup; only the title and meta differ.
  const sortByActivity = (a, b) => {
    const ta = a.lastMessage?.createdAt || a.updatedAt || 0;
    const tb = b.lastMessage?.createdAt || b.updatedAt || 0;
    return new Date(tb) - new Date(ta);
  };
  const dms = data.channels.filter((c) => c.kind === 'dm').sort(sortByActivity);
  const groups = data.channels.filter((c) => c.kind !== 'dm').sort(sortByActivity);

  const sectionHtml = (label, list) =>
    list.length
      ? '<li class="chat-section-label">' + escapeHtml(label) + '</li>' +
        list.map((c) => renderChannelLi(c, c.id === activeChannelId)).join('')
      : '';
  channelsEl.innerHTML = sectionHtml('Direct Messages', dms) + sectionHtml('Channels', groups);

  for (const li of channelsEl.querySelectorAll('li[data-channel-id]')) {
    li.addEventListener('click', () => selectChannel(li.dataset.channelId, data.channels.find((x) => x.id === li.dataset.channelId)));
  }
  // Honor a ?channel=<id> query param so the redirect from /messages/:memberId
  // (PR-L) lands the user inside the just-sent DM thread.
  const params = new URLSearchParams(location.search);
  const requested = params.get('channel');
  if (requested && data.channels.some((c) => c.id === requested)) {
    selectChannel(requested, data.channels.find((c) => c.id === requested));
  } else if (!activeChannelId && data.channels.length) {
    const first = dms[0] || groups[0];
    selectChannel(first.id, first);
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

// Map of message id → <li> so SSE re-broadcasts (on reaction toggle /
// poll vote) update in place rather than appending duplicates.
const messageLis = new Map();

function renderMessages(list, replace) {
  if (replace) {
    messagesEl.innerHTML = '';
    messageLis.clear();
  }
  for (const m of list) {
    let li = messageLis.get(m.id);
    if (!li) {
      li = document.createElement('li');
      messagesEl.appendChild(li);
      messageLis.set(m.id, li);
    }
    li.className = '';
    if (!m.author) li.classList.add('system');
    if (m.deleted) li.classList.add('deleted');
    li.dataset.messageId = m.id;
    li.innerHTML = renderMessageInner(m);
    wireMessageActions(li, m);
    lastMessageId = m.id;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessageInner(m) {
  const author = m.author?.displayName || 'system';
  const bodyHtml = m.deleted
    ? '<em class="muted">(deleted)</em>'
    : escapeHtml(m.body || '');
  const reactionsHtml = renderReactionsBlock(m);
  const attachmentHtml = renderAttachmentBlock(m);
  return (
    '<span class="author">' + escapeHtml(author) + '</span>' +
    '<div class="body">' + bodyHtml + '</div>' +
    attachmentHtml +
    reactionsHtml +
    '<span class="ts">' + escapeHtml(fmtTime(m.createdAt)) + '</span>'
  );
}

function renderReactionsBlock(m) {
  const list = (m.reactions || []);
  const buckets = list.map((r) => {
    const cls = 'chat-reaction' + (r.youReacted ? ' is-mine' : '');
    return (
      '<button type="button" class="' + cls + '" data-emoji="' + escapeHtml(r.emoji) + '">' +
        '<span>' + escapeHtml(r.emoji) + '</span>' +
        '<span class="chat-reaction-count">' + r.count + '</span>' +
      '</button>'
    );
  }).join('');
  // Always render the picker ("+") so users can react to anything.
  const picker =
    '<button type="button" class="chat-reaction chat-reaction-add" data-emoji-picker="1" aria-label="Add reaction">+</button>';
  return '<div class="chat-reactions">' + buckets + picker + '</div>';
}

function renderAttachmentBlock(m) {
  if (!m.attachment) return '';
  if (m.attachment.kind === 'poll') return renderPollAttachment(m);
  if (m.attachment.kind === 'rsvp') return renderRsvpAttachment(m);
  if (m.attachment.kind === 'photo') return renderPhotoAttachment(m);
  return '';
}

function renderPhotoAttachment(m) {
  const p = m.attachment;
  if (p.deleted) {
    return '<div class="chat-photo chat-photo-deleted">📷 (photo removed)</div>';
  }
  const captionHtml = p.caption ? '<div class="chat-photo-caption">' + escapeHtml(p.caption) + '</div>' : '';
  return (
    '<div class="chat-photo">' +
      '<a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(p.url) + '" alt="' + escapeHtml(p.caption || 'photo') + '" loading="lazy">' +
      '</a>' +
      captionHtml +
    '</div>'
  );
}

function renderPollAttachment(m) {
  const p = m.attachment;
  const total = (p.options || []).reduce((s, o) => s + (o.count || 0), 0);
  const closed = p.closesAt && new Date(p.closesAt) < new Date();
  const optionsHtml = (p.options || []).map((o) => {
    const count = o.count || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const cls = 'chat-poll-option' + (o.youVoted ? ' is-mine' : '') + (closed ? ' is-closed' : '');
    return (
      '<button type="button" class="' + cls + '" data-poll-option="' + escapeHtml(o.id) + '"' + (closed ? ' disabled' : '') + '>' +
        '<span class="chat-poll-bar" style="width:' + pct + '%"></span>' +
        '<span class="chat-poll-label">' + escapeHtml(o.label) + '</span>' +
        '<span class="chat-poll-count">' + count + '</span>' +
      '</button>'
    );
  }).join('');
  return (
    '<div class="chat-poll" data-message-id="' + escapeHtml(m.id) + '">' +
      '<div class="chat-poll-question">📊 ' + escapeHtml(p.question) + '</div>' +
      '<div class="chat-poll-options">' + optionsHtml + '</div>' +
      '<div class="chat-poll-meta">' + total + ' vote' + (total === 1 ? '' : 's') +
        (closed ? ' · closed' : (p.closesAt ? ' · closes ' + escapeHtml(new Date(p.closesAt).toLocaleString()) : '')) +
        (p.allowMulti ? ' · multi-select' : '') +
      '</div>' +
    '</div>'
  );
}

function renderRsvpAttachment(m) {
  const e = m.attachment;
  if (e.deleted) {
    return (
      '<div class="chat-rsvp chat-rsvp-deleted">' +
        '<div class="chat-rsvp-title">🗓 Event removed</div>' +
        '<div class="chat-rsvp-meta">The original event was deleted. RSVP responses are preserved in the chat history.</div>' +
      '</div>'
    );
  }
  const start = new Date(e.startsAt);
  const dateLine = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const tally = e.tally || { yes: 0, maybe: 0, no: 0 };
  const my = e.myResponse;
  const button = (resp, label, glyph) => {
    const cls = 'chat-rsvp-btn' + (my === resp ? ' is-mine' : '');
    return (
      '<button type="button" class="' + cls + '" data-rsvp-response="' + resp + '">' +
        '<span class="chat-rsvp-glyph">' + glyph + '</span>' +
        '<span class="chat-rsvp-label">' + label + '</span>' +
        '<span class="chat-rsvp-count">' + (tally[resp] || 0) + '</span>' +
      '</button>'
    );
  };
  return (
    '<div class="chat-rsvp" data-message-id="' + escapeHtml(m.id) + '">' +
      '<div class="chat-rsvp-head">' +
        '<a class="chat-rsvp-title" href="/events/' + escapeHtml(e.eventId) + '" target="_blank" rel="noopener">' +
          '🗓 ' + escapeHtml(e.title) +
        '</a>' +
        '<div class="chat-rsvp-meta">' + escapeHtml(dateLine) +
          (e.location ? ' · ' + escapeHtml(e.location) : '') +
          (e.cost ? ' · $' + e.cost : '') +
        '</div>' +
      '</div>' +
      '<div class="chat-rsvp-actions">' +
        button('yes', 'Going', '✅') +
        button('maybe', 'Maybe', '🤔') +
        button('no', "Can't", '🚫') +
      '</div>' +
    '</div>'
  );
}

function wireMessageActions(li, m) {
  // Reaction toggles
  for (const btn of li.querySelectorAll('.chat-reaction[data-emoji]')) {
    btn.addEventListener('click', () => toggleReaction(m.id, btn.dataset.emoji));
  }
  const addBtn = li.querySelector('[data-emoji-picker]');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      // Tiny picker: prompt() is intentionally minimalist for v1.
      const emoji = window.prompt('React with emoji (e.g. 👍, 🔥, ❤️)');
      if (!emoji) return;
      await toggleReaction(m.id, emoji.trim());
    });
  }
  // Poll vote buttons
  for (const btn of li.querySelectorAll('.chat-poll-option[data-poll-option]')) {
    btn.addEventListener('click', () => votePoll(m.id, btn.dataset.pollOption));
  }
  // RSVP buttons
  for (const btn of li.querySelectorAll('.chat-rsvp-btn[data-rsvp-response]')) {
    btn.addEventListener('click', () => rsvp(m.id, btn.dataset.rsvpResponse));
  }
}

async function toggleReaction(messageId, emoji) {
  if (!emoji) return;
  try {
    await fetch('/api/v1/messages/' + encodeURIComponent(messageId) + '/reactions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    // SSE will fan out the updated message; no local mutation needed.
  } catch { /* ignore */ }
}

async function votePoll(messageId, optionId) {
  try {
    await fetch('/api/v1/messages/' + encodeURIComponent(messageId) + '/poll/vote', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    });
  } catch { /* ignore */ }
}

async function rsvp(messageId, response) {
  try {
    await fetch('/api/v1/messages/' + encodeURIComponent(messageId) + '/rsvp', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
  } catch { /* ignore */ }
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

// Poll composer. Single-screen prompt() chain — minimal but works on
// every platform. A richer modal can replace this in PR E2.
const pollBtn = document.getElementById('chat-poll-btn');
if (pollBtn) {
  pollBtn.addEventListener('click', async () => {
    if (!activeChannelId) return;
    const question = window.prompt('Poll question (e.g. "What should we cook Friday?")');
    if (!question || !question.trim()) return;
    const optionsRaw = window.prompt('Options, one per line (2–12):', 'Tacos\\nPasta\\nChicken & rice');
    if (!optionsRaw) return;
    const options = optionsRaw
      .split(/\\r?\\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (options.length < 2) {
      alert('A poll needs at least 2 options.');
      return;
    }
    const allowMulti = window.confirm('Allow multiple votes per person? (OK = yes, Cancel = single-vote)');
    const r = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId) + '/messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: '📊 ' + question,
        attachment: {
          kind: 'poll',
          question,
          options: options.map((label, i) => ({ id: 'o' + (i + 1), label })),
          allowMulti,
        },
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      alert('Couldn\\'t create poll: ' + (data.error || r.status));
      return;
    }
    const { message } = await r.json();
    renderMessages([message], false);
  });
}

// Photo upload — pick a file, POST it as multipart, then send a chat
// message with the kind:"photo" attachment referencing the new photo.
const photoInput = document.getElementById('chat-photo-input');
if (photoInput) {
  photoInput.addEventListener('change', async () => {
    if (!activeChannelId) return;
    const file = photoInput.files?.[0];
    if (!file) return;
    photoInput.value = ''; // allow re-uploading the same file
    const fd = new FormData();
    fd.append('photo', file);
    let upload;
    try {
      const r = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId) + '/photos', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert('Upload failed: ' + (err.error || r.status));
        return;
      }
      upload = await r.json();
    } catch (e) {
      alert('Upload failed: ' + e.message);
      return;
    }
    const caption = window.prompt('Caption (optional):', '') || '';
    const send = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId) + '/messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: caption.trim() || '📷',
        attachment: {
          kind: 'photo',
          photoId: upload.photo.id,
          caption,
        },
      }),
    });
    if (!send.ok) {
      const err = await send.json().catch(() => ({}));
      alert('Couldn\\'t post photo: ' + (err.error || send.status));
      return;
    }
    const { message } = await send.json();
    renderMessages([message], false);
  });
}

// RSVP composer. Fetches upcoming events and prompts the leader to pick
// one by index. Same minimalist prompt() flow as polls; a richer modal
// can replace this once we have the components for it.
const rsvpBtn = document.getElementById('chat-rsvp-btn');
if (rsvpBtn) {
  rsvpBtn.addEventListener('click', async () => {
    if (!activeChannelId) return;
    const r = await fetch('/api/v1/orgs/' + encodeURIComponent(orgId) + '/upcoming-events', {
      credentials: 'same-origin',
    });
    if (!r.ok) {
      alert('Couldn\\'t load events.');
      return;
    }
    const data = await r.json();
    if (!data.events || !data.events.length) {
      alert('No upcoming events on the calendar to embed. Add one in /admin/events first.');
      return;
    }
    const list = data.events.map((e, i) => {
      const d = new Date(e.startsAt);
      return (i + 1) + '. ' + e.title + ' — ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }).join('\\n');
    const choice = window.prompt('Pick an event (1–' + data.events.length + '):\\n\\n' + list, '1');
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    const ev = data.events[idx];
    if (!ev) {
      alert('Pick a number from the list.');
      return;
    }
    const note = window.prompt('Optional note to go with the RSVP card:', 'RSVP yes / maybe / no');
    const send = await fetch('/api/v1/channels/' + encodeURIComponent(activeChannelId) + '/messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: note || ev.title,
        attachment: { kind: 'rsvp', eventId: ev.id },
      }),
    });
    if (!send.ok) {
      const err = await send.json().catch(() => ({}));
      alert('Couldn\\'t embed event: ' + (err.error || send.status));
      return;
    }
    const { message } = await send.json();
    renderMessages([message], false);
  });
}

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
      .newsletter-list li { background:#fff; border:1px solid var(--line); border-radius:10px; padding:.85rem 1.1rem; }
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
      .newsletter-posts li, .newsletter-events li { background:#fff; border:1px solid var(--line); border-radius:8px; padding:.65rem .85rem; }
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
.post-react-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .65rem;border-radius:999px;border:1.5px solid var(--line,#e2e8f0);background:#fff;color:var(--ink,#0f172a);font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit}
.post-react-btn:hover{border-color:var(--ink,#0f172a)}
.post-react-btn.on{background:var(--accent,#1d4ed8);border-color:var(--accent,#1d4ed8);color:var(--ink,#0f172a)}
.post-react-btn[aria-disabled=true]{cursor:default;opacity:.7}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.post{background:#fff;border:1px solid var(--line);border-radius:14px;padding:1.25rem 1.4rem;box-shadow:0 1px 2px rgba(15,58,31,.06),0 8px 24px rgba(15,58,31,.06);position:relative}
.post.post-pinned{border-color:var(--accent)}
.post .badge{position:absolute;top:.85rem;right:.85rem;background:var(--accent);color:var(--ink);font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:5px;letter-spacing:.06em;text-transform:uppercase}
.post h3{margin:0 0 .35rem;font-size:1.2rem}
.post .post-body p{margin:0 0 .8em}
.post .post-body p:last-child{margin-bottom:0}
.post footer{margin-top:.75rem}
.post-photos{display:grid;gap:.4rem;margin-top:.85rem;border-radius:10px;overflow:hidden}
.post-photos img{display:block;width:100%;height:100%;object-fit:cover;background:var(--line)}
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
.comment{background:var(--line-soft);border:1px solid var(--line);border-radius:10px;padding:.75rem 1rem}
.comment.hidden{opacity:.55;background:#fff}
.comment header{display:flex;align-items:baseline;gap:.4rem;margin-bottom:.25rem}
.comment .body{color:var(--ink-700,#3a4049)}
.comment .body p{margin:0 0 .35em}
.comment .body p:last-child{margin-bottom:0}
.link-btn{background:none;border:0;padding:0;margin-right:.6rem;color:var(--ink-500,#6b7280);font:inherit;font-size:.82rem;cursor:pointer;text-decoration:underline}
.link-btn:hover{color:var(--ink-900,var(--ink))}
.link-btn.danger{color:#7d2614}
.comment-form{display:grid;gap:.5rem}
.comment-form textarea{padding:.55rem .75rem;border:1px solid var(--ink-300,#c8ccd4);border-radius:8px;font:inherit;resize:vertical}
.comment-form button{justify-self:start}
.tag{display:inline-block;background:#fff;border:1px solid var(--line);padding:.05rem .4rem;border-radius:5px;font-size:.78rem;color:#6b7280;margin-left:.4rem}
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
  const { page, announcements, user, role, customPages, heroPhotos, liveBlocksData } = extras;
  const tpl = loadTemplate();
  const navAuth = user
    ? `${role === "admin" || role === "leader" ? `<li><a href="/admin">Admin</a></li>` : ""}
       <li><a class="cta" href="/logout" onclick="event.preventDefault();fetch('/logout',{method:'POST'}).then(()=>location.href='/');">Sign out</a></li>`
    : `<li><a href="/login">Sign in</a></li>
       <li><a class="cta" href="/forms">Join</a></li>`;
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
    PRIMARY_COLOR: org.primaryColor,
    ACCENT_COLOR: org.accentColor,
    ANNOUNCEMENTS: raw(renderAnnouncements(announcements)),
    CUSTOM_BLOCKS: raw(renderCustomBlocks(page, liveBlocksData || {})),
    HERO_PHOTOS: raw(renderHeroPhotos(heroPhotos || [])),
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
