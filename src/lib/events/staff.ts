// Event staffing: the adults an event needs (merit badge counselors at
// a badge day, station staff, volunteers, the event lead), as opposed
// to the families attending it (Rsvp).
//
// Shared by the /api/v1 staff routes, the public token RSVP route and
// the admin server actions. Functions throw ApiError (see lib/api/v1),
// which v1Route shapes into `{ error: "<code>" }`; the server actions
// turn the same codes into form messages.
//
// Invariants:
//   - Adults only. An address that belongs to a youth roster entry (or
//     a user holding the scout role) in the event's org is refused.
//   - The emailed RSVP link carries a random token; only its SHA-256
//     lands in EventStaff.rsvpTokenHash.
//   - Matching a signed-in user to a staff row by email requires a
//     verified email, so nobody can claim a row by signing up with
//     someone else's address.
//   - Every change that can move someone in or out of the staff and
//     station channels re-reconciles the event's channels.

import crypto from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ApiError, IdSchema, badRequest, notFound } from "@/lib/api/v1";
import { sendMail, type MailResult } from "@/lib/mail";
import { reconcileEventChannels } from "@/lib/chat";
import { audit } from "@/lib/audit";
import { orgPublicOrigin } from "@/lib/tenancy/resolve";

export const STAFF_ROLES = ["counselor", "staff", "volunteer", "lead"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_STATUSES = ["invited", "yes", "no", "maybe"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];
export const STAFF_RESPONSES = ["yes", "no", "maybe"] as const;
export type StaffResponse = (typeof STAFF_RESPONSES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  counselor: "Counselor",
  staff: "Staff",
  volunteer: "Volunteer",
  lead: "Event lead",
};

const Email = z.string().trim().toLowerCase().email("bad_email").max(320, "bad_email");
const Name = z.string().trim().min(1, "missing_name").max(120, "name_too_long");
const Phone = z.string().trim().max(40, "phone_too_long");
const Notes = z.string().trim().max(1000, "notes_too_long");
const Role = z.enum(STAFF_ROLES, { message: "bad_role" });
const Status = z.enum(STAFF_STATUSES, { message: "bad_status" });
const Response = z.enum(STAFF_RESPONSES, { message: "bad_status" });
const OptId = IdSchema.nullable().optional();

export const AddStaffSchema = z.object({
  name: Name,
  email: Email,
  phone: Phone.nullable().optional(),
  role: Role,
  slotId: OptId,
  counselorId: OptId,
  notes: Notes.nullable().optional(),
});
export type AddStaffInput = z.output<typeof AddStaffSchema>;

export const PatchStaffSchema = z
  .object({
    role: Role.optional(),
    slotId: OptId,
    status: Status.optional(),
    notes: Notes.nullable().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), { message: "empty_patch" });
export type PatchStaffInput = z.output<typeof PatchStaffSchema>;

export const StaffRsvpSchema = z.object({
  status: Response,
  notes: Notes.nullable().optional(),
});

export const TokenRsvpSchema = StaffRsvpSchema.extend({
  token: z.string().min(20, "invalid_token").max(200, "invalid_token").regex(/^[A-Za-z0-9_-]+$/, "invalid_token"),
});

type Db = PrismaClient;

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export function newStaffToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashStaffToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* DTO                                                                 */
/* ------------------------------------------------------------------ */

export const STAFF_INCLUDE = { slot: { select: { id: true, title: true, key: true } } } as const;

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  notes: string | null;
  counselorId: string | null;
  respondedAt: Date | null;
  slot: { id: string; title: string; key: string | null } | null;
};

/**
 * A station's external key: the slot's own `key` (e.g. Waypoint's
 * "station:<stationId>") when it has one, else one derived from the
 * slot id in the same shape.
 */
export function stationKeyFor(slot: { id: string; key?: string | null }): string {
  return slot.key || `station:${slot.id}`;
}

export function stationDto(slot: { id: string; title: string; key?: string | null } | null) {
  return slot ? { slotId: slot.id, key: stationKeyFor(slot), title: slot.title } : null;
}

