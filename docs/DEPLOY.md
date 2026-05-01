# Deployment

Compass is designed to run anywhere a Node 20+ container does. We ship
a `Dockerfile` for self-hosted deploys and a `docker-compose.prod.yml`
for single-host stacks (Postgres + app + nginx). Multi-instance setups
(Fly.io, ECS, GCP Cloud Run, K8s) reuse the same Dockerfile.

## Required environment variables

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pw@host:5432/compass?schema=public` |
| `SESSION_SECRET` | yes | 32+ random bytes; rotate quarterly |
| `APEX_DOMAIN` | yes | e.g. `compass.app` (no scheme, no slash) |
| `COOKIE_DOMAIN` | yes (prod) | `.compass.app` so sessions span subdomains |
| `RESEND_API_KEY` | for email | Or set `MAIL_DRIVER=smtp` + `SMTP_*` vars |
| `RESEND_WEBHOOK_SECRET` | for email | Verifies bounce/complaint webhooks |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` | for SMS | Falls back to a logging driver if missing |
| `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` + `GOOGLE_OAUTH_REDIRECT_URI` | for SSO | Login still works without these |
| `STORAGE_DIR` | optional | Default `/app/var/uploads`. Mount a persistent volume. |
| `LOG_LEVEL` | optional | `debug` / `info` / `warn` / `error`. Default `info` in prod. |
| `NODE_ENV` | optional | Set to `production` for JSON logs + cookie security. |

## Docker (single host)

```bash
cp .env.example .env.prod
# fill in the secrets above, then:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

The stack is:

- **postgres** — Postgres 16, `compass-pgdata` volume.
- **app** — Compass on `:8080`. Runs `prisma migrate deploy` on boot.
- **nginx** — TLS termination + reverse proxy. Mounts your wildcard
  cert at `infra/certs/{fullchain,privkey}.pem`.

Bring it up, then check:

```bash
curl -fsS https://compass.app/healthz   # ok
curl -fsS https://compass.app/readyz    # ready (DB reachable)
```

## Cloud Run

The Dockerfile already targets `:8080` (Cloud Run convention). Build,
push, and deploy:

```bash
gcloud builds submit --tag gcr.io/PROJECT/compass
gcloud run deploy compass \
  --image gcr.io/PROJECT/compass \
  --region us-central1 \
  --platform managed \
  --set-env-vars NODE_ENV=production,APEX_DOMAIN=compass.app,COOKIE_DOMAIN=.compass.app \
  --set-secrets DATABASE_URL=db-url:latest,SESSION_SECRET=session-secret:latest \
  --min-instances 1 --max-instances 10
```

Map a custom domain (`compass.app` + `*.compass.app`) per Cloud Run's
"Manage Custom Domains" UI. Add a wildcard SSL cert through Google
Cloud Load Balancing (Cloud Run alone doesn't terminate wildcard).

## Fly.io

```bash
fly launch --no-deploy --copy-config --name compass
# tweak fly.toml: internal_port=8080, http_service.processes=["app"]
fly secrets set DATABASE_URL=... SESSION_SECRET=$(openssl rand -base64 32)
fly volumes create compass_uploads --size 10
fly deploy
```

The `compass_uploads` volume mounts at `/app/var/uploads`.

## Migrations

`docker-compose.prod.yml` runs `prisma migrate deploy` on every boot —
this is idempotent. For multi-instance deploys, run migrations once
out-of-band before rolling pods:

```bash
docker run --rm --env-file .env.prod compass:latest \
  npx prisma migrate deploy
```

## Logging

The app emits one JSON line per response in production
(`NODE_ENV=production`). Recommended sink: stdout → your container
runtime → log aggregator (Loki, Datadog, CloudWatch, etc.). The line
shape is:

```json
{
  "ts": "2026-05-01T03:00:01.234Z",
  "level": "info",
  "ns": "http",
  "msg": "request",
  "method": "GET",
  "path": "/admin",
  "status": 200,
  "ms": 42,
  "requestId": "abc12_4",
  "orgSlug": "troop12"
}
```

`requestId` and `orgSlug` thread through every line emitted in the same
request — filter on these in your aggregator to follow one request.

## Health probes

- `GET /healthz` — liveness. Cheap, no DB. Use for orchestrator restart
  decisions only.
- `GET /readyz` — readiness. Hits Postgres with `SELECT 1`. Returns 503
  on DB failure. Use for deploy gates and traffic-shedding.

## Backups

Postgres is the only stateful store besides `/app/var/uploads`. Two
volumes to back up:

```bash
# DB dump
docker exec compass-postgres pg_dump -U compass -d compass | gzip > compass-$(date +%F).sql.gz

# Uploads (photos, receipts, newsletters)
tar czf compass-uploads-$(date +%F).tgz /var/lib/docker/volumes/compass-uploads/_data
```

Restore by reversing — `psql` for the dump, `tar xzf` for the volume.

## Rotating SESSION_SECRET

Lucia signs session cookies with `SESSION_SECRET`. Rotating it
invalidates every active session — users have to log in again. Plan
for it during low-traffic windows; communicate in advance via the
admin's broadcast tool.

```bash
fly secrets set SESSION_SECRET=$(openssl rand -base64 32)
```
