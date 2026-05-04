// Live block: upcoming events from the org's calendar.
//
// Pulls future events (or recurring ones with no end-of-recurrence) and
// renders them in one of three layouts. Updates automatically as
// events are added/removed/RSVP'd in /admin/events — admin places the
// block once and never has to touch the homepage again to keep
// "upcoming" current.

const LAYOUTS = ["list", "cards", "compact"];

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const eventsBlock = {
  type: "events",
  label: "Upcoming events",
  description: "Auto-updating list pulled from your calendar.",
  defaults: { limit: 5, layout: "list" },

  normalise(input) {
    return {
      limit: clampInt(input.limit, 1, 20, 5),
      layout: LAYOUTS.includes(input.layout) ? input.layout : "list",
    };
  },

  async fetch({ orgId, config, prisma }) {
    const now = new Date();
    const events = await prisma.event.findMany({
      where: {
        orgId,
        OR: [
          { startsAt: { gte: now } },
          // Recurring events with no end-of-recurrence — keep them in
          // the feed forever (the renderer can pick the next instance).
          { rrule: { not: null }, recurrenceUntil: null },
          // Recurring events whose recurrence hasn't ended yet.
          { rrule: { not: null }, recurrenceUntil: { gte: now } },
        ],
      },
      orderBy: { startsAt: "asc" },
      take: config.limit || 5,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
        rrule: true,
      },
    });
    return { events };
  },

  render({ data, config, escapeHtml }) {
    const events = data?.events || [];
    const layout = LAYOUTS.includes(config.layout) ? config.layout : "list";

    if (!events.length) {
      return `
    <section class="section cms-block cms-block--events">
      <div class="wrap">
        <h2>Upcoming events</h2>
        <p class="cms-empty">Nothing on the calendar yet — check back soon.</p>
      </div>
    </section>`;
    }

    const fmtDate = (d) =>
      new Date(d).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    const fmtTime = (d) =>
      new Date(d).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

    const items = events
      .map((e) => {
        const date = fmtDate(e.startsAt);
        const time = fmtTime(e.startsAt);
        const loc = e.location ? `<span class="cms-event__loc">· ${escapeHtml(e.location)}</span>` : "";
        if (layout === "cards") {
          return `
        <li class="cms-event-card">
          <div class="cms-event-card__date">${escapeHtml(date)}</div>
          <div class="cms-event-card__title"><a href="/events/${escapeHtml(e.id)}">${escapeHtml(e.title)}</a></div>
          <div class="cms-event-card__meta">${escapeHtml(time)} ${loc}</div>
        </li>`;
        }
        if (layout === "compact") {
          return `
        <li class="cms-event-row cms-event-row--compact">
          <a href="/events/${escapeHtml(e.id)}">${escapeHtml(e.title)}</a>
          <span class="cms-event__when">${escapeHtml(date)} · ${escapeHtml(time)}</span>
        </li>`;
        }
        // list
        return `
        <li class="cms-event-row">
          <div class="cms-event__when">
            <span class="cms-event__date">${escapeHtml(date)}</span>
            <span class="cms-event__time">${escapeHtml(time)}</span>
          </div>
          <div class="cms-event__body">
            <a class="cms-event__title" href="/events/${escapeHtml(e.id)}">${escapeHtml(e.title)}</a>
            ${loc}
          </div>
        </li>`;
      })
      .join("");

    const listClass =
      layout === "cards"
        ? "cms-event-cards"
        : layout === "compact"
        ? "cms-event-list cms-event-list--compact"
        : "cms-event-list";

    return `
    <section class="section cms-block cms-block--events">
      <div class="wrap">
        <h2>Upcoming events</h2>
        <ul class="${listClass}">${items}</ul>
        <p class="cms-block__more"><a href="/events">See full calendar →</a></p>
      </div>
      <style>
        .cms-block--events .wrap { max-width: 900px; }
        .cms-event-list, .cms-event-cards { list-style: none; padding: 0; margin: 1.25rem 0 0; }
        .cms-event-row { display: grid; grid-template-columns: 90px 1fr; gap: 1rem; padding: 1rem 0; border-top: 1px solid var(--line, #e5e7eb); }
        .cms-event-row:first-child { border-top: 0; }
        .cms-event__when { display: flex; flex-direction: column; }
        .cms-event__date { font-weight: 600; color: var(--ink-900, #111); }
        .cms-event__time { color: var(--ink-500, #6b7280); font-size: .9rem; }
        .cms-event__title { font-weight: 600; color: var(--primary, #1d6b39); text-decoration: none; }
        .cms-event__title:hover { text-decoration: underline; }
        .cms-event__loc { color: var(--ink-500, #6b7280); font-size: .9rem; margin-left: .5rem; }
        .cms-event-list--compact .cms-event-row--compact { display: flex; justify-content: space-between; align-items: baseline; padding: .55rem 0; border-top: 1px solid var(--line, #e5e7eb); }
        .cms-event-list--compact .cms-event-row--compact:first-child { border-top: 0; }
        .cms-event-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
        .cms-event-card { background: var(--surface, #fff); border: 1px solid var(--line, #e5e7eb); border-radius: 12px; padding: 1rem 1.1rem; }
        .cms-event-card__date { font-size: .8rem; color: var(--ink-500, #6b7280); text-transform: uppercase; letter-spacing: .04em; }
        .cms-event-card__title { font-weight: 600; margin-top: .25rem; }
        .cms-event-card__title a { color: var(--ink-900, #111); text-decoration: none; }
        .cms-event-card__meta { color: var(--ink-500, #6b7280); font-size: .85rem; margin-top: .25rem; }
        .cms-block__more { margin-top: 1.25rem; font-size: .9rem; }
        .cms-block__more a { color: var(--primary, #1d6b39); text-decoration: none; font-weight: 500; }
        .cms-block__more a:hover { text-decoration: underline; }
        .cms-empty { color: var(--ink-500, #6b7280); font-style: italic; }
      </style>
    </section>`;
  },
};
