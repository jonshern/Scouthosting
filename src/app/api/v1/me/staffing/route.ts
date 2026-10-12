// GET /api/v1/me/staffing — every event the caller is staff on, across
// orgs, soonest first: { staffing: [{ staffId, role, status, station,
// respondedAt, event: { id, title, startsAt, endsAt, location, org } }] }.

import { json, v1Route } from "@/lib/api/v1";
import { loadVerifiedUser } from "@/lib/api/v1-events";
import { staffingForUser } from "@/lib/events/staff";

export const runtime = "nodejs";

export const GET = v1Route(async (_req, { user }) => {
  return json({ staffing: await staffingForUser(await loadVerifiedUser(user)) });
});