export function staffDto(row: StaffRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    station: stationDto(row.slot),
    respondedAt: row.respondedAt,
    notes: row.notes,
    counselorId: row.counselorId,
  };
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Does this address belong to a youth anywhere in Compass: a youth
 * roster entry in any org (emails are plaintext, so this is a cheap
 * query) or a user holding the scout role in any org?
 */
export async function isYouthEmail(email: string, db: Db = defaultPrisma): Promise<boolean> {
  const match = { equals: email.trim(), mode: "insensitive" as const };
  const [youth, scout] = await Promise.all([
    db.member.findFirst({ where: { isYouth: true, deletedAt: null, email: match }, select: { id: true } }),
    db.orgMembership.findFirst({ where: { role: "scout", user: { email: match } }, select: { id: true } }),
  ]);
  return !!(youth || scout);
}

/** Refuse an address that belongs to a youth (in any org). */
export async function assertAdultEmail(email: string, db: Db = defaultPrisma): Promise<void> {
  if (await isYouthEmail(email, db)) throw badRequest("youth_email");
}

/** When an event stops taking staff answers: its end, else a day after it starts. */
export function eventClosesAt(event: { startsAt: Date; endsAt: Date | null }): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + 24 * 60 * 60 * 1000);
}

export function isEventOver(event: { startsAt: Date; endsAt: Date | null }, now: Date = new Date()): boolean {
  return eventClosesAt(event).getTime() < now.getTime();
}

async function assertSlotOnEvent(eventId: string, slotId: string, db: Db) {
  const slot = await db.signupSlot.findFirst({ where: { id: slotId, eventId }, select: { id: true } });
  if (!slot) throw badRequest("bad_slot");
}

async function assertCounselorInOrg(orgId: string, counselorId: string, db: Db) {
  const c = await db.meritBadgeCounselor.findFirst({ where: { id: counselorId, orgId }, select: { id: true } });
  if (!c) throw badRequest("bad_counselor");
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

/* ------------------------------------------------------------------ */
/* Leader operations                                                   */
/* ------------------------------------------------------------------ */

export type StaffEvent = {
  id: string;
  orgId: string;
  title: string;
  startsAt: Date;
  location: string | null;
};

export type Actor = { id: string; displayName?: string | null };

export async function listStaff(eventId: string, db: Db = defaultPrisma) {
  const rows = await db.eventStaff.findMany({
    where: { eventId },
    include: STAFF_INCLUDE,
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return rows.map(staffDto);
}

export async function addStaff(
  event: StaffEvent,
  input: AddStaffInput,
  opts: { actor?: Actor | null; db?: Db; baseUrl?: string },
) {
  const db = opts.db ?? defaultPrisma;
  await assertAdultEmail(input.email, db);
  if (input.slotId) await assertSlotOnEvent(event.id, input.slotId, db);
  if (input.counselorId) await assertCounselorInOrg(event.orgId, input.counselorId, db);

  const dup = await db.eventStaff.findUnique({
    where: { eventId_email: { eventId: event.id, email: input.email } },
    select: { id: true },
  });
  if (dup) throw new ApiError(409, "staff_exists");

  const token = newStaffToken();
  let row;
  try {
    row = await db.eventStaff.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        role: input.role,
        slotId: input.slotId || null,
        counselorId: input.counselorId || null,
        notes: input.notes || null,
        rsvpTokenHash: hashStaffToken(token),
      },
      include: STAFF_INCLUDE,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "staff_exists");
    throw err;
  }

  // Links go to the org's canonical address, never the request's Host
  // (a bearer client picks that header).
  let baseUrl = opts.baseUrl;
  if (!baseUrl) {
    const org = await db.org.findUniqueOrThrow({ where: { id: event.orgId }, select: { slug: true, customDomain: true } });
    baseUrl = orgPublicOrigin(org);
  }
  const sent = await sendStaffInvite({ event, staff: row, token, baseUrl });
  audit({
    orgId: event.orgId,
    userId: opts.actor?.id ?? null,
    userDisplay: opts.actor?.displayName ?? null,
    entityType: "EventStaff",
    entityId: row.id,
    action: "create",
    summary: `${row.name} (${row.role}) for ${event.title}`,
  });
  return { staff: staffDto(row), inviteSent: sent.ok };
}

export async function updateStaff(
  event: StaffEvent,
  staffId: string,
  patch: PatchStaffInput,
  opts: { actor?: Actor | null; db?: Db; now?: Date } = {},
) {
  const db = opts.db ?? defaultPrisma;
  const existing = await db.eventStaff.findFirst({ where: { id: staffId, eventId: event.id } });
  if (!existing) throw notFound();
  if (patch.slotId) await assertSlotOnEvent(event.id, patch.slotId, db);

  const data: {
    role?: string;
    slotId?: string | null;
    status?: string;
    respondedAt?: Date | null;
    notes?: string | null;
  } = {};
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.slotId !== undefined) data.slotId = patch.slotId || null;
  if (patch.notes !== undefined) data.notes = patch.notes || null;
  if (patch.status !== undefined && patch.status !== existing.status) {
    data.status = patch.status;
    data.respondedAt = patch.status === "invited" ? null : (opts.now ?? new Date());
  }

  const row = await db.eventStaff.update({ where: { id: existing.id }, data, include: STAFF_INCLUDE });
  await reconcileEventChannels(event.id, { prismaClient: db });
  audit({
    orgId: event.orgId,
    userId: opts.actor?.id ?? null,
    userDisplay: opts.actor?.displayName ?? null,
    entityType: "EventStaff",
    entityId: row.id,
    action: "update",
    summary: `${row.name}: ${Object.keys(data).join(", ")}`,
  });
  return staffDto(row);
}

