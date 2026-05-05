/**
 * RFC 5545 iCalendar (text/calendar) feed builder.
 * Spec: https://datatracker.ietf.org/doc/html/rfc5545
 *
 * Designed for read-only consumption by Google Calendar / Apple
 * Calendar / Outlook subscribers. Each Compass event becomes one
 * VEVENT; recurring events are emitted as a single VEVENT with
 * RRULE rather than expanded.
 */

export type IcalEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  location?: string | null;
  rrule?: string | null;
  recurrenceUntil?: Date | null;
  url?: string;
  updatedAt?: Date;
};

const CRLF = "\r\n";

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fmtUtc(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/**
 * RFC 5545 §3.1: lines must not exceed 75 octets; long lines fold by
 * inserting CRLF + a single whitespace.
 */
export function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  chunks.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    chunks.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join(CRLF);
}

export function buildIcal({
  calName,
  uidHost,
  events,
}: {
  calName: string;
  uidHost: string;
  events: IcalEvent[];
}): string {
  const lines: string[] = [];
  const push = (l: string) => lines.push(fold(l));
  const now = new Date();

  push("BEGIN:VCALENDAR");
  push("VERSION:2.0");
  push("PRODID:-//Compass//Compass Calendar//EN");
  push("CALSCALE:GREGORIAN");
  push("METHOD:PUBLISH");
  push(`X-WR-CALNAME:${escapeText(calName)}`);

  for (const ev of events) {
    push("BEGIN:VEVENT");
    push(`UID:${ev.id}@${uidHost}`);
    push(`DTSTAMP:${fmtUtc(ev.updatedAt ?? now)}`);
    if (ev.allDay) {
      push(`DTSTART;VALUE=DATE:${fmtDate(ev.startsAt)}`);
      if (ev.endsAt) push(`DTEND;VALUE=DATE:${fmtDate(ev.endsAt)}`);
    } else {
      push(`DTSTART:${fmtUtc(ev.startsAt)}`);
      if (ev.endsAt) push(`DTEND:${fmtUtc(ev.endsAt)}`);
    }
    push(`SUMMARY:${escapeText(ev.title)}`);
    if (ev.description) push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.url) push(`URL:${ev.url}`);
    if (ev.rrule) {
      const until = ev.recurrenceUntil ? `;UNTIL=${fmtUtc(ev.recurrenceUntil)}` : "";
      push(`RRULE:${ev.rrule}${until}`);
    }
    push("END:VEVENT");
  }

  push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

/**
 * Build a "Add to Google Calendar" URL for a single event.
 * Google ignores RRULE in this URL form; recurring events still link
 * usefully to the first occurrence.
 */
export function googleCalendarAddUrl(ev: IcalEvent, base?: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: ev.allDay
      ? `${fmtDate(ev.startsAt)}/${fmtDate(ev.endsAt ?? ev.startsAt)}`
      : `${fmtUtc(ev.startsAt)}/${fmtUtc(ev.endsAt ?? new Date(ev.startsAt.getTime() + 60 * 60 * 1000))}`,
  });
  if (ev.description) params.set("details", ev.description);
  if (ev.location) params.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}${base ? `&sprop=website:${encodeURIComponent(base)}` : ""}`;
}
