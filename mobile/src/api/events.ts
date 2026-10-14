// Calendar event list for the mobile Calendar screen.
//
// Shape mirrors GET /api/v1/orgs/:orgId/events on the server.
//
// Two color shapes coexist on the wire:
//   - color (legacy)           — semantic palette key ("sky" / "accent")
//                                that the mobile renderer maps to
//                                tokens.palette via paletteFor(). Always
//                                present, kept for older builds.
//   - categoryColor / Ink (new) — CSS-ready strings; hex when the org
//                                has customised the category at
//                                /admin/categories, var(--key) when on
//                                the hardcoded defaults. New builds
//                                should prefer categoryColor when it
//                                starts with "#"; otherwise fall through
//                                to paletteFor(color).

import { apiRequest, type ClientOptions } from "./client";

export type EventRsvp = "yes" | "no" | "maybe";

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  category: string | null;
  categoryLabel: string | null;
  /** Legacy semantic palette key. Mobile maps via paletteFor(). */
  color: string;
  /** Hex (when the org customised) or `var(--key)` sentinel (on defaults). May be null. */
  categoryColor: string | null;
  /** Foreground/ink color paired with categoryColor. May be null. */
  categoryInk: string | null;
  capacity: number | null;
  costCents: number | null;
  rsvpYesCount: number;
  rsvpTotalCount: number;
  myRsvp: EventRsvp | null;
};

export type EventsResponse = { events: CalendarEvent[] };

export async function fetchEvents(
  client: ClientOptions,
  orgId: string,
  range: { from?: Date; to?: Date } = {},
): Promise<EventsResponse> {
  const query: Record<string, string> = {};
  if (range.from) query.from = range.from.toISOString();
  if (range.to) query.to = range.to.toISOString();
  return apiRequest<EventsResponse>(client, `/orgs/${orgId}/events`, { query });
}

export type EventSlot = {
  id: string;
  /** "station:<id>" / "role:<id>" for slots from a Waypoint event file; null otherwise. */
  key: string | null;
  title: string;
  description: string | null;
  capacity: number;
  allowWaitlist: boolean;
  active: number;
  waitlisted: number;
  /** The caller's own seat. */
  mine: "active" | "waitlisted" | null;
};

export type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  locationAddress: string | null;
  /** Dollars per scout. */
  cost: number | null;
  capacity: number | null;
  category: string | null;
  categoryLabel: string | null;
  /** Legacy semantic palette key. */
  color: string;
  /** Hex when org customised, var(--key) sentinel on defaults, null when no category. */
  categoryColor: string | null;
  /** Foreground/ink. */
  categoryInk: string | null;
  signupRequired: boolean;
  rsvps: { yes: number; no: number; maybe: number };
  myRsvp: { response: EventRsvp; guests: number; notes: string | null } | null;
  slots: EventSlot[];
  permissionSlip: { required: boolean; text: string | null };
};

/** GET /api/v1/events/<id> as the server sends it. */
export type EventDetailWire = Omit<EventDetail, "rsvps" | "myRsvp" | "slots" | "permissionSlip" | "signupRequired"> & {
  signupRequired?: boolean;
  rsvpSummary: { yes: number; no: number; maybe: number; guests: number };
  myRsvp: { id: string; response: EventRsvp; guests: number; notes?: string | null } | null;
  slots?: EventSlot[];
  permissionSlip?: { required: boolean; text: string | null };
};

/** Server shape to the screen's shape. */
export function toEventDetail(w: EventDetailWire): EventDetail {
  const { rsvpSummary, myRsvp, slots, permissionSlip, signupRequired, ...rest } = w;
  return {
    ...rest,
    signupRequired: !!signupRequired,
    rsvps: { yes: rsvpSummary?.yes ?? 0, no: rsvpSummary?.no ?? 0, maybe: rsvpSummary?.maybe ?? 0 },
    myRsvp: myRsvp ? { response: myRsvp.response, guests: myRsvp.guests ?? 0, notes: myRsvp.notes ?? null } : null,
    slots: slots ?? [],
    permissionSlip: permissionSlip ?? { required: false, text: null },
  };
}

export async function fetchEvent(
  client: ClientOptions,
  eventId: string,
): Promise<{ event: EventDetail }> {
  const res = await apiRequest<{ event: EventDetailWire }>(client, `/events/${eventId}`);
  return { event: toEventDetail(res.event) };
}

/** One line on where a slot stands, from the caller's point of view. */
export function slotStatus(s: EventSlot): string {
  const left = Math.max(0, s.capacity - s.active);
  if (s.mine === "active") return "You're signed up";
  if (s.mine === "waitlisted") return "You're on the waitlist";
  if (left > 0) return `${left} of ${s.capacity} open`;
  return s.allowWaitlist ? `Full · ${s.waitlisted} waiting` : "Full";
}

/** Claim a sign-up slot; full slots with a waitlist put you on it. */
export function takeSlot(
  client: ClientOptions,
  eventId: string,
  slotId: string,
): Promise<{ ok: true; waitlisted: boolean }> {
  return apiRequest(client, `/events/${eventId}/slots/${slotId}/take`, { method: "POST", body: {} });
}

export function releaseSlot(
  client: ClientOptions,
  eventId: string,
  slotId: string,
): Promise<{ ok: true; released: boolean }> {
  return apiRequest(client, `/events/${eventId}/slots/${slotId}/release`, { method: "POST", body: {} });
}

/** A parent signs their scout's permission slip. */
export function signPermissionSlip(
  client: ClientOptions,
  eventId: string,
  body: { memberId: string; signedByName: string; notes?: string },
): Promise<{ slip: { memberId: string; signedByName: string; signedAt: string } }> {
  return apiRequest(client, `/events/${eventId}/permission-slips`, { method: "POST", body });
}

/**
 * Resolve the tag color for an event. Prefers the new `categoryColor`
 * (hex) when the server returned one, otherwise falls through to
 * `paletteFor(color)` for the legacy semantic-key path.
 *
 * Caller passes their local paletteFor since the palette tokens live
 * in the theme module — keeps this helper free of theme imports.
 */
export function resolveEventColor(
  event: { color?: string | null; categoryColor?: string | null },
  paletteFor: (key: string) => string,
): string {
  const cc = event.categoryColor;
  // Hex (#abcdef) is render-ready; var(--…) sentinels mean "use the
  // legacy semantic key path." Anything else (null / undefined) also
  // falls through.
  if (typeof cc === "string" && cc.startsWith("#")) return cc;
  return paletteFor(event.color || "primary");
}

export async function setEventRsvp(
  client: ClientOptions,
  eventId: string,
  response: EventRsvp,
  extras: { guests?: number; notes?: string } = {},
): Promise<{ rsvp: { id: string; response: EventRsvp; guests: number; notes: string | null } }> {
  return apiRequest(client, `/events/${eventId}/rsvp`, {
    method: "POST",
    body: { response, ...extras },
  });
}
