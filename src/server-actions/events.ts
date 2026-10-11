"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { ownedIdOrNull, ownedIds } from "@/lib/tenancy/owned";
import { deleteEventWithSlipTrace } from "@/lib/events/delete";

const Iso = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const EventInput = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional().or(z.literal("")),
  startsAt: Iso,
  endsAt: Iso.optional().or(z.literal("")),
  allDay: z.union([z.literal("on"), z.literal("")]).optional(),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  locationAddress: z.string().trim().max(500).optional().or(z.literal("")),
  category: z.string().trim().max(50).optional().or(z.literal("")),
  cost: z.string().optional().or(z.literal("")),
  capacity: z.string().optional().or(z.literal("")),
  signupRequired: z.union([z.literal("on"), z.literal("")]).optional(),
  rrule: z.string().trim().max(200).optional().or(z.literal("")),
  recurrenceUntil: z.string().optional().or(z.literal("")),
  serviceHours: z.string().optional().or(z.literal("")),
  campingNights: z.string().optional().or(z.literal("")),
  hikingMiles: z.string().optional().or(z.literal("")),
  requiresPermissionSlip: z.union([z.literal("on"), z.literal("")]).optional(),
  permissionSlipText: z.string().trim().max(5000).optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
});

export type EventActionState = { error?: string; ok?: true } | null;

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." as const };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." as const };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." as const };
  return { user, org };
}

function nz<T extends string | undefined | null>(v: T): string | undefined {
  return v && String(v).trim() ? String(v).trim() : undefined;
}

function toInt(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function toFloat(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function upsertEvent(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };

  const parsed = EventInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  const auth = await authorize(d.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const { org } = auth;

  const startsAt = new Date(d.startsAt);
  const endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if (endsAt && endsAt < startsAt) return { error: "End time must be after start." };

  const data = {
    orgId: org.id,
    title: d.title,
    description: nz(d.description) ?? null,
    startsAt,
    endsAt,
    allDay: d.allDay === "on",
    location: nz(d.location) ?? null,
    locationAddress: nz(d.locationAddress) ?? null,
    category: nz(d.category) ?? null,
    cost: toInt(d.cost) ?? null,
    capacity: toInt(d.capacity) ?? null,
    signupRequired: d.signupRequired === "on",
    rrule: nz(d.rrule) ?? null,
    recurrenceUntil: d.recurrenceUntil ? new Date(d.recurrenceUntil) : null,
    serviceHours: toFloat(d.serviceHours) ?? null,
    campingNights: toInt(d.campingNights) ?? null,
    hikingMiles: toFloat(d.hikingMiles) ?? null,
    requiresPermissionSlip: d.requiresPermissionSlip === "on",
    permissionSlipText: nz(d.permissionSlipText) ?? null,
    locationId: null as string | null,
  };
  const locationId = await ownedIdOrNull("location", org.id, d.locationId);
  if (locationId === false) return { error: "Location not found." };
  data.locationId = locationId;

  if (d.id) {
    const { count } = await prisma.event.updateMany({ where: { id: d.id, orgId: org.id }, data });
    if (count === 0) return { error: "Event not found." };
  } else {
    await prisma.event.create({ data });
  }

  revalidatePath(`/o/${org.slug}/admin/events`);
  revalidatePath(`/o/${org.slug}/calendar`);
  // Bust the public events API cache so the homepage upcoming-events
  // widget shows the new event on its next fetch.
  updateTag("public-events");
  redirect(`/o/${org.slug}/admin/events`);
}

const DeleteSchema = z.object({ orgSlug: z.string().min(1), id: z.string().min(1) });

export async function deleteEvent(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const deleted = await deleteEventWithSlipTrace({
    orgId: auth.org.id,
    eventId: parsed.data.id,
    user: auth.user,
  });
  if (!deleted) return { error: "Event not found." };
  revalidatePath(`/o/${auth.org.slug}/admin/events`);
  revalidatePath(`/o/${auth.org.slug}/calendar`);
  updateTag("public-events");
  // Redirect server-side so the client doesn't have to coordinate
  // navigation after success.
  redirect(`/o/${auth.org.slug}/admin/events`);
}
