# Scouthosting

A modern, multi-tenant website platform for Scouts BSA troops, Cub Scout
packs, and Venturing crews — built as a direct alternative to TroopWebHost.

> Status: **Phase 1 scaffold.** The marketing site, signup flow, demo site,
> templated tenant rendering, and provisioning pipeline are working. Auth,
> database, and the per-feature backends (calendar, members, advancement,
> photos, email, money) are tracked in [`ROADMAP.md`](ROADMAP.md).

---

## What's here

```
.
├── index.html            Marketing landing page (scouthosting.com)
├── signup.html           Signup form — POSTs to /api/provision
├── login.html            Login router (forwards to <slug>.scouthosting.com/login)
├── styles.css            Marketing + form styles
├── script.js             Marketing nav + signup form handler
├── demo/                 Sample tenant site (fictional "Sample Troop 100")
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── server/               Multi-tenant Express server
│   ├── index.js          App entry; routes by Host header → tenant
│   ├── provision.js      Validates input, derives slug, persists tenant
│   ├── render.js         Injects tenant data into the site template
│   ├── tenants.json      JSON tenant store (Phase 1; Postgres in Phase 3)
│   └── template/
│       └── site.html     Templated tenant site with {{placeholders}}
├── package.json
├── ROADMAP.md            Phased plan to feature parity with TroopWebHost
└── README.md             This file
```

---

## Architecture

### Multi-tenancy

Every unit gets its own subdomain: `troop100.scouthosting.com`,
`pack577.scouthosting.com`, etc. The Express server inspects each request's
`Host` header and resolves it to a tenant from `server/tenants.json`.

- **Apex / `www`** → marketing site (this repo's static files)
- **`<slug>.scouthosting.com`** → templated tenant site, rendered per-request
- **Unknown subdomain** → friendly 404 with a "start a site" CTA

The `tenants.json` store is a stand-in. Phase 3 swaps it for Postgres with
schema-per-tenant isolation for primary tables and a shared `tenants` /
`users` table for routing and auth.

### Provisioning

Two paths, both backed by the same `provisionTenant()` function in
`server/provision.js`:

1. **HTTP** — `POST /api/provision` with a JSON body. Used by the signup form.
2. **CLI** — `node server/provision.js path/to/config.json`. Used for bulk
   provisioning, e.g. council-wide rollouts.

Both validate input, derive a slug from `unitType + unitNumber`, refuse
reserved or already-claimed slugs, and write to the tenant store.

### Rendering

`server/render.js` reads `server/template/site.html`, replaces every
`{{TOKEN}}` with the tenant's value (HTML-escaped), and returns the result.
This is the seam where dynamic content (events, members, photos) plugs in
once the database lands.

---

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

- Marketing site: <http://localhost:3000/>
- Demo tenant: <http://troop100.localhost:3000/>

For the demo tenant subdomain to resolve, add a line to `/etc/hosts`:

```
127.0.0.1  troop100.localhost
```

(Most browsers resolve `*.localhost` automatically; some configurations need
the explicit hosts entry.)

### Provision a new tenant

Via the signup form (browser):

1. Visit <http://localhost:3000/signup.html>
2. Fill in the form. On success, you'll get a link to the new site.

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

---

## Important notes

- **The demo tenant is fictional.** "Sample Troop 100" / "Example Charter
  Organization" / "Anytown, USA" are placeholders. No real unit is depicted.
- **Not affiliated with Scouting America.** Scouthosting is independent.
- **No production secrets in the repo.** When auth and Stripe land, they'll
  use environment variables and never be checked in.

---

## Contributing

This is early-stage. The next milestones are tracked in
[`ROADMAP.md`](ROADMAP.md). The biggest near-term prizes:

1. **Auth** — per-tenant member accounts with role-based access.
2. **Postgres** — schema-per-tenant with a clean migration tool.
3. **Calendar** — events with Google Calendar sync, directions, and
   sign-up sheets.
4. **Trip & meal planner** — recipe scaling, dietary flags, auto shopping
   list. The single feature most likely to make a unit migrate.
