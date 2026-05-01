// Calendar event list for the mobile Calendar screen.
//
// Shape mirrors GET /api/v1/orgs/:orgId/events on the server so the
// client doesn't translate field names. Color is a semantic palette
// key ("sky" / "accent" / "raspberry" / etc.) that the mobile renderer
// maps to a tokens.palette colour.

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
  color: string;
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
  color: string;
  rsvps: { yes: number; no: number; maybe: number };
  myRsvp: { response: EventRsvp; guests: number; notes: string | null } | null;
};

export async function fetchEvent(
  client: ClientOptions,
  eventId: string,
): Promise<{ event: EventDetail }> {
  return apiRequest(client, `/events/${eventId}`);
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
