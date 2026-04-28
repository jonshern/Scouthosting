// Calendar utilities: ICS generation, Google Calendar add-event URL,
// direction URL builders (Google Maps / Apple Maps / Waze), and
// recurring-event occurrence expansion via the rrule library.

const PROD_NAME = "-//Scouthosting//EN";

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtUtc(d) {
  const x = new Date(d);
  return (
    x.getUTCFullYear() +
    pad(x.getUTCMonth() + 1) +
    pad(x.getUTCDate()) +
    "T" +
    pad(x.getUTCHours()) +
    pad(x.getUTCMinutes()) +
    pad(x.getUTCSeconds()) +
    "Z"
  );
}

function fmtDate(d) {
  const x = new Date(d);
  return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate());
}

// RFC 5545 text escaping for fields like SUMMARY/DESCRIPTION/LOCATION.
function escIcs(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold a long line at 75 octets per RFC 5545 (5.1).
function fold(line) {
  const out = [];
  let i = 0;
  const max = 75;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + max));
    i += max;
  }
  return out.join("\r\n");
}

function joinLines(lines) {
  return lines
    .filter(Boolean)
    .map(fold)
    .join("\r\n");
}

/**
 * Build a single VEVENT block. Returns lines (no wrapping VCALENDAR).
 */
function eventLines(event, { orgSlug }) {
  const uid = `${event.id}@${orgSlug}.scouthosting.com`;
  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${fmtUtc(event.updatedAt || event.createdAt || new Date())}`];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(event.startsAt)}`);
    if (event.endsAt) lines.push(`DTEND;VALUE=DATE:${fmtDate(event.endsAt)}`);
  } else {
    lines.push(`DTSTART:${fmtUtc(event.startsAt)}`);
    if (event.endsAt) lines.push(`DTEND:${fmtUtc(event.endsAt)}`);
  }

  lines.push(`SUMMARY:${escIcs(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escIcs(event.description)}`);
  const loc = event.locationAddress || event.location;
  if (loc) lines.push(`LOCATION:${escIcs(loc)}`);
  if (event.category) lines.push(`CATEGORIES:${escIcs(event.category)}`);
  if (event.rrule) {
    let rrule = String(event.rrule).replace(/^RRULE:/i, "");
    if (event.recurrenceUntil) {
      // Append/replace UNTIL — normalise to UTC.
      rrule = rrule
        .split(";")
        .filter((p) => !/^UNTIL=/i.test(p))
        .concat(`UNTIL=${fmtUtc(event.recurrenceUntil)}`)
        .join(";");
    }
    lines.push(`RRULE:${rrule}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Single-event ICS file (text/calendar). Used for one-off "Add to my
 * calendar" downloads from Apple Calendar / Outlook.
 */
export function icsFor(event, opts) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PROD_NAME}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  lines.push(...eventLines(event, opts));
  lines.push("END:VCALENDAR");
  return joinLines(lines) + "\r\n";
}

/**
 * Subscribable feed: all upcoming events for an org. Calendar apps poll
 * this periodically; edits propagate automatically.
 */
export function icsForOrg(events, { orgSlug, displayName }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_NAME}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escIcs(displayName)}`,
    `X-WR-CALDESC:${escIcs(`${displayName} events on Scouthosting`)}`,
  ];
  for (const ev of events) lines.push(...eventLines(ev, { orgSlug }));
  lines.push("END:VCALENDAR");
  return joinLines(lines) + "\r\n";
}

/**
 * Google Calendar's "render?action=TEMPLATE" URL — opens a pre-filled
 * event form in the user's Google Calendar so they can add it to their
 * personal calendar with one click.
 *
 * Google expects `dates=YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ` for timed
 * events, `dates=YYYYMMDD/YYYYMMDD` for all-day.
 */
export function gcalAddUrl(event) {
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", event.title || "");
  if (event.description) params.set("details", event.description);
  const loc = event.locationAddress || event.location;
  if (loc) params.set("location", loc);

  let dates;
  if (event.allDay) {
    const start = fmtDate(event.startsAt);
    const end = fmtDate(event.endsAt || event.startsAt);
    dates = `${start}/${end}`;
  } else {
    const start = fmtUtc(event.startsAt);
    // Default to a 1-hour event when no end is set.
    const end = fmtUtc(event.endsAt || new Date(new Date(event.startsAt).getTime() + 60 * 60 * 1000));
    dates = `${start}/${end}`;
  }
  params.set("dates", dates);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Outlook.com / Office 365 deep-link to compose an event.
 */
export function outlookAddUrl(event) {
  const start = new Date(event.startsAt).toISOString();
  const end = new Date(
    event.endsAt || new Date(event.startsAt).getTime() + 60 * 60 * 1000
  ).toISOString();
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title || "",
    body: event.description || "",
    startdt: start,
    enddt: end,
    location: event.locationAddress || event.location || "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Expand a single Event row into individual occurrences within a window.
 * Non-recurring events return [event]. Each returned occurrence keeps the
 * original id but with a synthetic `occurrenceStart` distinct DTSTART so
 * lists/feeds can render multiple instances.
 */
export async function expandOccurrences(event, { from, to, max = 50 } = {}) {
  if (!event.rrule) {
    if (to && new Date(event.startsAt) > to) return [];
    if (from && new Date(event.startsAt) < from && (!event.endsAt || new Date(event.endsAt) < from)) return [];
    return [event];
  }
  const rruleMod = (await import("rrule")).default;
  let rule;
  try {
    let str = String(event.rrule).replace(/^RRULE:/i, "");
    if (event.recurrenceUntil) {
      str = str
        .split(";")
        .filter((p) => !/^UNTIL=/i.test(p))
        .concat(`UNTIL=${fmtUtc(event.recurrenceUntil)}`)
        .join(";");
    }
    rule = rruleMod.rrulestr(`DTSTART:${fmtUtc(event.startsAt)}\nRRULE:${str}`);
  } catch {
    return [event]; // Malformed RRULE — treat as single.
  }

  const winStart = from || new Date();
  const winEnd = to || new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
  const dates = rule.between(winStart, winEnd, true).slice(0, max);
  const durMs = event.endsAt
    ? new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()
    : 0;
  return dates.map((d) => ({
    ...event,
    occurrenceStart: d,
    startsAt: d,
    endsAt: durMs ? new Date(d.getTime() + durMs) : null,
  }));
}

/**
 * Direction URLs from a place name or street address. We intentionally
 * don't geocode; we hand the address to the maps app and let it resolve.
 */
export function mapUrls(addressOrPlace) {
  if (!addressOrPlace) return null;
  const q = encodeURIComponent(addressOrPlace);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}
