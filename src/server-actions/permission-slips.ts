"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { dispatchPermissionSlips } from "@/lib/permission-slips/dispatch";
import { apexPublicOrigin } from "@/lib/tenancy/resolve";

const Schema = z.object({
  orgSlug: z.string().min(1),
  eventId: z.string().min(1),
});

export type SlipDispatchState =
  | { ok: true; emailsSent: number; scoutsCovered: number; skipped: { name: string; reason: string }[] }
  | { error: string }
  | null;


export async function sendPermissionSlips(
  _prev: SlipDispatchState,
  formData: FormData,
): Promise<SlipDispatchState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };

  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId, orgId: org.id },
    select: {
      id: true,
      title: true,
      startsAt: true,
      location: true,
      permissionSlipText: true,
    },
  });
  if (!event) return { error: "Event not found." };

  const baseUrl = apexPublicOrigin();
  const summary = await dispatchPermissionSlips(org, event, baseUrl);

  revalidatePath(`/o/${org.slug}/admin/events/${event.id}/permission-slips`);
  revalidatePath(`/o/${org.slug}/admin/permission-slips`);

  return {
    ok: true,
    emailsSent: summary.emailsSent,
    scoutsCovered: summary.scoutsCovered,
    skipped: summary.scoutsSkipped,
  };
}
