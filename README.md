# Scouthosting

A modern, multi-tenant website platform for Scouts BSA troops, Cub Scout
packs, and Venturing crews — built as a direct alternative to TroopWebHost.

> Status: **Phase 2 done.** Marketing site + signup + multi-tenant routing +
> Postgres / Prisma + Lucia auth are wired together. Per-feature backends
> (calendar, members, advancement, photos, email, money) are tracked in
> [`ROADMAP.md`](ROADMAP.md). Deferred security work is captured under the
> `[security]` tag in the same file.

---

## Stack

- **Frontend:** vanilla HTML / CSS / JS (no framework, no build step)
- **Backend:** Node 20 + Express 4 (ES modules)
- **Database:** Postgres 16 + Prisma 5
- **Auth:** Lucia 3 + argon2id
- **Local infra:** docker-compose
- **Templating:** plain `{{TOKEN}}` substitution with raw-HTML opt-in

---

## Layout

```
.
├── index.html / signup.html / login.html / styles.css / script.js
│       Marketing site (apex / www)
├── demo/
│       Sample tenant site — fictional "Sample Troop 100"
├── server/
│   ├── index.js          App entry; routes by Host header → org (Prisma lookup)
│   ├── provision.js      Validates, derives slug, creates Org row
│   ├── render.js         Injects org data into the site template
│   └── template/site.html  Templated tenant site with {{placeholders}}
├── lib/
│   ├── db.js             Prisma client singleton
│   └── auth.js           Lucia setup, argon2id helpers, attachSession middleware
├── prisma/
│   ├── schema.prisma     Org, User, Session, OrgMembership, Member, Event, ...
│   └── seed.js           Idempotent demo-org seed
├── docker-compose.yml    Postgres 16 for local dev
├── .env.example
├── ROADMAP.md            Phased plan + [security] backlog
└── README.md
```

---

## Architecture

### Multi-tenancy

Every unit gets its own subdomain: `troop100.scouthosting.com`,
`pack577.scouthosting.com`, etc. Express resolves the request's `Host`
header to an `Org` row in Postgres on every request:

- **Apex / `www` / unrecognized custom domain** → marketing site
- **`<slug>.scouthosting.com`** or **matched `customDomain`** → templated org
  site
- **Unknown subdomain** → friendly 404 with a "start a site" CTA

Tenant isolation is **a single `orgId` column on every org-scoped table**
(shared schema, app-layer enforcement). Stronger isolation (RLS, per-tenant
encryption) is queued as `[security]` items in `ROADMAP.md` — we'll graduate
into them before any paid customer onboards real member data.

### Provisioning

Two paths, both backed by the same `provisionOrg()` in `server/provision.js`:

1. **HTTP** — `POST /api/provision` with a JSON body. Used by the signup form.
2. **CLI** — `node server/provision.js path/to/config.json`. Used for bulk
   provisioning, e.g. council-wide rollouts.

Both validate input, derive a slug from `unitType + unitNumber`, refuse
reserved or already-claimed slugs, and create the `Org` row in Postgres.

### Auth

Lucia + Prisma adapter. Sessions live in `public.Session`; cookies are
HTTP-only and `SameSite=Lax`. A user is global (`User`); roles attach via
`OrgMembership`, so a parent with kids in two units gets one login that
works for both sites. Routes:

- `POST /api/auth/signup` — create user, set session cookie
- `POST /api/auth/login` — verify password, set session cookie
- `POST /api/auth/logout` — invalidate session, clear cookie
- `GET  /api/auth/me`     — returns the signed-in user

CSRF protection on state-changing routes is queued as `[security]`.

### Rendering

`server/render.js` reads `server/template/site.html`, replaces every
`{{TOKEN}}` with the org's value, HTML-escaping by default and allowing
`raw(html)` for trusted server-built fragments. This is the seam where
dynamic content (events, members, photos) plugs in once those features land.

---

## Run it locally

Requires Node 20+ and Docker.

```bash
cp .env.example .env

npm install
npm run db:up          # start Postgres in Docker
npm run db:migrate     # creates tables + applies migrations
npm run db:seed        # seeds the demo org (Sample Troop 100)
npm run dev            # starts the server with --watch
```

- Marketing: <http://localhost:3000/>
- Demo org:  <http://troop100.localhost:3000/>

For the demo subdomain to resolve, most browsers handle `*.localhost`
automatically. If yours doesn't, add this to `/etc/hosts`:

```
127.0.0.1  troop100.localhost
```

### Provision a new org

Via the signup form: <http://localhost:3000/signup.html>.

Via CLI:

```bash
cat > /tmp/troop42.json <<'JSON'
{
  "unitType": "Troop",
  "unitNumber": "42",
  "charterOrg": "First Lutheran Church",
  "city": "Anytown",
  "state": "MN",
  "council": "Sample Council",
  "district": "District 1",
  "founded": "1985",
  "meetingDay": "Tuesdays",
  "meetingTime": "7:00 PM",
  "scoutmasterName": "Pat Adams",
  "scoutmasterEmail": "pat@example.invalid",
  "plan": "troop"
}
JSON
node server/provision.js /tmp/troop42.json
```

Then visit <http://troop42.localhost:3000/>.

### Useful npm scripts

```
npm run dev          # watch + restart
npm run db:up        # start Postgres
npm run db:down      # stop Postgres
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy (prod)
npm run db:generate  # regenerate the Prisma client
npm run db:seed      # seed the demo org
npm run db:reset     # drop + re-create + re-seed
```

---

## Important notes

- **The demo org is fictional.** "Sample Troop 100" / "Example Charter
  Organization" / "Anytown, USA" are placeholders.
- **Not affiliated with Scouting America.** Scouthosting is independent.
- **Secrets** — `.env` is git-ignored. Production secrets are managed by the
  deployment environment.

---

## What's next

See `ROADMAP.md`. The short version:

1. Calendar with Google Calendar add-button + per-event Maps directions
2. Trip & meal planner (headcount → recipe scaling → auto shopping list)
3. Member directory + advancement tracking + Scoutbook sync
4. Photos / forms / money
5. Walk through the `[security]` backlog before the first paid customer
