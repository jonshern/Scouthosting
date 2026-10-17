// GET /api/v1/me/scouts — the caller's own scouts across every unit,
// the same cards the website's /account/my-scouts shows: { scouts: [{
// orgId, orgSlug, orgDisplayName, memberId, scoutName, patrol, position,
// balanceCents, recentTransactions, scoutbook, upcoming: [{ eventId,
// title, startsAt, location, rsvp, requiresPermissionSlip, slipSigned }]
// }] }.
//
// Scouts are found by matching the caller's email to a parent on the
// roster, so an account whose email isn't verified gets none.

import { json, v1Route } from "@/lib/api/v1";
import { loadVerifiedUser } from "@/lib/api/v1-events";
import { myScoutsForUser } from "@/lib/parents/my-scouts";

export const runtime = "nodejs";

export const GET = v1Route(async (_req, { user }) => {
  const me = await loadVerifiedUser(user);
  if (!me.emailVerified) return json({ scouts: [], emailVerified: false });
  const scouts = await myScoutsForUser(me);
  return json({
    emailVerified: true,
    scouts: scouts.map((s) => ({
      ...s,
      // Scoutbook's own user id is for the sync job, not the app.
      scoutbook: s.scoutbook ? { ...s.scoutbook, scoutbookUserId: undefined } : null,
    })),
  });
});
