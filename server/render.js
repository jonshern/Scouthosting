/**
 * Render a tenant's site by injecting org data into the template.
 *
 * Tokens are HTML-escaped by default. Values wrapped with `raw(html)` are
 * inserted verbatim — used only for trusted server-built fragments.
 *
 * Future phases will pull dynamic content (events, members, photos) from
 * Prisma and render multiple routes; this file is the seam where that
 * happens.
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

export function renderSite(org) {
  const tpl = loadTemplate();
  const ctx = {
    UNIT_TYPE: org.unitType,
    UNIT_NUMBER: org.unitNumber,
    DISPLAY_NAME: org.displayName,
    BRAND_MARK: org.unitNumber,
    TAGLINE: org.tagline || `${org.unitType} ${org.unitNumber}, chartered to ${org.charterOrg}.`,
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
    DEMO_BANNER: org.isDemo
      ? raw(
          `<div class="demo-banner"><strong>Scouthosting demo site.</strong> ${escapeHtml(org.displayName)} is a fictional unit.</div>`
        )
      : "",
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = ctx[key];
    if (v && typeof v === "object" && v[RAW] !== undefined) return v[RAW];
    return escapeHtml(v ?? "");
  });
}
