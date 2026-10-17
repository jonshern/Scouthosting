"use server";

// Admin event page: staff + messaging. Thin wrappers over
// lib/events/{staff,messaging} (the same code the /api/v1 routes use)
// that turn API error codes into form messages.

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { ApiError } from "@/lib/api/v1";
import {
  AddStaffSchema,
  PatchStaffSchema,
  addStaff,
  removeStaff,
  updateStaff,
  type StaffEvent,
} from "@/lib/events/staff";
import { AnnounceSchema, CreateChannelSchema, announceToEvent, createEventChannel } from "@/lib/events/messaging";

export type EventStaffState = { ok?: true; error?: string; message?: string } | null;

const MESSAGES: Record<string, string> = {
  youth_email: "That address belongs to a youth member. Event staff must be adults.",
  event_over: "This event is over.",
  staff_exists: "That email is already on this event's staff.",
  bad_slot: "Pick a station from this event.",
  bad_counselor: "That counselor isn't in your directory.",
  bad_email: "Enter a valid email address.",
  missing_name: "Name is required.",
  missing_slot: "Pick a station.",
  missing_subject: "Subject is required.",
  missing_body: "Message is required.",
  empty_patch: "Nothing to change.",
  not_found: "Not found.",
  org_suspended: "This site is suspended and read-only.",
};

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return MESSAGES[err.code] ?? err.code;
  if (err instanceof ZodError) {
    const m = err.issues[0]?.message ?? "";
    return MESSAGES[m] ?? (m || "Invalid input.");
  }
  throw err;
}

/** FormData → object, with blank fields dropped so optional() applies. */
function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string" && v.trim() !== "" && !k.startsWith("$")) out[k] = v;
  });
  return out;
}

const Base = z.object({ orgSlug: z.string().min(1), eventId: z.string().min(1) });

type Ctx = {
  user: { id: string; displayName: string };
  org: { id: string; slug: string };
  event: StaffEvent;
  fields: Record<string, string>;
};

async function authorize(formData: FormData): Promise<Ctx | { error: string }> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const fields = formObject(formData);
  const base = Base.safeParse(fields);
  if (!base.success) return { error: "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: base.data.orgSlug }, select: { id: true, slug: true, suspendedAt: true } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  if (org.suspendedAt) return { error: MESSAGES.org_suspended };
  const event = await prisma.event.findFirst({
    where: { id: base.data.eventId, orgId: org.id },
    select: { id: true, orgId: true, title: true, startsAt: true, location: true },
  });
  if (!event) return { error: "Event not found." };
  return { user, org, event, fields };
}

function done(ctx: Ctx, message?: string): EventStaffState {
  revalidatePath(`/o/${ctx.org.slug}/admin/events/${ctx.event.id}`);
  return { ok: true, message };
}

export async function addEventStaff(_prev: EventStaffState, formData: FormData): Promise<EventStaffState> {
  const ctx = await authorize(formData);
  if ("error" in ctx) return ctx;
  try {
    const input = AddStaffSchema.parse(ctx.fields);
    const r = await addStaff(ctx.event, input, { actor: ctx.user });
    return done(ctx, r.inviteSent ? `Invited ${r.staff.name}.` : `Added ${r.staff.name}, but the invite email failed.`);
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function updateEventStaff(_prev: EventStaffState, formData: FormData): Promise<EventStaffState> {
  const ctx = await authorize(formData);
  if ("error" in ctx) return ctx;
  try {
    const staffId = z.string().min(1).parse(ctx.fields.staffId);
    // The station select sends "" for "no station": clear it.
    const patch = PatchStaffSchema.parse({
      role: ctx.fields.role,
      status: ctx.fields.status,
      slotId: formData.has("slotId") ? (ctx.fields.slotId ?? null) : undefined,
    });
    await updateStaff(ctx.event, staffId, patch, { actor: ctx.user });
    return done(ctx, "Saved.");
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function removeEventStaff(_prev: EventStaffState, formData: FormData): Promise<EventStaffState> {
  const ctx = await authorize(formData);
  if ("error" in ctx) return ctx;
  try {
    await removeStaff(ctx.event, z.string().min(1).parse(ctx.fields.staffId), { actor: ctx.user });
    return done(ctx);
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function createEventChannelAction(
  _prev: EventStaffState,
  formData: FormData,
): Promise<EventStaffState> {
  const ctx = await authorize(formData);
  if ("error" in ctx) return ctx;
  try {
    const input = CreateChannelSchema.parse(ctx.fields);
    const channel = await createEventChannel(ctx.event, input);
    return done(
      ctx,
      channel.isSuspended
        ? `${channel.name} is ready but paused: it needs two YPT-current leaders.`
        : `${channel.name} is ready (${channel.memberCount} members).`,
    );
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function announceEvent(_prev: EventStaffState, formData: FormData): Promise<EventStaffState> {
  const ctx = await authorize(formData);
  if ("error" in ctx) return ctx;
  try {
    const input = AnnounceSchema.parse(ctx.fields);
    const r = await announceToEvent(ctx.event, input, ctx.user);
    return done(
      ctx,
      r.recipientCount === 0
        ? "No one to email yet for that audience."
        : r.status === "queued"
          ? `Sending to ${r.recipientCount}.`
          : `Sent to ${r.deliveredCount} of ${r.recipientCount}.`,
    );
  } catch (err) {
    return { error: messageFor(err) };
  }
}
