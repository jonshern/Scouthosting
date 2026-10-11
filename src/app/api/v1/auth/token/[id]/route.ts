// DELETE /api/v1/auth/token/[id] — revoke a bearer token. Auth via
// the bearer token itself (you can revoke the one you used to call
// this, which logs you out cleanly). Someone else's token id is a 404.

import { prisma } from "@/lib/db";
import { revokeToken } from "@/lib/auth/api-token";
import { json, notFound, parseId, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const DELETE = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  const row = await prisma.apiToken.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row || row.userId !== user.id) throw notFound();
  await revokeToken(id, prisma);
  return json({ ok: true });
});
