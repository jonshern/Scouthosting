// POST /api/v1/push/unregister — soft-retire a device. Body: { token }.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { LIMITS, json, notFound, readJson, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

const Body = z.object({ token: z.string({ required_error: "missing_token" }).trim().min(1, "missing_token").max(512) });

export const POST = v1Route(
  async (req, { user }) => {
    const { token } = await readJson(req, Body);
    const row = await prisma.pushDevice.findUnique({ where: { token } });
    if (!row || row.userId !== user.id) throw notFound();
    await prisma.pushDevice.update({
      where: { token },
      data: { retiredAt: new Date(), retiredReason: "user_unregistered" },
    });
    return json({ ok: true });
  },
  { limits: [LIMITS.push] },
);
