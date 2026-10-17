// The signed-in parent's own scouts (GET /api/v1/me/scouts), the same
// cards as the website's /account/my-scouts.

import { apiRequest, type ClientOptions } from "./client";

export type MyScoutUpcoming = {
  eventId: string;
  title: string;
  startsAt: string;
  location: string | null;
  rsvp: "yes" | "no" | "maybe" | null;
  requiresPermissionSlip: boolean;
  slipSigned: boolean;
};

export type MyScout = {
  orgId: string;
  orgSlug: string;
  orgDisplayName: string;
  memberId: string;
  scoutName: string;
  patrol: string | null;
  position: string | null;
  balanceCents: number | null;
  upcoming: MyScoutUpcoming[];
};

export function fetchMyScouts(client: ClientOptions): Promise<{ scouts: MyScout[]; emailVerified: boolean }> {
  return apiRequest(client, "/me/scouts");
}

/** Scouts in this unit whose permission slip for the event is still unsigned. */
export function unsignedSlipsFor(scouts: MyScout[], orgId: string, eventId: string): MyScout[] {
  return scouts.filter(
    (s) =>
      s.orgId === orgId &&
      s.upcoming.some((u) => u.eventId === eventId && u.requiresPermissionSlip && !u.slipSigned),
  );
}
