// POST /api/v1/support { subject, body, orgId?, context?, category?,
// product? } — file a SupportTicket from the mobile app's "Contact
// support" surface. It shows up in the owner console inbox.

import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  IdSchema,
  LIMITS,
  json,
  readJson,
  requireOrgAccessForResource,
  v1Route,
} from "@/lib/api/v1";
import { PRODUCTS, trimContext } from "@/lib/owner/inbox";

export const runtime = "nodejs";

const Body = z.object({
  subject: z.string({ required_error: "missing_fields" }).trim().min(1, "missing_fields").max(200),
  body: z.string({ required_error: "missing_fields" }).trim().min(1, "missing_fields").max(8000),
  orgId: IdSchema.optional(),
  context: z.record(z.unknown()).optional(),
  category: z.enum(["question", "bug", "billing", "abuse", "feature", "other"]).optional(),
  product: z.enum(PRODUCTS).optional(),
});

export const POST = v1Route(
  async (req, { user }) => {
    const input = await readJson(req, Body);

    // Tie it to the unit the app is in when it says so (and the user
    // belongs to it); otherwise their first unit, if any. A family on
    // Lantern alone has none, and that's fine.
    let orgId: string | null = null;
    if (input.orgId) {
      orgId = (await requireOrgAccessForResource(input.orgId, user.id)).org.id;
    } else {
      const m = await prisma.orgMembership.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { orgId: true },
      });
      orgId = m?.orgId ?? null;
    }

    const context = trimContext(input.context);
    const ticket = await prisma.supportTicket.create({
      data: {
        orgId,
        userId: user.id,
        fromEmail: user.email,
        fromName: user.displayName,
        subject: input.subject,
        body: input.body,
        status: "open",
        product: input.product ?? "compass",
        ...(context ? { context: context as object } : {}),
        ...(input.category ? { category: input.category } : {}),
      },
    });
    return json({ id: ticket.id });
  },
  { limits: [LIMITS.support] },
);
