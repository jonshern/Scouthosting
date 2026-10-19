// POST /api/v1/journey/pair — body { code, label? }. No sign-in: the
// scout's device trades the parent's one-time code for a device token
// ({ token: "lantern_scout_…", scout }). Scouts have no account, email
// or password (they're often under 13); the token opens only their own
// trail (GET /api/v1/journey/scout). Ten tries per IP per 10 minutes.

import { LIMITS, json, readJson, v1PublicRoute } from "@/lib/api/v1";
import { pairDevice } from "@/lib/journey/devices";
import { PairBody } from "@/lib/journey/schema";
import { getScoutAsScout } from "@/lib/journey/store";
import { recordAction } from "@/lib/usage/collect";

export const runtime = "nodejs";

export const POST = v1PublicRoute(
  async (req) => {
    const { code, label } = await readJson(req, PairBody);
    const { token, scoutId } = await pairDevice(code, label || "Scout's device");
    recordAction("scout_paired", { product: "lantern", role: "scout", scoutId });
    return json({ token, scout: await getScoutAsScout(scoutId) }, { status: 201 });
  },
  { limits: [LIMITS.journeyPair] },
);
