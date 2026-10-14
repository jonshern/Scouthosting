# Claude connector (MCP)

Compass has an MCP server at `/mcp`. Add it to Claude once and you can ask
"how is Emmett doing?" and get his rank, what's left for the next one,
badges earned and in progress, Eagle-required badges left, what changed
lately, sign-offs waiting and the next few events.

It runs as the adult who signed in. Claude sees the scouts that adult
can see and nothing else.

## Adding it to Claude

You need the Compass address Claude can reach, written below as
`https://<host>`.

**claude.ai (web, desktop, phone):**

1. Settings → Connectors → **Add custom connector**.
2. Name it Compass and paste `https://<host>/mcp` as the URL. Leave the
   OAuth client ID and secret empty.
3. Click Connect. Compass opens; sign in, then tap **Allow** on the
   "Connect Compass to Claude?" page.
4. In a chat, ask "how is Emmett doing?".

claude.ai connects from Anthropic's servers, so the address has to be
public HTTPS. A Compass on Jon's Mac reached over Tailscale (`tailscale
serve`) is only on the tailnet, so it won't work from claude.ai. Making it
public (Tailscale Funnel, a cloud deploy) is a separate decision.

**Claude Code:**

```bash
claude mcp add --transport http compass https://<host>/mcp
```

Then run `/mcp` in Claude Code, pick compass and sign in. Claude Code runs
on your own machine, so `http://localhost:3000/mcp` works for a local
Compass.

## Setup on the server

| Variable | What it does |
| --- | --- |
| `MCP_PUBLIC_URL` | The public origin Claude uses, e.g. `https://compass.example.com`. Tokens are bound to `<origin>/mcp`, and OAuth metadata names this origin. Defaults to `https://<APEX_HOST>`. Must be https except on localhost. |
| `CATALOG_PATH` | Path to `catalog.json` (scout-core `packages/catalog/dist/catalog.json`, or emmett-scouting `content/catalog.json`). Without it the connector still works, but can't name requirements, say what's left, or count Eagle-required badges. |

If `MCP_PUBLIC_URL` doesn't match the address Claude actually uses,
every call gets a 401 and Claude keeps asking you to reconnect.

`/mcp` and `/.well-known/` pass through on tenant hosts and skip the
pre-launch invite gate (`src/middleware.ts`).

## What Claude can do

Read (scope `scouts:read`):

| Tool | Answers |
| --- | --- |
| `list_scouts` | Which scouts can I ask about? |
| `how_is_scout_doing` | How is Emmett doing? (the short summary) |
| `get_journey` | All of it as data: rank, every requirement left, every badge |
| `recent_activity` | What changed in the last N days |
| `upcoming_events` | Events coming up, RSVPs and permission slips, badge days |
| `pending_signoffs` | Done and waiting for a counselor or leader, and who that is |
| `get_requirements` | One rank or badge's requirements, with the scout's status |

Change (scope `scouts:write`), each one previews first and saves only
when Claude calls it again with `confirm: true` after the adult says yes:

| Tool | Does |
| --- | --- |
| `mark_requirement` | Marks a requirement in progress, done (waits for a sign-off) or not started. Never signs off and never changes a signed-off requirement. |
| `rsvp_event` | The adult's own RSVP, same as in the app (`src/lib/rsvp/submit.ts`). |

Resources: `compass://catalog` (every rank and badge) and
`compass://catalog/{key}` (one item's requirements).

## Who sees which scout

`src/lib/mcp/scouts.ts`:

- **Your scouts:** a youth roster entry that lists your roster entry as a
  parent, matched by email, and only once you've confirmed your email.
  You also need to belong to that unit.
- **Scouts in units you lead:** leaders and admins see every youth in
  their unit.
- **Lantern scouts:** the scouts you added in Lantern. A Lantern scout
  linked to your troop scout is one scout here, with both records.
- **Youth accounts** get nothing.

Troop scouts go out as first name and last initial.

For a Lantern-only scout, "done" checks the step on your Lantern trail
with today's date and "not started" unchecks it. Lantern has no "in
progress".

## Sign-in and tokens

Compass is its own OAuth 2.1 server for this (`src/lib/mcp/oauth/`):

- Claude registers itself (`POST /mcp/oauth/register`, RFC 7591). Public
  clients only. Redirects must be https, http on loopback, or a
  reverse-domain app scheme.
- `GET /mcp/oauth/authorize` sends a signed-out adult to `/login`, applies
  the same adult and two-step rules as everywhere else, and shows the
  consent page. PKCE S256 is required.
- `POST /mcp/oauth/token`: codes last 5 minutes and work once. Access
  tokens last an hour. Refresh tokens last 30 days and rotate on every
  use. Reusing a code or an old refresh token revokes the whole chain.
- `POST /mcp/oauth/revoke` (RFC 7009).
- Metadata: `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource/mcp`.

Only sha256 hashes of codes and tokens are stored (`McpAuthCode`,
`McpToken`).

Rate limits: register 20/hour per IP, token and revoke 60/minute per IP,
`/mcp` 120/minute per adult.

## Runbook

**Disconnect one app:** (deleting the account also removes every connection) the adult opens `/account/api-tokens` (linked
from their profile page) and taps Disconnect under Claude connections. Changing the password disconnects every app.

**Disconnect everyone from one app** (for example, a leaked client):

```sql
UPDATE "McpToken" SET "revokedAt" = now()
WHERE "clientId" = '<client id>' AND "revokedAt" IS NULL;
```

**Claude says "No scouts are linked":** check that the adult confirmed
their email, that their roster entry has the same email, and that the
scout's roster entry lists that roster entry as a parent. Or add the
scout in Lantern.

**Claude says the catalog isn't loaded:** set `CATALOG_PATH` and restart.

**Every call is 401 right after connecting:** `MCP_PUBLIC_URL` doesn't
match the URL in Claude. Fix the variable, or remove the connector and
add it again with the matching URL.

**Logs:** look for `mcp` (`tool failed`, `requirement marked`, `rsvp via
connector`).

## Tests

- `src/lib/mcp/*.test.ts`: journey rules, scout lookup, redirect and
  scope checks, PKCE.
- `src/lib/mcp/mcp.db.test.ts`: the whole flow against Postgres.
  Another family's scout, another unit, an unconfirmed email and a youth
  account all see nothing. Also covers write confirmations, a read-only
  connection, refresh rotation and replay revocation, and disconnecting.
