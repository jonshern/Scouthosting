// Static checks that every server action decides access itself.
//
// A server action is a public POST endpoint: anyone can call it with
// any form fields, whatever page it was rendered on, so a layout's
// check doesn't protect it. Each exported action must reach an org
// role check (directly or through a helper in the same file), or be
// listed below with the reason it doesn't need one.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "src/server-actions");

// Calls that decide access against the org: role lookups, treasurer
// access, super-admin, channel posting rules.
const ROLE_CHECK = /\b(roleInOrg|isLeaderRole|canManageTreasury|isSuperAdmin|canPostToChannel)\b|\.role\b/;

// Actions that act only on the caller's own account or on a credential
// they hold, so no org role applies. Each still needs its own check,
// noted here; a new entry needs a reason.
const NO_ORG_ROLE: Record<string, string> = {
  "account.ts updateProfile": "signed-in user's own profile",
  "account.ts changePassword": "signed-in user's own password",
  "account.ts revokeApiToken": "token row must belong to the user",
  "account.ts resendVerificationEmail": "signed-in user's own email",
  "account.ts confirmAdult": "signed-in user's own attestation",
  "delete-account.ts deleteMyAccount": "signed-in user's own account",
  "auth.ts signupAction": "public sign-up",
  "billing.ts startSubscriptionAction": "canManageBilling (lib/billing/access.ts): owner, admin or super-admin",
  "billing.ts openBillingPortalAction": "canManageBilling (lib/billing/access.ts): owner, admin or super-admin",
  "auth.ts loginAction": "public sign-in",
  "auth.ts hasPendingMfaChallenge": "reads the caller's own MFA cookie",
  "auth.ts completeMfaLoginAction": "second step of the caller's own sign-in",
  "auth.ts logoutAction": "ends the caller's own session",
  "chat.ts markRead": "updates the user's own channel membership row",
  "demo.ts demoSignInAction": "demo mode only, demo accounts",
  "demo.ts demoResetAction": "demo mode only, demo admin account",
  "invite.ts submitInviteCode": "the invite code is the credential",
  "mfa.ts enrollMfa": "signed-in user's own MFA",
  "mfa.ts confirmMfa": "signed-in user's own MFA",
  "mfa.ts verifyMfa": "signed-in user's own MFA",
  "mfa.ts disableMfa": "signed-in user's own MFA, with a code",
  "mfa.ts regenerateBackupCodes": "signed-in user's own MFA, with a code",
  "my-stuff.ts updateMyStuff": "member row must carry the user's email",
  "pay.ts startMemberPayment": "member must be the user or their scout",
  "public-sales.ts startPublicCheckout": "public fundraising page",
  "rsvp-link.ts confirmLinkRsvp": "the signed RSVP token is the credential",
  "rsvp.ts submitRsvp": "public RSVP on the unit's calendar",
  "slots.ts takeSlot": "public sign-up slots, login optional",
  "slots.ts releaseSlotAssignment": "only the user who claimed the slot",
  "start-trial.ts startTrialAction": "creates a new unit with the signed-in adult as its admin",
};

type Fn = { exported: boolean; body: string };

function functionsIn(source: string): Map<string, Fn> {
  const fns = new Map<string, Fn>();
  const re = /^(export )?(?:async )?function (\w+)[\s\S]*?^}/gm;
  for (const m of source.matchAll(re)) fns.set(m[2], { exported: !!m[1], body: m[0] });
  return fns;
}

/** The action's body plus every same-file helper it reaches. */
function reachable(name: string, fns: Map<string, Fn>): string {
  const seen = new Set([name]);
  let text = fns.get(name)!.body;
  for (let grew = true; grew; ) {
    grew = false;
    for (const [other, fn] of fns) {
      if (!seen.has(other) && new RegExp(`\\b${other}\\(`).test(text)) {
        seen.add(other);
        text += fn.body;
        grew = true;
      }
    }
  }
  return text;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("server actions", () => {
  const actions: string[] = [];
  for (const file of files) {
    const fns = functionsIn(readFileSync(path.join(DIR, file), "utf8"));
    for (const [name, fn] of fns) {
      if (fn.exported) actions.push(`${file} ${name}`);
    }
  }

  it("finds the actions", () => {
    expect(actions.length).toBeGreaterThan(100);
  });

  it("each checks the caller's role in the org, or is listed with a reason", () => {
    const missing: string[] = [];
    for (const file of files) {
      const fns = functionsIn(readFileSync(path.join(DIR, file), "utf8"));
      for (const [name, fn] of fns) {
        if (!fn.exported || NO_ORG_ROLE[`${file} ${name}`]) continue;
        if (!ROLE_CHECK.test(reachable(name, fns))) missing.push(`${file} ${name}`);
      }
    }
    expect(missing, "add a role check, or list it in NO_ORG_ROLE with why it needs none").toEqual([]);
  });

  it("the allowlist names only actions that exist", () => {
    expect(Object.keys(NO_ORG_ROLE).filter((k) => !actions.includes(k))).toEqual([]);
  });
});
