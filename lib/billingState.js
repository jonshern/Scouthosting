// Pure-functional billing-state derivation. The Stripe webhook handler
// (lib/stripe.js) writes raw Stripe state onto Org rows; everything that
// gates user-visible behavior on payment status reads through this
// module so the rules live in one place and stay testable without
// touching Prisma or the Stripe SDK.
//
// The gate has three exits:
//   - "writeable"  → admin can do anything (trialing or active)
//   - "readonly"   → public site still renders, admin write paths are
//                    blocked behind a friendly /admin/billing page
//                    (past_due, canceled with grace, expired trial)
//   - "suspended"  → Org.suspendedAt set out of band by an operator;
//                    even read paths surface the suspension banner
//
// Demo orgs (Org.isDemo) bypass billing entirely.

/**
 * Derive the effective billing status from raw Org fields + a clock.
 *
 * @param {object} org    Org row (subscriptionStatus, trialEndsAt,
 *                        currentPeriodEnd, cancelAtPeriodEnd, isDemo,
 *                        suspendedAt).
 * @param {Date}   [now]  Defaults to new Date(); injectable for tests.
 * @returns {{
 *   status:   "trialing"|"active"|"past_due"|"canceled"|"expired"|"suspended",
 *   gate:     "writeable"|"readonly"|"suspended",
 *   trialDaysLeft: number|null,
 *   inGrace:  boolean,
 *   reason:   string|null,
 * }}
 */
export function deriveBillingStatus(org, now = new Date()) {
  if (!org) {
    return { status: "expired", gate: "readonly", trialDaysLeft: null, inGrace: false, reason: "no_org" };
  }
  if (org.suspendedAt) {
    return {
      status: "suspended",
      gate: "suspended",
      trialDaysLeft: null,
      inGrace: false,
      reason: org.suspendedReason || "suspended",
    };
  }
  if (org.isDemo) {
    return { status: "active", gate: "writeable", trialDaysLeft: null, inGrace: false, reason: null };
  }

  const status = org.subscriptionStatus || "trialing";
  const nowMs = now.getTime();

  // Trial: still writeable until trialEndsAt; expired flips to readonly.
  if (status === "trialing") {
    const ends = org.trialEndsAt ? new Date(org.trialEndsAt).getTime() : null;
    if (ends == null) {
      // Trialing with no end date = misprovisioned, fail closed.
      return { status: "expired", gate: "readonly", trialDaysLeft: null, inGrace: false, reason: "trial_misconfigured" };
    }
    if (nowMs >= ends) {
      return { status: "expired", gate: "readonly", trialDaysLeft: 0, inGrace: false, reason: "trial_expired" };
    }
    const daysLeft = Math.max(0, Math.ceil((ends - nowMs) / (1000 * 60 * 60 * 24)));
    return { status: "trialing", gate: "writeable", trialDaysLeft: daysLeft, inGrace: false, reason: null };
  }

  if (status === "active") {
    return { status: "active", gate: "writeable", trialDaysLeft: null, inGrace: false, reason: null };
  }

  // past_due: card failed, Stripe is retrying. Stay writeable for 7 days
  // so the leader can fix the card without losing access during a
  // Sunday-morning panic, then flip readonly.
  if (status === "past_due") {
    const periodEnd = org.currentPeriodEnd ? new Date(org.currentPeriodEnd).getTime() : null;
    const graceEnds = periodEnd ? periodEnd + 7 * 24 * 60 * 60 * 1000 : null;
    const inGrace = graceEnds == null ? true : nowMs < graceEnds;
    return {
      status: "past_due",
      gate: inGrace ? "writeable" : "readonly",
      trialDaysLeft: null,
      inGrace,
      reason: "past_due",
    };
  }

  if (status === "canceled" || status === "expired") {
    return { status, gate: "readonly", trialDaysLeft: null, inGrace: false, reason: status };
  }

  // Unknown state — fail closed.
  return { status: "expired", gate: "readonly", trialDaysLeft: null, inGrace: false, reason: "unknown_status" };
}

/**
 * Convenience: true iff admin write routes should be allowed.
 * Mounted as middleware via `enforceWriteable` in server/index.js.
 */
export function canWrite(org, now = new Date()) {
  return deriveBillingStatus(org, now).gate === "writeable";
}

/**
 * Convenience: human-readable banner copy for /admin/billing.
 */
export function billingBanner(state) {
  switch (state.status) {
    case "trialing":
      if (state.trialDaysLeft != null && state.trialDaysLeft <= 7) {
        return {
          tone: "warn",
          headline: `Your free trial ends in ${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"}.`,
          body: "Subscribe now to keep posting, sending newsletters, and using chat without interruption.",
        };
      }
      return {
        tone: "info",
        headline: `${state.trialDaysLeft} days left in your free trial.`,
        body: "No card on file. Subscribe any time — your data stays put.",
      };
    case "active":
      return null; // No banner when everything is fine.
    case "past_due":
      return {
        tone: state.inGrace ? "warn" : "danger",
        headline: state.inGrace ? "Your last payment didn't go through." : "Your subscription is past due.",
        body: state.inGrace
          ? "We'll keep retrying for a few days. Update your card to avoid losing access."
          : "Update your card to restore admin access. Your public site is still up.",
      };
    case "expired":
      return {
        tone: "danger",
        headline: "Your free trial has ended.",
        body: "Subscribe to keep editing the site. Your members can still see published content.",
      };
    case "canceled":
      return {
        tone: "danger",
        headline: "Your subscription has been canceled.",
        body: "Resubscribe any time to restore admin access. Your data is still here.",
      };
    case "suspended":
      return {
        tone: "danger",
        headline: "This unit's site is suspended.",
        body: state.reason || "Contact support@compass.app to restore access.",
      };
    default:
      return null;
  }
}
