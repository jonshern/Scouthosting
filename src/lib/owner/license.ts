// What a unit's license looks like from the owner console: one word
// for filtering plus a sentence for people. Pure; reads the same Org
// fields the billing gate does (lib/billing/state.ts), so the console
// never disagrees with what the unit's admins see.

import { deriveBillingStatus, type OrgLikeForBilling } from "@/lib/billing/state";
import { intervalForPriceId, PRICES } from "@/lib/billing/pricing";

export type LicenseKind =
  | "trial"
  | "trial_ended"
  | "paid"
  | "canceling"
  | "past_due"
  | "canceled"
  | "comped"
  | "suspended"
  | "demo"
  | "legacy";

export const LICENSE_KINDS: { kind: LicenseKind; label: string }[] = [
  { kind: "trial", label: "On trial" },
  { kind: "trial_ended", label: "Trial ended" },
  { kind: "paid", label: "Paying" },
  { kind: "canceling", label: "Canceling" },
  { kind: "past_due", label: "Past due" },
  { kind: "canceled", label: "Canceled" },
  { kind: "comped", label: "Free access" },
  { kind: "suspended", label: "Suspended" },
  { kind: "demo", label: "Demo" },
  { kind: "legacy", label: "No billing" },
];

export type LicenseTone = "good" | "info" | "warn" | "bad" | "muted";

export type License = {
  kind: LicenseKind;
  label: string;
  detail: string;
  tone: LicenseTone;
  /** The date that matters next (trial end, renewal, comp end), if any. */
  until: Date | null;
};

export type OrgForLicense = OrgLikeForBilling & {
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  compedNote?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function day(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function licenseFor(org: NonNullable<OrgForLicense>, now: Date = new Date()): License {
  const state = deriveBillingStatus(org, now);
  const label = (k: LicenseKind) => LICENSE_KINDS.find((x) => x.kind === k)!.label;
  const date = (d: Date | string | null | undefined) => (d ? new Date(d) : null);
  const periodEnd = date(org.currentPeriodEnd);

  if (state.status === "suspended") {
    return { kind: "suspended", label: label("suspended"), detail: state.reason ?? "Suspended", tone: "bad", until: null };
  }
  if (org.isDemo) {
    return { kind: "demo", label: label("demo"), detail: "Sample unit, never billed", tone: "muted", until: null };
  }
  if (state.reason === "comped") {
    const until = date(org.compedUntil)!;
    return {
      kind: "comped",
      label: label("comped"),
      detail: `Free until ${day(until)}${org.compedNote ? ` · ${org.compedNote}` : ""}`,
      tone: "good",
      until,
    };
  }
  if (state.reason === "trial_misconfigured") {
    return { kind: "legacy", label: label("legacy"), detail: "Made before self-serve sign-up; nothing to pay", tone: "muted", until: null };
  }
  if (state.status === "trialing") {
    const until = date(org.trialEndsAt)!;
    const left = state.trialDaysLeft ?? 0;
    return {
      kind: "trial",
      label: label("trial"),
      detail: `${plural(left, "day")} left, ends ${day(until)}${org.stripeSubscriptionId ? " · card on file" : ""}`,
      tone: left <= 7 ? "warn" : "info",
      until,
    };
  }
  if (state.reason === "trial_expired") {
    const ended = date(org.trialEndsAt)!;
    const ago = Math.max(0, Math.floor((now.getTime() - ended.getTime()) / DAY_MS));
    return {
      kind: "trial_ended",
      label: label("trial_ended"),
      detail: `Ended ${day(ended)} (${plural(ago, "day")} ago), never subscribed`,
      tone: "bad",
      until: ended,
    };
  }
  const interval = intervalForPriceId(org.stripePriceId);
  const price = interval ? PRICES[interval].long : "Subscribed";
  if (state.status === "active") {
    if (!org.stripeSubscriptionId) {
      return { kind: "legacy", label: label("legacy"), detail: "Active without a Stripe subscription", tone: "muted", until: null };
    }
    if (org.cancelAtPeriodEnd) {
      return {
        kind: "canceling",
        label: label("canceling"),
        detail: `${price}, stops ${periodEnd ? day(periodEnd) : "at period end"}`,
        tone: "warn",
        until: periodEnd,
      };
    }
    return {
      kind: "paid",
      label: label("paid"),
      detail: `${price}${periodEnd ? `, renews ${day(periodEnd)}` : ""}`,
      tone: "good",
      until: periodEnd,
    };
  }
  if (state.status === "past_due") {
    return {
      kind: "past_due",
      label: label("past_due"),
      detail: state.inGrace ? "Payment failed, still in the 7-day grace period" : "Payment failed, admin pages locked",
      tone: "bad",
      until: periodEnd,
    };
  }
  return {
    kind: "canceled",
    label: label("canceled"),
    detail: periodEnd ? `Ended ${day(periodEnd)}` : "Subscription ended",
    tone: "muted",
    until: periodEnd,
  };
}

/** New trial end when the owner adds days: from today if it already ended. */
export function extendedTrialEnd(current: Date | null, days: number, now: Date = new Date()): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}
