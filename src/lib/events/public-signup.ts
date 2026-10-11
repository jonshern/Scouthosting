// Public event sign-ups from apps outside Compass (Waypoint's merit
// badge day pages). No sign-in: a guardian names one scout, picks
// stations (merit badge sessions) and volunteer roles, and gets a
// seat or a waitlist spot on each.
//
// The event is addressed by Event.publicSlug, stations and roles by
// SignupSlot.key ("station:<id>" / "role:<id>"). Seats are claimed
// with lib/slots under a row lock, all in one transaction, so a full
// slot that doesn't allow a waitlist rolls the whole request back.
//
// Youth protection: the only thing stored about the scout is what the
// guardian typed as "first name + last initial" (validated below). The
// guardian's email is the contact for every seat, scout or volunteer.

import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SlotFullError, claimSlot } from "@/lib/slots";

const MINUTE = 60_000;
/** Postgres-backed budgets for the public route (lib/security/rate-limit). */
export const SIGNUP_LIMITS = {
  ip: { limit: 30, windowMs: 10 * MINUTE },
  email: { limit: 20, windowMs: 60 * MINUTE },
};

export const STATION_KEY_PREFIX = "station:";
export const ROLE_KEY_PREFIX = "role:";

export const stationKey = (id: string) => `${STATION_KEY_PREFIX}${id}`;
export const roleKey = (id: string) => `${ROLE_KEY_PREFIX}${id}`;

/** Public slugs: lowercase words joined by hyphens, like a URL path. */
export const PublicSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Public slug must be at least 3 characters.")
  .max(80, "Public slug must be at most 80 characters.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Public slug may use only a-z, 0-9 and single hyphens.");

/**
 * Station and role ids are opaque strings from the event file. They
 * may look like requirement ids ("first-aid#4b"), so allow the
 * characters those use, nothing that needs escaping anywhere.
 */
export const ExternalIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:#-]*$/, "invalid id");

/**
 * First name and last initial: "Alex P." / "Alex P" / "Mary-Kate O.".
 * One given name (letters, apostrophes, hyphens), a space, one letter,
 * an optional period. Anything longer could be a full surname.
 */
export const SCOUT_NAME_RE = /^\p{L}[\p{L}'’-]{0,29} \p{L}\.?$/u;

export const ScoutNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Scout name is required.")
      .max(34, "Scout name is too long.")
      .regex(SCOUT_NAME_RE, "Scout name must be a first name and last initial only, like \"Alex P.\""),
  );

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .nullable()
    .transform((s) => (s ? s : undefined));

const idList = (max: number, what: string) =>
  z
    .array(ExternalIdSchema, { message: `${what} must be a list of ids.` })
    .max(max, `Pick at most ${max} ${what}.`)
    .default([])
    .transform((ids) => [...new Set(ids)]);

export const SignupBodySchema = z
  .object({
    eventSlug: z.string().max(80).optional(),
    guardian: z.object(
      {
        name: z.string().trim().min(1, "Guardian name is required.").max(120, "Guardian name is too long."),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(320, "Guardian email is too long.")
          .email("Guardian email doesn't look right."),
        phone: optionalText(40, "Phone number is too long.").refine(
          (p) => p === undefined || /^[0-9+().\-\s]{7,40}$/.test(p),
          "Phone number doesn't look right.",
        ),
      },
      { message: "Guardian details are required." },
    ),
    scoutName: ScoutNameSchema,
    unit: optionalText(60, "Unit is too long."),
    stationIds: idList(20, "stations"),
    volunteerRoles: idList(10, "volunteer roles"),
  })
  .refine((b) => b.stationIds.length + b.volunteerRoles.length > 0, {
    message: "Pick at least one station or volunteer role.",
    path: ["stationIds"],
  });

export type SignupBody = z.output<typeof SignupBodySchema>;

export type SignupResult = {
  status: "confirmed" | "waitlisted";
  waitlistedStationIds?: string[];
  waitlistedVolunteerRoles?: string[];
};

/** A failure the route turns into `{ error, message }` with `status`. */
export class SignupError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SignupError";
  }
}

type Db = Pick<PrismaClient, "event" | "signupSlot" | "$transaction">;

