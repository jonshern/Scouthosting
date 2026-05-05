// Aggregate per-member credits earned from event attendance.
//
// Inputs:
//   - rsvps: Array of yes-RSVPs each with { memberId, response, event:
//            { serviceHours, campingNights, hikingMiles, startsAt } }.
//   - asOf:  optional cutoff (default: now). Future-dated events are
//            ignored — kids don't earn credits before they happen.
//
// Returns a Map<memberId, { serviceHours, campingNights, hikingMiles,
// eventCount }>.

export type CreditEvent = {
  startsAt: Date | string;
  serviceHours?: number | null;
  campingNights?: number | null;
  hikingMiles?: number | null;
};

export type CreditRsvp = {
  memberId?: string | null;
  response: string;
  event: CreditEvent;
};

export type Credits = {
  serviceHours: number;
  campingNights: number;
  hikingMiles: number;
  eventCount: number;
};

export function tallyCredits(
  rsvps: CreditRsvp[],
  { asOf = new Date() }: { asOf?: Date } = {},
): Map<string, Credits> {
  const out = new Map<string, Credits>();
  for (const r of rsvps) {
    if (r.response !== "yes" || !r.memberId || !r.event) continue;
    if (new Date(r.event.startsAt) > asOf) continue;
    const cur =
      out.get(r.memberId) ??
      ({ serviceHours: 0, campingNights: 0, hikingMiles: 0, eventCount: 0 } as Credits);
    cur.serviceHours += r.event.serviceHours || 0;
    cur.campingNights += r.event.campingNights || 0;
    cur.hikingMiles += r.event.hikingMiles || 0;
    cur.eventCount += 1;
    out.set(r.memberId, cur);
  }
  return out;
}

export function formatCsvRow(values: ReadonlyArray<unknown>): string {
  return values
    .map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}
