// Pure-functional billing-state derivation. Stripe webhook handler
// writes raw Stripe state onto Org rows; everything that gates user-
// visible behavior on payment status reads through this module.
//
// Three exits: writeable (admin can do anything), readonly (public
// site renders, admin write paths blocked), suspended (operator
// override; even read paths surface the suspension banner).
//
// Demo orgs (Org.isDemo) bypass billing entirely.

import { supportEmail } from "@/lib/support";


export type BillingStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "suspended";

export type BillingGate = "writeable" | "readonly" | "suspended";

export type BillingState = {
  status: BillingStatus;
  gate: BillingGate;
  trialDaysLeft: number | null;
  inGrace: boolean;
  reason: string | null;
};

export type OrgLikeForBilling = {
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | string | null;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean | null;
  isDemo?: boolean | null;
  suspendedAt?: Date | string | null;
  suspendedReason?: string | null;
} | null | undefined;

export function deriveBillingStatus(org: OrgLikeForBilling, now: Date = new Date()): BillingState {
  if (!org) {
    return {
      status: "expired",
      gate: "readonly",
      trialDaysLeft: null,
      inGrace: false,
      reason: "no_org",
    };
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
    return {
      status: "active",
      gate: "writeable",
      trialDaysLeft: null,
      inGrace: false,
      reason: null,
    };
  }

  const status = org.subscriptionStatus || "trialing";
  const nowMs = now.getTime();

  if (status === "trialing") {
    const ends = org.trialEndsAt ? new Date(org.trialEndsAt).getTime() : null;
    if (ends == null) {
      return {
        status: "expired",
        gate: "readonly",
        trialDaysLeft: null,
        inGrace: false,
        reason: "trial_misconfigured",
      };
    }
    if (nowMs >= ends) {
      return {
        status: "expired",
        gate: "readonly",
        trialDaysLeft: 0,
        inGrace: false,
        reason: "trial_expired",
      };
    }
    const daysLeft = Math.max(0, Math.ceil((ends - nowMs) / (1000 * 60 * 60 * 24)));
    return {
      status: "trialing",
      gate: "writeable",
      trialDaysLeft: daysLeft,
      inGrace: false,
      reason: null,
    };
  }

  if (status === "active") {
    return {
      status: "active",
      gate: "writeable",
      trialDaysLeft: null,
      inGrace: false,
      reason: null,
    };
  }

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
    return {
      status: status as BillingStatus,
      gate: "readonly",
      trialDaysLeft: null,
      inGrace: false,
      reason: status,
    };
  }

  return {
    status: "expired",
    gate: "readonly",
    trialDaysLeft: null,
    inGrace: false,
    reason: "unknown_status",
  };
}

export function canWrite(org: OrgLikeForBilling, now: Date = new Date()): boolean {
  return deriveBillingStatus(org, now).gate === "writeable";
}

export type BillingBanner =
  | { tone: "info" | "warn" | "danger"; headline: string; body: string }
  | null;

export function billingBanner(state: BillingState): BillingBanner {
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
      return null;
    case "past_due":
      return {
        tone: state.inGrace ? "warn" : "danger",
        headline: state.inGrace
          ? "Your last payment didn't go through."
          : "Your subscription is past due.",
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
        body: state.reason || `Contact ${supportEmail()} to restore access.`,
      };
    default:
      return null;
  }
}
