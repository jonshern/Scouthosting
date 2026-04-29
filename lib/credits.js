// Aggregate per-member credits earned from event attendance.
//
// Inputs:
//   - rsvps:   Array<{ memberId, response, event: { serviceHours, campingNights, hikingMiles, startsAt } }>
//              Each row should already be filtered to response = "yes" and have its
//              event included.
//   - asOf:    optional cutoff Date (default: now). Future-dated events are
//              ignored — kids don't earn credits before they happen.
//
// Returns a Map<memberId, { serviceHours, campingNights, hikingMiles, eventCount }>.

export function tallyCredits(rsvps, { asOf = new Date() } = {}) {
  const out = new Map();
  for (const r of rsvps) {
    if (r.response !== "yes" || !r.memberId || !r.event) continue;
    if (new Date(r.event.startsAt) > asOf) continue;
    const cur = out.get(r.memberId) || {
      serviceHours: 0,
      campingNights: 0,
      hikingMiles: 0,
      eventCount: 0,
    };
    cur.serviceHours += r.event.serviceHours || 0;
    cur.campingNights += r.event.campingNights || 0;
    cur.hikingMiles += r.event.hikingMiles || 0;
    cur.eventCount += 1;
    out.set(r.memberId, cur);
  }
  return out;
}

export function formatCsvRow(values) {
  return values
    .map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}
