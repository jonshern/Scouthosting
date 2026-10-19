// POST /api/v1/feedback — the "Send feedback" screen in Compass,
// Waypoint and Lantern. Lands in the owner console inbox
// (/super-admin/inbox), tagged with the product it came from.
//
// { product: "compass"|"waypoint"|"lantern", kind?: "question"|"bug"|
//   "feature"|"billing"|"other", message, subject?, orgId?,
//   context?: { appVersion, platform, screen, … } }  →  { id }
//
// A Lantern family without a troop sends no orgId; that's fine.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { IdSchema, LIMITS, json, readJson, requireOrgAccessForResource, v1Route } from "@/lib/api/v1";
import { createInboxItem, KINDS, PRODUCTS, trimContext } from "@/lib/owner/inbox";
import { recordAction } from "@/lib/usage/collect";

export const runtime = "nodejs";

const Body = z.object({
  product: z.enum(PRODUCTS, { errorMap: () => ({ message: "bad_product" }) }),
  kind: z.enum(KINDS).optional(),
  message: z.string({ required_error: "missing_fields" }).trim().min(1, "missing_fields").max(8000),
  subject: z.string().trim().max(200).optional(),
  orgId: IdSchema.optional(),
  context: z.record(z.unknown()).optional(),
});

export const POST = v1Route(
  async (req, { user }) => {
    const input = await readJson(req, Body);
    const orgId = input.orgId ? (await requireOrgAccessForResource(input.orgId, user.id)).org.id : null;
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, displayName: true } });
    const ticket = await createInboxItem({
      product: input.product,
      kind: input.kind ?? "question",
      subject: input.subject,
      message: input.message,
      fromEmail: row.email,
      fromName: row.displayName,
      userId: user.id,
      orgId,
      context: trimContext(input.context),
    });
    recordAction("feedback_sent", { product: input.product, userId: user.id, orgId, props: { kind: input.kind ?? "question" } });
    return json({ id: ticket.id });
  },
  { limits: [LIMITS.support] },
);
