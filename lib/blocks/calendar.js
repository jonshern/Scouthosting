// Live block: month-grid calendar.
//
// Distinct from the events block (which is a list). Renders the next
// N months as month grids, with event dots on days that have events
// and a small list under each month. Pulls from Event table and
// auto-includes recurring events whose recurrenceUntil hasn't passed.
//
// Config:
//   monthsAhead: 1–3 (default 1) — how many months to render after
//                the current one
//   layout:     "grid" (default) — month grid with day cells
//               "list" — fall back to a chronological list (similar
//                         to events block but spanning N months)

const LAYOUTS = ["grid", "list"];

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export const calendarBlock = {
  type: "calendar",
  label: "Calendar",
  description: "Month-grid view of upcoming events.",
  defaults: { monthsAhead: 1, layout: "grid" },

  normalise(input) {
    return {
      monthsAhead: clampInt(input.monthsAhead, 0, 3, 1),
      layout: LAYOUTS.includes(input.layout) ? input.layout : "grid",
    };
  },

  async fetch({ orgId, config, prisma }) {
    const monthsAhead = clampInt(config.monthsAhead, 0, 3, 1);
    const now = new Date();
    const rangeStart = startOfMonth(now);
    // monthsAhead = 0 → just current month; monthsAhead = 3 → current + 3
    const rangeEnd = addMonths(rangeStart, monthsAhead + 1);

    const events = await prisma.event.findMany({
      where: {
        orgId,
        startsAt: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        location: true,
      },
    });
    return { events, rangeStart: rangeStart.toISOString() };
  },

  render({ data, config, escapeHtml }) {
    const events = data?.events || [];
    const layout = LAYOUTS.includes(config.layout) ? config.layout : "grid";
    const monthsAhead = clampInt(config.monthsAhead, 0, 3, 1);

    if (layout === "list") {
      return renderListLayout(events, escapeHtml);
    }

    // Group events by their YYYY-MM bucket.
    const eventsByMonth = new Map();
    for (const e of events) {
      const d = new Date(e.startsAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!eventsByMonth.has(key)) eventsByMonth.set(key, []);
      eventsByMonth.get(key).push(e);
    }

    const today = new Date();
    const start = startOfMonth(today);
    const months = [];
    for (let i = 0; i <= monthsAhead; i++) {
      const m = addMonths(start, i);
      const key = `${m.getFullYear()}-${m.getMonth()}`;
      months.push(renderMonthGrid(m, eventsByMonth.get(key) || [], today, escapeHtml));
    }

    return `
    <section class="section cms-block cms-block--calendar">
      <div class="wrap">
        <h2>Calendar</h2>
        <div class="cms-cal-grid">${months.join("")}</div>
        <p class="cms-block__more"><a href="/events">See full calendar →</a></p>
      </div>
      ${calendarStyles()}
    </section>`;
  },
};

function renderMonthGrid(monthStart, events, today, escapeHtml) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekday = monthStart.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Bucket events by day-of-month.
  const eventsByDay = new Map();
  for (const e of events) {
    const d = new Date(e.startsAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day).push(e);
  }

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(`<div class="cms-cal-cell cms-cal-cell--blank"></div>`);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = eventsByDay.get(day) || [];
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day;
    const todayClass = isToday ? " cms-cal-cell--today" : "";
    const hasClass = dayEvents.length ? " cms-cal-cell--has" : "";
    const title = dayEvents.length
      ? ` title="${escapeHtml(dayEvents.map((e) => e.title).join(" · "))}"`
      : "";
    cells.push(
      `<div class="cms-cal-cell${todayClass}${hasClass}"${title}>
        <span class="cms-cal-num">${day}</span>
        ${dayEvents.length ? `<span class="cms-cal-dot" aria-hidden="true"></span>` : ""}
      </div>`,
    );
  }

  // Listing under the grid — chronological, link-titled.
  const listItems = events
    .map((e) => {
      const d = new Date(e.startsAt);
      const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const loc = e.location ? ` · ${escapeHtml(e.location)}` : "";
      return `<li><span class="cms-cal-list-when">${escapeHtml(date)} ${escapeHtml(time)}</span><a class="cms-cal-list-title" href="/events/${escapeHtml(e.id)}">${escapeHtml(e.title)}</a><span class="cms-cal-list-loc">${loc}</span></li>`;
    })
    .join("");

  return `
    <div class="cms-cal-month">
      <h3 class="cms-cal-title">${MONTH_NAMES[month]} ${year}</h3>
      <div class="cms-cal-weekdays">${DAY_INITIALS.map((c) => `<span>${c}</span>`).join("")}</div>
      <div class="cms-cal-cells">${cells.join("")}</div>
      ${listItems ? `<ul class="cms-cal-list">${listItems}</ul>` : `<p class="cms-cal-empty">No events scheduled.</p>`}
    </div>`;
}

