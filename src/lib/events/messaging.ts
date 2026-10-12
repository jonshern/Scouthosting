// Event messaging: per-audience chat channels (staff, one station,
// families) and the email fallback that reaches the same people,
// including the ones without a Compass account.
//
// Shared by the /api/v1/events/:id/{channels,announce} routes and the
// admin server actions. Throws ApiError codes like lib/events/staff.

import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { IdSchema, badRequest } from "@/lib/api/v1";
import { EVENT_AUDIENCES, provisionEventChannel, type EventAudience } from "@/lib/chat";
import { buildEmailAudience, describeAudience, type EventAudienceSelector } from "@/lib/mail/audience";
import { sendLoggedBroadcast } from "@/lib/mail/broadcast";
import { stationDto, type StaffEvent, type Actor } from "@/lib/events/staff";

type Db = PrismaClient;

const Audience = z.enum(EVENT_AUDIENCES, { message: "bad_audience" });

export const CreateChannelSchema = z
  .object({ audience: Audience, slotId: IdSchema.nullable().optional() })
  .refine((o) => o.audience !== "station" || !!o.slotId, { message: "missing_slot", path: ["slotId"] });

export const AnnounceSchema = z
  .object({
    scope: z.enum(EVENT_AUDIENCES, { message: "bad_scope" }),
    slotId: IdSchema.nullable().optional(),
    subject: z.string().trim().min(1, "missing_subject").max(200, "subject_too_long"),
    body: z.string().trim().min(1, "missing_body").max(50_000, "body_too_long"),
    // Staff/station: also email staff still at "invited". The admin form
    // posts a checkbox ("on"); the API takes a boolean.
    includeUnanswered: z
      .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => v === true || v === "on" || v === "true"),
  })
  .refine((o) => o.scope !== "station" || !!o.slotId, { message: "missing_slot", path: ["slotId"] })
  .refine((o) => o.scope !== "families" || !o.includeUnanswered, {
    message: "unanswered_staff_only",
    path: ["includeUnanswered"],
  });
export type AnnounceInput = z.output<typeof AnnounceSchema>;

async function stationSlot(eventId: string, slotId: string | null | undefined, db: Db) {
  if (!slotId) return null;
  const slot = await db.signupSlot.findFirst({ where: { id: slotId, eventId }, select: { id: true, title: true } });
  if (!slot) throw badRequest("bad_slot");
  return slot;
}

const CHANNEL_SELECT = {
  id: true,
  name: true,
  audience: true,
  slotId: true,
  isSuspended: true,
  suspendedReason: true,
  archivedAt: true,
  slot: { select: { id: true, title: true, key: true } },
  _count: { select: { members: true } },
} as const;

type ChannelRow = {
  id: string;
  name: string;
  audience: string | null;
  slotId: string | null;
  isSuspended: boolean;
  suspendedReason: string | null;
  archivedAt: Date | null;
  slot: { id: string; title: string; key: string | null } | null;
  _count: { members: number };
};

export function eventChannelDto(c: ChannelRow) {
  return {
    id: c.id,
    name: c.name,
    audience: c.audience ?? "families",
    station: stationDto(c.slot),
    isSuspended: c.isSuspended,
    suspendedReason: c.suspendedReason,
    archived: !!c.archivedAt,
    memberCount: c._count.members,
  };
}

/** Find or create the event's channel for an audience, then reconcile it. */
export async function createEventChannel(
  event: StaffEvent,
  input: { audience: EventAudience; slotId?: string | null },
  db: Db = defaultPrisma,
) {
  const slot = input.audience === "station" ? await stationSlot(event.id, input.slotId, db) : null;
  const { id } = await provisionEventChannel({
    event,
    org: { id: event.orgId },
    audience: input.audience,
    slot,
    prismaClient: db,
  });
  const row = await db.channel.findUniqueOrThrow({ where: { id }, select: CHANNEL_SELECT });
  return eventChannelDto(row);
}

/** Leaders see every channel on the event; anyone else only their own. */
export async function listEventChannels(
  eventId: string,
  viewer: { userId: string; isLeader: boolean },
  db: Db = defaultPrisma,
) {
  const rows = await db.channel.findMany({
    where: {
      kind: "event",
      eventId,
      ...(viewer.isLeader ? {} : { members: { some: { userId: viewer.userId } } }),
    },
    orderBy: { createdAt: "asc" },
    select: CHANNEL_SELECT,
  });
  return rows.map(eventChannelDto);
}

/** Email the event's staff / one station / families, logged like any org send. */
export async function announceToEvent(
  event: StaffEvent,
  input: AnnounceInput,
  actor: Actor,
  db: Db = defaultPrisma,
) {
  const slot = input.scope === "station" ? await stationSlot(event.id, input.slotId, db) : null;
  const selector: EventAudienceSelector = {
    kind: "event",
    eventId: event.id,
    scope: input.scope,
    slotId: slot?.id ?? null,
    includeUnanswered: input.includeUnanswered,
  };
  const recipients = await buildEmailAudience(event.orgId, selector);
  const label = describeAudience(selector, slot ? `${event.title} — ${slot.title}` : event.title);
  return sendLoggedBroadcast({
    orgId: event.orgId,
    author: actor,
    subject: input.subject,
    body: input.body,
    audienceLabel: label,
    recipients,
  });
}