/**
 * Record one guardian + scout sign-up. Throws SignupError for anything
 * the caller should see (404 unknown event, 400 unknown ids, 409 full).
 */
export async function submitPublicSignup(
  db: Db,
  publicSlug: string,
  body: SignupBody,
  now: Date = new Date(),
): Promise<SignupResult> {
  if (body.eventSlug !== undefined && body.eventSlug !== publicSlug) {
    throw new SignupError(400, "slug_mismatch", "The event in the request doesn't match the address.");
  }
  const event = await db.event.findUnique({
    where: { publicSlug },
    select: {
      id: true,
      orgId: true,
      signupRequired: true,
      startsAt: true,
      endsAt: true,
      org: { select: { suspendedAt: true } },
    },
  });
  if (!event || !event.signupRequired || event.org.suspendedAt) {
    throw new SignupError(404, "event_not_found", "That event isn't taking sign-ups here.");
  }
  // No end time: allow sign-ups through the day it starts.
  const closesAt = event.endsAt?.getTime() ?? event.startsAt.getTime() + 24 * 60 * 60 * 1000;
  if (closesAt < now.getTime()) {
    throw new SignupError(409, "event_over", "This event is over, so sign-ups are closed.");
  }

  const wanted = [
    ...body.stationIds.map((id) => ({ kind: "station" as const, id, key: stationKey(id) })),
    ...body.volunteerRoles.map((id) => ({ kind: "role" as const, id, key: roleKey(id) })),
  ];
  const slots = await db.signupSlot.findMany({
    where: { eventId: event.id, key: { in: wanted.map((w) => w.key) } },
    select: { id: true, key: true, title: true },
  });
  const byKey = new Map(slots.map((s) => [s.key, s]));
  const unknownStations = body.stationIds.filter((id) => !byKey.has(stationKey(id)));
  const unknownRoles = body.volunteerRoles.filter((id) => !byKey.has(roleKey(id)));
  if (unknownStations.length || unknownRoles.length) {
    throw new SignupError(400, "unknown_ids", "Some stations or volunteer roles aren't part of this event.", {
      unknownStationIds: unknownStations,
      unknownVolunteerRoles: unknownRoles,
    });
  }

  const { guardian, scoutName, unit } = body;
  const notes = unit ? `Unit: ${unit}` : null;
  // Lock slots in a fixed order so two requests over the same slots
  // can't deadlock each other.
  const plan = wanted
    .map((w) => ({ ...w, slot: byKey.get(w.key)! }))
    .sort((a, b) => (a.slot.id < b.slot.id ? -1 : a.slot.id > b.slot.id ? 1 : 0));

  const waitlistedStations: string[] = [];
  const waitlistedRoles: string[] = [];
  try {
    await db.$transaction(async (tx) => {
      for (const p of plan) {
        const r = await claimSlot(tx, {
          orgId: event.orgId,
          slotId: p.slot.id,
          userId: null,
          name: guardian.name,
          email: guardian.email,
          phone: guardian.phone ?? null,
          // Stations seat the scout; a volunteer role is the guardian's.
          scoutName: p.kind === "station" ? scoutName : "",
          notes,
          idempotent: true,
        }).catch((err: unknown) => {
          if (err instanceof SlotFullError) {
            throw new SignupError(409, "slot_full", `${p.slot.title} is full.`, {
              ...(p.kind === "station" ? { stationId: p.id } : { volunteerRole: p.id }),
            });
          }
          throw err;
        });
        if (r.waitlisted) (p.kind === "station" ? waitlistedStations : waitlistedRoles).push(p.id);
      }
    });
  } catch (err) {
    // Two first-time requests for the same scout racing past the
    // idempotency check can't both insert; the loser just retries.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new SignupError(409, "conflict", "Someone just signed up with these details. Try again.");
    }
    throw err;
  }

  const order = (ids: string[], all: string[]) => all.filter((id) => ids.includes(id));
  const result: SignupResult = {
    status: waitlistedStations.length ? "waitlisted" : "confirmed",
  };
  if (waitlistedStations.length) result.waitlistedStationIds = order(waitlistedStations, body.stationIds);
  if (waitlistedRoles.length) result.waitlistedVolunteerRoles = order(waitlistedRoles, body.volunteerRoles);
  return result;
}
