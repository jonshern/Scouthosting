// POST /api/v1/support { subject, body, orgId?, context? } — file a
// SupportTicket from the mobile app's "Contact support" surface.

import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  IdSchema,
  LIMITS,
  badRequest,
  json,
  readJson,
  requireOrgAccessForResource,
  v1Route,
} from "@/lib/api/v1";

export const runtime = "nodejs";

const Body = z.object({
  subject: z.string({ required_error: "missing_fields" }).trim().min(1, "missing_fields").max(200),
  body: z.string({ required_error: "missing_fields" }).trim().min(1, "missing_fields").max(8000),
  orgId: IdSchema.optional(),
  context: z.record(z.unknown()).optional(),
  category: z.enum(["question", "bug", "billing", "abuse", "feature", "other"]).optional(),
});

export const POST = v1Route(
  async (req, { user }) => {
    const input = await readJson(req, Body);

    // SupportTicket requires an org. Use the one the app is in when it
    // says so (and the user belongs to it); otherwise their first.
    let orgId: string;
    if (input.orgId) {
      orgId = (await requireOrgAccessForResource(input.orgId, user.id)).org.id;
    } else {
      const m = await prisma.orgMembership.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { orgId: true },
      });
      if (!m) throw badRequest("no_org");
      orgId = m.orgId;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        orgId,
        userId: user.id,
        fromEmail: user.email,
        fromName: user.displayName,
        subject: input.subject,
        body: input.body,
        status: "open",
        ...(input.category ? { category: input.category } : {}),
      },
    });
    return json({ id: ticket.id });
  },
  { limits: [LIMITS.support] },
);
