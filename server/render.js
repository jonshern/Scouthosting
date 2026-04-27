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
