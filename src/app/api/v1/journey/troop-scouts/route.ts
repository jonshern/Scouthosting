// GET /api/v1/journey/troop-scouts — troop roster scouts, in any unit
// on Compass, that list this account as a parent (by email, and only
// once the email is confirmed): [{ memberId, firstName, lastInitial,
// orgName, orgSlug }]. Lantern offers these to link to a scout's trail
// so counselor and leader sign-offs show up on it.

import { json, v1Route } from "@/lib/api/v1";
import { troopScoutsFor } from "@/lib/journey/store";

export const runtime = "nodejs";

export const GET = v1Route(async (_req, { user }) => json({ scouts: await troopScoutsFor(user) }));