export async function removeStaff(
  event: StaffEvent,
  staffId: string,
  opts: { actor?: Actor | null; db?: Db } = {},
) {
  const db = opts.db ?? defaultPrisma;
  const existing = await db.eventStaff.findFirst({
    where: { id: staffId, eventId: event.id },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound();
  await db.eventStaff.delete({ where: { id: existing.id } });
  await reconcileEventChannels(event.id, { prismaClient: db });
  audit({
    orgId: event.orgId,
    userId: opts.actor?.id ?? null,
    userDisplay: opts.actor?.displayName ?? null,
    entityType: "EventStaff",
    entityId: existing.id,
    action: "delete",
    summary: `${existing.name} from ${event.title}`,
  });
}

/* ------------------------------------------------------------------ */
/* Staff answering                                                     */
/* ------------------------------------------------------------------ */

async function recordResponse(
  staff: { id: string; eventId: string },
  status: StaffResponse,
  notes: string | null | undefined,
  extra: { userId?: string },
  db: Db,
  now: Date,
) {
  const row = await db.eventStaff.update({
    where: { id: staff.id },
    data: {
      status,
      respondedAt: now,
      ...(notes ? { notes } : {}),
      ...extra,
    },
    select: { id: true, status: true },
  });
  await reconcileEventChannels(staff.eventId, { prismaClient: db, now });
  return row;
}

/**
 * Answer from the emailed link. Unknown token → 404 invalid_token;
 * event over → 410 event_over; an address that has since turned out to
 * be a youth's → 403 youth_email.
 */
export async function respondByToken(
  token: string,
  status: StaffResponse,
  notes?: string | null,
  opts: { db?: Db; now?: Date } = {},
) {
  const db = opts.db ?? defaultPrisma;
  const now = opts.now ?? new Date();
  const staff = await db.eventStaff.findUnique({
    where: { rsvpTokenHash: hashStaffToken(token) },
    select: { id: true, eventId: true, email: true, event: { select: { startsAt: true, endsAt: true } } },
  });
  if (!staff) throw notFound("invalid_token");
  if (isEventOver(staff.event, now)) throw new ApiError(410, "event_over");
  if (await isYouthEmail(staff.email, db)) throw new ApiError(403, "youth_email");
  return recordResponse(staff, status, notes, {}, db, now);
}

/**
 * The staff row a signed-in user answers for on this event: one already
 * linked to them, else an unlinked row with their (verified) email.
 */
export async function findStaffForUser(
  eventId: string,
  user: { id: string; email: string; emailVerified: boolean },
  db: Db = defaultPrisma,
) {
  const linked = await db.eventStaff.findFirst({ where: { eventId, userId: user.id }, select: { id: true, eventId: true, userId: true, email: true } });
  if (linked) return linked;
  if (!user.emailVerified) return null;
  return db.eventStaff.findFirst({
    where: { eventId, userId: null, email: user.email.toLowerCase() },
    select: { id: true, eventId: true, userId: true, email: true },
  });
}

export async function respondAsUser(
  eventId: string,
  user: { id: string; email: string; emailVerified: boolean },
  status: StaffResponse,
  notes?: string | null,
  opts: { db?: Db; now?: Date } = {},
) {
  const db = opts.db ?? defaultPrisma;
  const staff = await findStaffForUser(eventId, user, db);
  if (!staff) throw notFound("not_staff");
  if ((await isYouthEmail(user.email, db)) || (await isYouthEmail(staff.email, db))) {
    throw new ApiError(403, "youth_email");
  }
  return recordResponse(staff, status, notes, { userId: user.id }, db, opts.now ?? new Date());
}

/** Every event the user is staff on, soonest first. */
export async function staffingForUser(
  user: { id: string; email: string; emailVerified: boolean },
  db: Db = defaultPrisma,
) {
  const rows = await db.eventStaff.findMany({
    where: {
      OR: [
        { userId: user.id },
        ...(user.emailVerified ? [{ userId: null, email: user.email.toLowerCase() }] : []),
      ],
    },
    include: {
      ...STAFF_INCLUDE,
      event: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          location: true,
          org: { select: { id: true, slug: true, displayName: true } },
        },
      },
    },
    orderBy: { event: { startsAt: "asc" } },
  });
  return rows.map((r) => ({
    staffId: r.id,
    role: r.role,
    status: r.status,
    station: stationDto(r.slot),
    respondedAt: r.respondedAt,
    event: {
      id: r.event.id,
      title: r.event.title,
      startsAt: r.event.startsAt,
      endsAt: r.event.endsAt,
      location: r.event.location,
      org: r.event.org,
    },
  }));
}