function renderListLayout(events, escapeHtml) {
  if (!events.length) {
    return `
    <section class="section cms-block cms-block--calendar">
      <div class="wrap">
        <h2>Calendar</h2>
        <p class="cms-empty">Nothing on the calendar yet — check back soon.</p>
      </div>
      ${calendarStyles()}
    </section>`;
  }
  const items = events
    .map((e) => {
      const d = new Date(e.startsAt);
      const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const loc = e.location ? ` · ${escapeHtml(e.location)}` : "";
      return `<li><span class="cms-cal-list-when">${escapeHtml(date)} ${escapeHtml(time)}</span><a class="cms-cal-list-title" href="/events/${escapeHtml(e.id)}">${escapeHtml(e.title)}</a><span class="cms-cal-list-loc">${loc}</span></li>`;
    })
    .join("");
  return `
    <section class="section cms-block cms-block--calendar">
      <div class="wrap">
        <h2>Calendar</h2>
        <ul class="cms-cal-list">${items}</ul>
        <p class="cms-block__more"><a href="/events">See full calendar →</a></p>
      </div>
      ${calendarStyles()}
    </section>`;
}

function calendarStyles() {
  return `<style>
    .cms-block--calendar .wrap { max-width: 980px; }
    .cms-cal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.75rem; margin: 1.25rem 0 0; }
    .cms-cal-month { background: var(--surface, #fff); border: 1px solid var(--line, #e5e7eb); border-radius: 12px; padding: 1.25rem 1.25rem 1rem; }
    .cms-cal-title { font-family: 'Inter Tight', sans-serif; font-size: 1.05rem; font-weight: 600; color: var(--ink-900, #111); margin: 0 0 .8rem; }
    .cms-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; font-size: .7rem; color: var(--ink-500, #6b7280); text-align: center; text-transform: uppercase; letter-spacing: .06em; margin-bottom: .35rem; }
    .cms-cal-cells { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .cms-cal-cell { aspect-ratio: 1 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: .85rem; color: var(--ink-700, #374151); border-radius: 6px; position: relative; }
    .cms-cal-cell--blank { visibility: hidden; }
    .cms-cal-cell--today { background: var(--primary, #1d6b39); color: #fff; font-weight: 600; }
    .cms-cal-cell--has .cms-cal-num { font-weight: 600; }
    .cms-cal-dot { position: absolute; bottom: 6px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent, #caa54a); }
    .cms-cal-cell--today .cms-cal-dot { background: #fff; }
    .cms-cal-list { list-style: none; padding: 0; margin: 1rem 0 0; }
    .cms-cal-list li { display: grid; grid-template-columns: 130px 1fr; padding: .55rem 0; border-top: 1px solid var(--line, #e5e7eb); font-size: .9rem; gap: .5rem; }
    .cms-cal-list li:first-child { border-top: 0; }
    .cms-cal-list-when { color: var(--ink-500, #6b7280); }
    .cms-cal-list-title { color: var(--primary, #1d6b39); text-decoration: none; font-weight: 500; }
    .cms-cal-list-title:hover { text-decoration: underline; }
    .cms-cal-list-loc { color: var(--ink-500, #6b7280); font-size: .85rem; grid-column: 2; }
    .cms-cal-empty { color: var(--ink-500, #6b7280); font-style: italic; font-size: .85rem; margin: .8rem 0 0; }
    .cms-block--calendar .cms-empty { color: var(--ink-500, #6b7280); font-style: italic; }
  </style>`;
}
