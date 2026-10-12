// Demo mode: this whole Compass deployment is the public demo.
//
// A demo deployment has its own database holding one fictional unit
// (src/lib/demo/season.ts) that prospective troops sign in to with the
// shared accounts below. Demo mode is a property of the deployment, not
// of an org, so a visitor can never reach a real unit's data and nothing
// they do can email or text a real person:
//
//   - every email and text goes to the on-screen outbox (./outbox.ts)
//   - the shared accounts can't change their password or email, or turn
//     on two-step sign-in (that would lock the next visitor out)
//   - sign-up is off; the demo unit is the only unit
//   - the data is wiped and re-seeded on a schedule (./reset.ts)
//
// Turn it on with DEMO_MODE=1. Never set it on a deployment that holds
// real units: the reset refuses to run if it finds one, but the relaxed
// sign-in rules would still apply. See docs/demo.md.

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/** Shared password for every demo account. Published on /demo. */
export const DEMO_PASSWORD = "TryTheDemo42!";

/** Every demo address uses this reserved, undeliverable domain. */
export const DEMO_EMAIL_DOMAIN = "demo.invalid";

export type DemoRole = "admin" | "leader" | "counselor" | "parent";

export type DemoAccount = {
  role: DemoRole;
  email: string;
  displayName: string;
  title: string;
  summary: string;
  /** Where one-click sign-in lands, relative to the unit's /o/<slug>. */
  landing: string;
};

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: "admin",
    email: `admin@${DEMO_EMAIL_DOMAIN}`,
    displayName: "Morgan Ellis",
    title: "Scoutmaster (unit admin)",
    summary: "Runs the troop: roster, calendar, treasury, messages and the site itself.",
    landing: "/admin",
  },
  {
    role: "leader",
    email: `leader@${DEMO_EMAIL_DOMAIN}`,
    displayName: "Priya Shah",
    title: "Assistant Scoutmaster",
    summary: "Plans the campout, fills sign-up slots and posts to the patrol chats.",
    landing: "/admin",
  },
  {
    role: "counselor",
    email: `counselor@${DEMO_EMAIL_DOMAIN}`,
    displayName: "Dana Whitfield",
    title: "Merit badge counselor",
    summary: "Counsels First Aid, Cooking and Camping, and staffs a station at the badge day.",
    landing: "",
  },
  {
    role: "parent",
    email: `parent@${DEMO_EMAIL_DOMAIN}`,
    displayName: "Jordan Rivera",
    title: "Parent of two scouts",
    summary: "Sees Sam and Theo's events, RSVPs, signs permission slips and checks balances.",
    landing: "",
  },
] as const;

export function demoAccount(role: string): DemoAccount | null {
  return DEMO_ACCOUNTS.find((a) => a.role === role) ?? null;
}

export function isDemoAddress(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Shown to a visitor who tries something the demo keeps off. */
export const DEMO_LOCKED_MESSAGE =
  "That's turned off in the demo so the shared accounts keep working for everyone.";

/** Hours between automatic resets (DEMO_RESET_HOURS, default 24). */
export function demoResetHours(): number {
  const n = Number(process.env.DEMO_RESET_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 24;
}
