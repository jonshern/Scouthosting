// POST /api/v1/errors — an app (Compass, Waypoint or Lantern, phone or
// website) reports a crash so it shows in the owner console's errors
// view. Works signed out too (a crash on the sign-in screen); with a
// valid bearer token the error is tied to that account. A scout
// device's token is never read here.
//
// { product, message, name?, stack?, context?: { appVersion, platform,
//   screen, … } }  →  { ok: true }

import { z } from "zod";
import { prisma } from "@/lib/db";
import { json, readJson, v1PublicRoute } from "@/lib/api/v1";
import { verifyToken } from "@/lib/auth/api-token";
import { recordAppError } from "@/lib/ops/error-tracker";
import { PRODUCTS, trimContext } from "@/lib/owner/inbox";

export const runtime = "nodejs";

const Body = z.object({
  product: z.enum(PRODUCTS, { errorMap: () => ({ message: "bad_product" }) }),
  message: z.string({ required_error: "missing_fields" }).trim().min(1, "missing_fields").max(2000),
  name: z.string().trim().max(200).optional(),
  stack: z.string().max(8000).optional(),
  context: z.record(z.unknown()).optional(),
});

export const POST = v1PublicRoute(
  async (req, { ip }) => {
    const input = await readJson(req, Body);
    const verified = await verifyToken(req.headers.get("authorization"), prisma).catch(() => null);
    await recordAppError({
      product: input.product,
      name: input.name,
      message: input.message,
      stack: input.stack,
      userId: verified?.userId ?? null,
      context: trimContext(input.context),
      ip,
    });
    return json({ ok: true });
  },
  { limits: [{ bucket: "app-error", limit: 30, windowMs: 10 * 60_000 }] },
);
