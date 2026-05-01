# Admin guide — running your unit on Compass

For Scoutmasters, Cubmasters, Skippers, Troop Leaders, Crew Advisors,
Post Advisors, Committee Chairs, and anyone else with admin access.

## Getting in

You signed up at <https://compass.app/signup.html>. Your unit lives
at `https://<your-slug>.compass.app/` (e.g. `troop12.compass.app`).
The admin app is at `/admin` on that subdomain.

If you forgot the slug, check the welcome email or hit "Help" on the
apex.

## The admin shell

Eight sections across the top: **Overview · Messages · Calendar ·
Roster · Photos · Forms · Money · More**. Each section has its own
sub-page row of pill links — that's where the day-to-day work lives.

## Common tasks

### Send a Sunday newsletter

Messages → Newsletters → "Compose newsletter". Pick events from the
auto-fill, drop in a Markdown blurb, hit "Send". Templates pull from
the org's primary + accent color. Sends queue and dispatch in
batches; you'll see delivery + open counts under `/admin/email/sent`.

### Broadcast email or SMS

Messages → Email broadcast. Pick an audience (whole unit, just
parents, just adults, or a saved Subgroup like "Wolf Den parents"),
write a subject + body, send. SMS goes to anyone with `smsOptIn`
on; email goes to everyone unless they've unsubscribed.

### Add an event

Calendar → Events → "Add event". Title, start, optional end, optional
RRULE for recurring. Attach a permission slip + a per-attendee cost
note. Compass doesn't process payments — units collect via their
existing channels (check, Venmo, Zelle, Scoutbook payments) — but
the cost shows up on the event detail page so families know what to
bring. Members can RSVP from the public site or from email.

### Set up sign-up sheets

On the event detail page, "Add slot". Drivers, potluck dishes, gear
to bring — define the slots, set capacities, and a unique URL goes
live. Parents claim slots from a phone in seconds.

### Bulk-import the roster

Roster → Members → "Bulk import". Drop in an Excel `.xlsx` file or
a CSV. Compass tolerates messy headers ("First Name" / `first_name` /
`firstname` all map). Pack rosters: use the `den` column. Girl Scout
rosters: use the `level` column.

### Configure who can post in a chat channel

Messages → Channels → click a channel. Under "Who can post here?":

- **Everyone in the unit** — broadcast-style, anyone replies.
- **Only channel members** — default. Only the people you've added
  to the channel.
- **Only patrol/den members** — for a Wolf Den channel, only Wolf
  Den parents post (the Tiger Den parent can't accidentally chime
  in).
- **Only adult leaders** — announcement-only. Members read; only
  leaders push.

Adult leaders + admins always pass regardless of policy.

### Track who's the SPL, the Treasurer, the Den Leader

Roster → Position roster. Compass knows the typed roles per unit
type — Cubmaster + Den Leader for Packs, Scoutmaster + ASM for
Troops, Skipper + Mate for Ships, Troop Leader + Cookie Manager for
Girl Scouts. Set the position on a Member and the system grants the
matching scope (Treasurer can approve reimbursements, Cookie Manager
gets the same scope, etc.).

### Approve a reimbursement

Money → Reimbursements. Members file requests with receipts; you see
the queue with a color-coded status badge. Click a row to approve,
deny, or mark paid. Only positions with the **Treasurer** or
**Committee Chair** scope can approve writes; everyone else sees a
read-only view.

### View the analytics rollup

More → Analytics. Server-side rollup, no third-party tracker, no
IPs. Counts of page views, RSVPs, broadcasts, reimbursements, channel
suspensions over the last 30 / 90 days.

## When things go wrong

### "Channel suspended"

Compass enforces YPT two-deep in the schema. If a channel with a
youth member drops below two YPT-current adult leaders, it auto-
suspends. The fix: **More → YPT status**, find the leader whose
training expired, update the date. The channel auto-recovers within
a minute.

### "Bounce on this email"

Resend reports bounces and complaints back to us; we flip
`Member.bouncedAt` so future broadcasts skip the address. The member
edit page shows a "bounce" badge with a "Clear" button — use it
after the family fixes the address.

### Need help

`/help` on your unit's site or on the apex. Files a SupportTicket
that lands on a Compass operator's queue. Reply within one business
day. For urgent youth-safety issues, contact your council directly —
we're software, not the BSA.

## Power-user tips

- **Subgroups** are saved audience filters. Make a "Drivers" subgroup
  filtering on `skills:["driver"]` and you can broadcast to drivers
  only.
- **Custom pages** are CMS pages on your public site (under "Forms"
  in the admin shell). Drop in a Markdown block for parent
  handbooks, gear lists, calendar exports.
- **iCal subscribe** — every org has `/calendar.ics` on the public
  site. Members subscribe once and get every event in their phone
  calendar. The URL never changes.
- **Mobile app** — install Compass from iOS / Android app store, log
  in once, and chat + RSVPs travel with you. Same as the web.

## What we don't do

- **Advancement** — that's Scoutbook's job. Each Scout profile
  deep-links to their Scoutbook record so you don't double-enter.
- **Public youth content** — parents control what's published. Set
  per-scout privacy on the photo gallery if a family wants their
  child's face blurred or kept private.
- **Replace your council registration** — units register through
  their council; Compass doesn't try.