/* ------------------------------------------------------------------ */
/* Invite email                                                        */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function staffRsvpUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/staff-rsvp?token=${encodeURIComponent(token)}`;
}

export function renderStaffInvite(args: {
  name: string;
  role: string;
  eventTitle: string;
  eventWhen: string;
  eventWhere: string | null;
  stationTitle: string | null;
  url: string;
}): { subject: string; html: string } {
  const roleLabel = STAFF_ROLE_LABELS[args.role as StaffRole] ?? args.role;
  const lines = [
    `<p>Hi ${escapeHtml(args.name)},</p>`,
    `<p>You've been asked to help at <strong>${escapeHtml(args.eventTitle)}</strong> as <strong>${escapeHtml(roleLabel)}</strong>${
      args.stationTitle ? ` at the <strong>${escapeHtml(args.stationTitle)}</strong> station` : ""
    }.</p>`,
    `<p>${escapeHtml(args.eventWhen)}${args.eventWhere ? ` · ${escapeHtml(args.eventWhere)}` : ""}</p>`,
    `<p><a href="${escapeHtml(args.url)}">Let us know if you can make it</a></p>`,
    `<p style="color:#666;font-size:12px">This link is just for you. Don't forward it.</p>`,
  ];
  return { subject: `Can you help at ${args.eventTitle}?`, html: lines.join("\n") };
}

export async function sendStaffInvite(args: {
  event: StaffEvent;
  staff: { name: string; email: string; role: string; slot: { title: string } | null };
  token: string;
  baseUrl: string;
}): Promise<MailResult> {
  const { subject, html } = renderStaffInvite({
    name: args.staff.name,
    role: args.staff.role,
    eventTitle: args.event.title,
    eventWhen: args.event.startsAt.toLocaleString(),
    eventWhere: args.event.location,
    stationTitle: args.staff.slot?.title ?? null,
    url: staffRsvpUrl(args.baseUrl, args.token),
  });
  try {
    return await sendMail({ to: args.staff.email, toName: args.staff.name, subject, html });
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  }
}
