// Plan-gating: which features are *included* in each subscription
// tier. Distinct from:
//
//   lib/billingState.js — time/payment status (writeable vs readonly
//                         based on trial / past_due / canceled).
//   lib/featureFlags.js — operator-toggled boolean overrides per org.
//
// PLAN_FEATURES is the canonical "what your tier includes" map.
// requirePlanFeature() is the Express middleware that gates an admin
// route on the org's plan. When a feature is gated out, the user
// gets a tasteful "Upgrade to X" page rather than 404 — they should
// know the feature exists and how to unlock it.
//
// Demo orgs (Org.isDemo) bypass plan-gating entirely — same model as
// billingState's demo bypass — so screenshots and walkthroughs always
// show the full feature set.

import { PLAN_PRICING } from "./plans.constants.js";

const TIER_RANK = { patrol: 0, troop: 1, council: 2 };

/**
 * Canonical feature catalog. Each entry lists the LOWEST plan tier
 * that includes the feature. Adding a new gated feature is one entry
 * here + one requirePlanFeature() decoration on the route.
 *
 * Conventions:
 *   - "<area>.<feature>" namespacing matches lib/featureFlags.js
 *   - default tier is "patrol" (everyone gets it) unless explicitly
 *     paid-tier-only
 */
export const PLAN_FEATURES = Object.freeze({
  // Newsletter scheduler is the recurring send + rules engine. Every
  // tier can compose and send a one-off newsletter; only troop+
  // unlocks the cron-driven "every Sunday at 6pm" automation.
  "newsletter.scheduler":   { minTier: "troop",   label: "Newsletter scheduler" },
  // Custom domain (vanity URL) requires DNS + cert provisioning, more
  // ongoing support cost than the included subdomain.
  "domain.custom":          { minTier: "troop",   label: "Custom domain" },
  // Multi-org rollup view — operator-tier only, for councils that
  // run multiple units under one umbrella. Future feature; the gate
  // is in place so the eventual UI lands behind it cleanly.
  "council.rollup":         { minTier: "council", label: "Multi-org rollup" },
});

export function planLabel(plan) {
  return PLAN_PRICING[plan]?.label || plan;
}

export function planRank(plan) {
  return TIER_RANK[plan] ?? -1;
}

/**
 * Does this org's plan include the given feature?
 *
 * Demo orgs bypass — same as billingState.js — so the demo shows
 * every feature regardless of nominal plan.
 *
 * Returns true iff the org's plan rank meets or exceeds the
 * feature's minimum tier. Unknown features throw to fail loud
 * during development.
 */
export function planIncludes(org, featureKey) {
  if (!PLAN_FEATURES[featureKey]) {
    throw new Error(`Unknown plan feature: ${featureKey}. Add it to PLAN_FEATURES first.`);
  }
  if (!org) return false;
  if (org.isDemo) return true;
  return planRank(org.plan) >= planRank(PLAN_FEATURES[featureKey].minTier);
}

/**
 * Express middleware factory. Mounts before requireLeader (the role
 * check stays separate from the plan check). When the feature isn't
 * included, render a friendly upgrade page rather than 404 — the
 * user should know the feature exists and how to unlock it.
 *
 * Usage:
 *   adminRouter.get("/newsletters/schedule",
 *     requirePlanFeature("newsletter.scheduler"),
 *     requireLeader,
 *     handler);
 */
export function requirePlanFeature(featureKey) {
  if (!PLAN_FEATURES[featureKey]) {
    throw new Error(`requirePlanFeature: unknown feature "${featureKey}"`);
  }
  return function planGate(req, res, next) {
    if (!req.org) return res.status(404).type("text/plain").send("Site not found");
    if (planIncludes(req.org, featureKey)) return next();
    const meta = PLAN_FEATURES[featureKey];
    const minLabel = planLabel(meta.minTier);
    const currentLabel = planLabel(req.org.plan);
    res.status(402).type("html").send(upgradePage({
      orgDisplayName: req.org.displayName,
      featureLabel: meta.label,
      minLabel,
      currentLabel,
    }));
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function upgradePage({ orgDisplayName, featureLabel, minLabel, currentLabel }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(featureLabel)} — upgrade required</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-ui);color:var(--ink);background:var(--bg);display:grid;place-items:center;min-height:100vh;padding:2rem;line-height:1.55}
.card{max-width:520px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-card);padding:2.25rem 2rem;box-shadow:var(--shadow-card)}
h1{font-family:var(--font-display);font-weight:400;font-size:1.6rem;line-height:1.05;letter-spacing:-.025em;margin:0 0 .25rem}
.eyebrow{font-size:11px;color:var(--ink-muted);letter-spacing:.14em;text-transform:uppercase;font-weight:600;margin-bottom:.5rem}
p{color:var(--ink-soft);font-size:.95rem;margin:0 0 1.25rem}
.tag{display:inline-block;background:var(--accent-soft);color:var(--ink);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:.2rem .55rem;border-radius:999px;margin:0 .35rem 0 0}
.btn{display:inline-block;padding:.65rem 1.1rem;border-radius:var(--radius-button);border:1.5px solid var(--ink);background:var(--ink);color:var(--bg);font-weight:600;text-decoration:none;font-size:.95rem;margin-top:.5rem}
.btn-ghost{background:var(--surface);color:var(--ink);border:1.5px solid var(--line);margin-left:.5rem}
</style></head><body>
<div class="card">
<div class="eyebrow">Plan upgrade required</div>
<h1>${escapeHtml(featureLabel)} is on the ${escapeHtml(minLabel)} plan</h1>
<p><strong>${escapeHtml(orgDisplayName)}</strong> is currently on the ${escapeHtml(currentLabel)} plan. Upgrade to ${escapeHtml(minLabel)} to unlock <span class="tag">${escapeHtml(featureLabel)}</span> plus everything else included at that tier.</p>
<p><a class="btn" href="/admin/billing">See plan options</a><a class="btn btn-ghost" href="/admin">← Back</a></p>
</div></body></html>`;
}
