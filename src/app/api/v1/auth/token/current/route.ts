// DELETE /api/v1/auth/token/current — revoke the bearer token that made
// this request. The phone app calls it on sign-out; it doesn't need to
// know the token's id.

import { prisma } from "@/lib/db";
import { revokeToken } from "@/lib/auth/api-token";
import { json, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const DELETE = v1Route(async (_req, { tokenId }) => {
  await revokeToken(tokenId, prisma);
  return json({ ok: true });
});
