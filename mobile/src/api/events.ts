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

export type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  locationAddress: string | null;
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
  rsvps: { yes: number; no: number; maybe: number };
  myRsvp: { response: EventRsvp; guests: number; notes: string | null } | null;
};

export async function fetchEvent(
  client: ClientOptions,
  eventId: string,
): Promise<{ event: EventDetail }> {
  return apiRequest(client, `/events/${eventId}`);
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
): Promise<{ ok: true; response: EventRsvp; guests: number; notes: string | null }> {
  return apiRequest(client, `/events/${eventId}/rsvp`, {
    method: "POST",
    body: { response, ...extras },
  });
}
