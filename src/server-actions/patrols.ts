"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { ownedIdOrNull } from "@/lib/tenancy/owned";

type AuthOk = {
  user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]>;
  org: NonNullable<Awaited<ReturnType<typeof prisma.org.findUnique>>>;
};
type AuthErr = { error: string };
async function authorizeLeader(orgSlug: string): Promise<AuthOk | AuthErr> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  return { user, org };
}

const Schema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1d3a8a"),
  leaderMemberId: z.string().optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  archived: z.union([z.literal("on"), z.literal("")]).optional(),
});

export type PatrolState = { ok?: true; error?: string; id?: string } | null;

export async function upsertPatrol(
  _prev: PatrolState,
  formData: FormData,
): Promise<PatrolState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;

  const leaderMemberId = await ownedIdOrNull("member", auth.org.id, d.leaderMemberId);
  if (leaderMemberId === false) return { error: "Leader not found." };

  const data = {
    orgId: auth.org.id,
    name: d.name,
    color: d.color,
    leaderMemberId,
    description: d.description?.trim() || null,
    archived: d.archived === "on",
  };
  if (d.id) {
    const existing = await prisma.patrol.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Patrol not found." };
    await prisma.patrol.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Patrol",
      entityId: existing.id,
      action: "update",
      summary: `Updated patrol ${d.name}`,
    });
    revalidatePath(`/o/${auth.org.slug}/admin/patrols`);
    return { ok: true, id: existing.id };
  }
  const created = await prisma.patrol.create({ data });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Patrol",
    entityId: created.id,
    action: "create",
    summary: `Created patrol ${d.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/patrols`);
  return { ok: true, id: created.id };
}

const DeleteSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().min(1),
});

export async function deletePatrol(
  _prev: PatrolState,
  formData: FormData,
): Promise<PatrolState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const p = await prisma.patrol.findUnique({ where: { id: parsed.data.id } });
  if (!p || p.orgId !== auth.org.id) return { error: "Patrol not found." };
  await prisma.patrol.delete({ where: { id: p.id } });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Patrol",
    entityId: p.id,
    action: "delete",
    summary: `Deleted patrol ${p.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/patrols`);
  return { ok: true };
}
