# Compass Backlog

Run-time cleanup items flagged during testing. Each item links the
surfaces involved and notes the rough scope. Tackle in batches; not
every item gets its own PR.

> Distinct from `ROADMAP.md`, which is feature planning. This is "stuff
> we built, but on reflection don't want."

---

## Scoutbook owns this — remove from Compass

The principle: anything BSA's Scoutbook is the system of record for,
Compass should not duplicate. Dropping these reduces the surface area
volunteers have to reason about and stops us from quietly going
out-of-sync with Scoutbook.

### YPT enforcement in chat

- `lib/chat.js` — auto-suspends a channel that has youth + fewer than 2
  YPT-current adults; posts a "🔒 paused while we re-establish two-deep
  leadership" message.
- `server/admin.js` — admin channel page shows YPT compliance state +
  unsuspend button.
- `server/render.js` — public channel view renders "Channel is paused
  (YPT compliance)".
- `lib/featureFlags.js` — `chat.youthMessaging` flag description still
  says "still YPT-enforced".
- `lib/yptReminder.js` — whole file is a YPT reminder pipeline (cron +
  emails). Delete with this batch.

Two-deep (≥2 adults) can still be enforced; the *YPT-current* gate is
what goes away.

### Training tab in admin roster

- Nav item: Roster → Training (`/admin/training`).
- `server/admin.js` — route handler that lists adults + their training
  courses + expiration tags.
- `server/admin.js` — member edit form has a "Trainings — must currently
  hold" field.
- Schema: `Training` model + `Member.trainings` array. Drop in a
  migration.

### Credits (camping nights / service hours / hiking miles)

- Nav item: Calendar → Credits (`/admin/credits`) + the
  `/admin/credits.csv` export aimed at the advancement chair.
- Schema: `Event.serviceHours`, `Event.campingNights`,
  `Event.hikingMiles` fields and the per-RSVP rollup logic.
- The event create/edit form fields where these get entered.
- Drop the rollup query in `server/admin.js#7049`.
- Note: don't touch the unrelated `Refund` model — that's an operator-
  issued billing credit against a unit's hosting bill, different concept.

### Schema cleanup (after the above ship)

- `OrgMembership.yptCurrentUntil` column.
- "YPT status visible" card on `security.html` and
  `design/source/security.jsx`.
- Admin roster's YPT badge column (if present).

---

## UI / IA

### Treasurer dashboard card

- `lib/dashboard.js` — `treasurer` stat (`$0 / nothing pending`) +
  supporting `pendingReimbursements` queries.
- `server/admin.js` — `dashboardStatCard("Treasurer", …)` line and the
  `dashboardSummaryLine` reference.
- Underlying Money nav (Treasurer report + Reimbursements pages) — keep
  for now unless we decide Compass shouldn't track money at all post
  payments-scope-drop.

### Homepage editor should be top-level nav

- `/admin/content` (labeled "Page content") is buried inside the **Forms**
  nav alongside "Custom pages". Move both into a new top-level **Website**
  section. Probably rename "Page content" → "Homepage".

### Button alignment audit

- Vague: "buttons on a lot of pages aren't aligned with stuff." Need
  examples. Likely a shared style (button vertical alignment in flex
  rows, or padding mismatch with adjacent inputs).

### Calendar — proper, pretty, multi-view calendar

- `/admin/events` and the public `/events` page are flat lists today
  (upcoming first, then 20 past). The expected mental model is a real
  calendar — Outlook / Google Calendar / TeamSnap level of polish.
- Required views:
  - **Month grid** — default, with event chips coloured by category
  - **Week** — hour-by-hour columns
  - **Day** — single-day detail
  - **Agenda / list** — keep the current view; useful for print + narrow
    mobile
  - View toggle in the toolbar
- Click / hover on an event chip shows a popover with title, time,
  location, **RSVP tally (Going/Maybe/Can't)**, drivers needed, paid
  count — same content as `/admin/events/:id/rsvps` summarised, with
  "Open" button to the full detail page.
- Visual polish: real grid lines, weekday headers, today highlighted,
  multi-day events spanning cells, all-day vs. timed events styled
  differently, recurrence indicator on event chips.
- Underlying data already supports it (events have startsAt + endsAt +
  recurrence, ICS export works). The work is mostly UI: a grid
  renderer + view-toggle + popover.
- Likely worth pulling in a vetted library (FullCalendar, or a small
  hand-rolled grid if we want to keep zero-dep). Decide before
  starting.

---

## Newsletters vs. announcements

Today:

| Surface | Today | Vision |
|---|---|---|
| Announcement | Manually-written banner/notice on public site | Same — keep |
| Post | Manually-written activity-feed entry with photos + comments | Same — keep |
| Newsletter | Manually-composed email digest (admin picks Posts + Events, hits send) | **Automated weekly/monthly digest** of upcoming events + recent posts, with optional admin preview/tweak |

Not yet decided: keep manual Newsletter alongside an automated digest
(option 1), or replace Newsletter entirely with the auto-digest
(option 2). Re-discuss when we tackle it.

---

## Bug fixes (small, can ship anytime)

### Member form crashes on "add new member"

- `server/admin.js#memberForm` accessed `member.bouncedAt` unguarded.
  `member` is null on the create path. Already null-guarded in dev (not
  yet committed at the time of writing) — fold into the next batch.

---

## Broader posture

The security page already had an honesty pass (PR #51) and payment
processing was dropped (PR #50). The cleanups above are the next layer
of "Compass should be smaller than we initially built." Pattern to
keep in mind when reviewing other surfaces: *if BSA Scoutbook owns it,
or it's a process/integration we haven't built (PCI/SOC 2/etc.), strip
the marketing claim and the feature surface together.*
