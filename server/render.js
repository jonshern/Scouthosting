/**
 * Render a tenant's site by injecting tenant data into the template.
 *
 * In Phase 1 the template is a single HTML file with {{placeholder}} tokens.
 * Later phases will pull dynamic content (events, members, photos) from the
 * database and render multiple routes; this file is the seam where that
 * happens.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "template", "site.html");

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

export function renderSite(tenant) {
  const tpl = loadTemplate();
  const ctx = {
    UNIT_TYPE: tenant.unitType,
    UNIT_NUMBER: tenant.unitNumber,
    DISPLAY_NAME: tenant.displayName,
    BRAND_MARK: tenant.unitNumber,
    TAGLINE: tenant.tagline || `${tenant.unitType} ${tenant.unitNumber}, chartered to ${tenant.charterOrg}.`,
    CHARTER_ORG: tenant.charterOrg,
    CITY: tenant.city,
    STATE: tenant.state,
    COUNCIL: tenant.council || "your council",
    DISTRICT: tenant.district || "your district",
    FOUNDED: tenant.founded || "—",
    MEETING_DAY: tenant.meetingDay,
    MEETING_TIME: tenant.meetingTime,
    MEETING_LOCATION: tenant.meetingLocation,
    SCOUTMASTER_NAME: tenant.scoutmasterName,
    SCOUTMASTER_EMAIL: tenant.scoutmasterEmail,
    COMMITTEE_EMAIL: tenant.committeeChairEmail || tenant.scoutmasterEmail,
    PRIMARY_COLOR: tenant.primaryColor,
    ACCENT_COLOR: tenant.accentColor,
    DEMO_BANNER: tenant.isDemo
      ? `<div class="demo-banner"><strong>Scouthosting demo site.</strong> ${escapeHtml(tenant.displayName)} is a fictional unit.</div>`
      : "",
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(ctx[key] ?? ""));
}
