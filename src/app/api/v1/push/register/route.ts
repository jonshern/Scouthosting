// POST /api/v1/push/register — register a device token for push.
// Body: { token, provider?, deviceLabel?, platform? }.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { LIMITS, json, readJson, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

const Body = z.object({
  token: z.string({ required_error: "missing_token" }).trim().min(1, "missing_token").max(512),
  provider: z.enum(["expo", "webpush", "apns", "fcm"]).catch("expo").default("expo"),
  deviceLabel: z.string().trim().max(80).optional().nullable(),
  platform: z.string().trim().max(16).optional().nullable(),
});

export const POST = v1Route(
  async (req, { user }) => {
    const input = await readJson(req, Body);
    const fields = {
      provider: input.provider,
      deviceLabel: input.deviceLabel || null,
      platform: input.platform || null,
    };

    // Upsert by unique token. Re-registering the same token from another
    // user moves it (one device → one user at a time, e.g. a shared
    // family phone switching accounts).
    const row = await prisma.pushDevice.upsert({
      where: { token: input.token },
      create: { userId: user.id, token: input.token, ...fields },
      update: { userId: user.id, ...fields, retiredAt: null, retiredReason: null },
    });
    return json({ id: row.id });
  },
  { limits: [LIMITS.push] },
);
