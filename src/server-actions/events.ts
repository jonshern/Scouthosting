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
import { PublicSlugSchema } from "@/lib/events/public-signup";
import { slotsFromEventFile } from "@/lib/events/waypoint-file";
import { fillFromWaitlist } from "@/lib/slots";
import { notifyPromoted } from "@/lib/slots/notify";

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
  publicSlug: PublicSlugSchema.optional().or(z.literal("")),
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
    publicSlug: d.publicSlug || null,
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

  try {
    if (d.id) {
      const { count } = await prisma.event.updateMany({ where: { id: d.id, orgId: org.id }, data });
      if (count === 0) return { error: "Event not found." };
    } else {
      await prisma.event.create({ data });
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { error: "That public sign-up slug is already used by another event." };
    }
    throw e;
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

const ImportSlotsSchema = z.object({
  orgSlug: z.string().min(1),
  eventId: z.string().min(1),
  file: z.string().min(1, "Paste the event file.").max(500_000, "That file is too large."),
  fileName: z.string().max(255).optional(),
});

export type ImportSlotsState = {
  error?: string;
  ok?: true;
  created?: number;
  updated?: number;
  /** The event's public slug after the import, when it has one. */
  publicSlug?: string | null;
  /** Set when the slug Waypoint will send can't be used as-is. */
  slugWarning?: string;
} | null;

/**
 * Create or update this event's sign-up slots from a Waypoint event
 * file: one slot per station ("station:<id>") and per volunteer role
 * ("role:<id>"). Re-importing an edited file updates titles and
 * capacities in place; slots missing from the file are left alone so
 * nobody's seat is deleted by an import.
 *
 * Waypoint sends the event file's name as the public slug, so an event
 * without one takes it from the file here; an event that already has a
 * different one keeps it and the leader is told they differ.
 */
export async function importEventSlots(
  _prev: ImportSlotsState,
  formData: FormData,
): Promise<ImportSlotsState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ImportSlotsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  const auth = await authorize(d.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const { org } = auth;

  const event = await prisma.event.findFirst({
    where: { id: d.eventId, orgId: org.id },
    select: { id: true, publicSlug: true },
  });
  if (!event) return { error: "Event not found." };

  const spec = slotsFromEventFile(d.file, d.fileName);
  if ("error" in spec) return { error: spec.error };

  const existing = await prisma.signupSlot.findMany({
    where: { eventId: event.id, key: { in: spec.slots.map((s) => s.key) } },
    select: { key: true },
  });
  const have = new Set(existing.map((s) => s.key));
  // A slot that grew lets its waitlist in, the same as when someone
  // releases a seat.
  const promotedIds = await prisma.$transaction(async (tx) => {
    const promoted: string[] = [];
    for (const s of spec.slots) {
      const row = await tx.signupSlot.upsert({
        where: { eventId_key: { eventId: event.id, key: s.key } },
        update: { title: s.title, description: s.description, capacity: s.capacity, sortOrder: s.sortOrder },
        create: { orgId: org.id, eventId: event.id, ...s },
        select: { id: true },
      });
      promoted.push(...(await fillFromWaitlist(tx, row.id)));
    }
    return promoted;
  });
  await notifyPromoted(promotedIds);

  let publicSlug = event.publicSlug;
  let slugWarning: string | undefined;
  const wanted = spec.publicSlug;
  if (!wanted) {
    if (!publicSlug) {
      slugWarning =
        "Couldn't tell the file's name. Set the public sign-up slug below to the file's name without .json.";
    }
  } else if (!publicSlug) {
    const taken = await prisma.event.findFirst({ where: { publicSlug: wanted }, select: { id: true } });
    if (taken) {
      slugWarning = `Another event already uses the public slug "${wanted}", so this one wasn't set.`;
    } else {
      try {
        await prisma.event.update({ where: { id: event.id }, data: { publicSlug: wanted } });
        publicSlug = wanted;
      } catch {
        slugWarning = `Another event already uses the public slug "${wanted}", so this one wasn't set.`;
      }
    }
  } else if (publicSlug !== wanted) {
    slugWarning = `This event's public slug is "${publicSlug}" but Waypoint will send "${wanted}". Change the slug below to match or sign-ups will be refused.`;
  }

  revalidatePath(`/o/${org.slug}/admin/events/${event.id}`);
  revalidatePath(`/o/${org.slug}/calendar`);
  const updated = spec.slots.filter((s) => have.has(s.key)).length;
  return { ok: true, created: spec.slots.length - updated, updated, publicSlug, slugWarning };
}
