"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

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

const TYPES = [
  "Meeting",
  "Camp",
  "Outdoor",
  "Service",
  "Trailhead",
  "High Adv.",
] as const;

const Schema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(TYPES).default("Meeting"),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  website: z.string().trim().max(500).optional().or(z.literal("")),
  lat: z.string().trim().max(40).optional().or(z.literal("")),
  lng: z.string().trim().max(40).optional().or(z.literal("")),
  distanceMiles: z.string().optional().or(z.literal("")),
  imageUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  tags: z.string().trim().max(400).optional().or(z.literal("")),
  archived: z.union([z.literal("on"), z.literal("")]).optional(),
});

export type LocationState = { ok?: true; error?: string; id?: string } | null;

function splitTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function upsertLocation(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const data = {
    orgId: auth.org.id,
    name: d.name,
    type: d.type,
    address: d.address?.trim() || null,
    description: d.description?.trim() || null,
    phone: d.phone?.trim() || null,
    website: d.website?.trim() || null,
    lat: d.lat?.trim() || null,
    lng: d.lng?.trim() || null,
    distanceMiles: d.distanceMiles ? parseFloat(d.distanceMiles) : null,
    imageUrl: d.imageUrl || null,
    tags: splitTags(d.tags ?? ""),
    archived: d.archived === "on",
  };

  if (d.id) {
    const existing = await prisma.location.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Location not found." };
    await prisma.location.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Location",
      entityId: existing.id,
      action: "update",
      summary: `Updated location ${d.name}`,
    });
    revalidatePath(`/o/${auth.org.slug}/admin/locations`);
    return { ok: true, id: existing.id };
  }
  const created = await prisma.location.create({ data });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Location",
    entityId: created.id,
    action: "create",
    summary: `Created location ${d.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/locations`);
  return { ok: true, id: created.id };
}

const DeleteSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().min(1),
});

export async function deleteLocation(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const loc = await prisma.location.findUnique({ where: { id: parsed.data.id } });
  if (!loc || loc.orgId !== auth.org.id) return { error: "Location not found." };
  await prisma.location.delete({ where: { id: loc.id } });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Location",
    entityId: loc.id,
    action: "delete",
    summary: `Deleted location ${loc.name}`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/locations`);
  return { ok: true };
}
