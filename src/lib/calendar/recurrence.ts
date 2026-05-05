import { RRule, rrulestr } from "rrule";

/**
 * Expand a Compass event with optional RRULE into concrete occurrences
 * inside [from, to). Single (non-recurring) events return a single
 * occurrence if their startsAt falls in the window.
 */
export function expandOccurrences(
  event: { startsAt: Date; rrule?: string | null; recurrenceUntil?: Date | null },
  from: Date,
  to: Date
): Date[] {
  if (!event.rrule) {
    return event.startsAt >= from && event.startsAt < to ? [event.startsAt] : [];
  }
  const rule = rrulestr(`DTSTART:${formatBasicUtc(event.startsAt)}\nRRULE:${event.rrule}`, {
    dtstart: event.startsAt,
  }) as RRule;
  const cap = event.recurrenceUntil ?? to;
  return rule.between(from, cap < to ? cap : to, true);
}

function formatBasicUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
