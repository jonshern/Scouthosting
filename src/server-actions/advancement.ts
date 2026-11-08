"use server";

// Sign off a requirement a scout marked done, from the unit's
// Advancement page. Same rules and records as a sign-off from Waypoint
// (lib/counselor/progress-write.ts): leaders and admins of the unit only.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { organizerStandingOk } from "@/lib/admin/guard";
import { findScout, scoutRelation } from "@/lib/counselor/access";
import { RequirementId } from "@/lib/counselor/ids";
import { ProgressRefused, writeProgress } from "@/lib/counselor/progress-write";

const Input = z.object({
  orgSlug: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
  requirementId: RequirementId,
  patrol: z.string().max(50).optional(),
});

export async function signOffRequirement(formData: FormData): Promise<void> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  const slug = parsed.success ? parsed.data.orgSlug : String(formData.get("orgSlug") ?? "");
  const back = (q: string): never => {
    const patrol = parsed.success && parsed.data.patrol ? `&patrol=${encodeURIComponent(parsed.data.patrol)}` : "";
    redirect(`/o/${encodeURIComponent(slug)}/admin/advancement?${q}${patrol}#waiting`);
  };
  if (!(await verifyOrigin()) || !(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    back("error=" + encodeURIComponent("Something went wrong. Reload the page and try again."));
  }
  if (!parsed.success) back("error=" + encodeURIComponent("That requirement couldn't be signed off."));
  const d = parsed.data!;

  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${encodeURIComponent(d.orgSlug)}/admin/advancement`);
  const org = await prisma.org.findUnique({ where: { slug: d.orgSlug }, select: { id: true, slug: true, suspendedAt: true } });
  if (!org) back("error=" + encodeURIComponent("Unit not found."));
  const role = await roleInOrg(user!.id, org!.id);
  if ((role !== "leader" && role !== "admin") || !(await organizerStandingOk(user!.id))) {
    back("error=" + encodeURIComponent("Only the unit's leaders can sign off."));
  }
  if (org!.suspendedAt) back("error=" + encodeURIComponent("This unit is paused."));

  const scout = await findScout(d.memberId, org!.id);
  if (!scout) back("error=" + encodeURIComponent("Scout not found."));
  const current = await prisma.requirementProgress.findUnique({
    where: { memberId_requirementId: { memberId: scout!.id, requirementId: d.requirementId } },
    select: { status: true },
  });
  // Only what's waiting: this page never signs off something nobody marked done.
  if (current?.status !== "done") back("error=" + encodeURIComponent("That one isn't waiting for a sign-off any more."));

  const rel = await scoutRelation(user!, role!, scout!);
  try {
    await writeProgress(scout!, rel, user!, [{ requirementId: d.requirementId, status: "signed_off" }]);
  } catch (err) {
    if (err instanceof ProgressRefused) back("error=" + encodeURIComponent("Only the unit's leaders can sign off."));
    throw err;
  }
  revalidatePath(`/o/${org!.slug}/admin/advancement`);
  back("signed=1");
}
