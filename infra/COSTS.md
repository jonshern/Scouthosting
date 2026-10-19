# What this Terraform costs

Monthly list prices in `us-central1`, checked October 2026, before any credits. Two sizes: **launch** (tens of units, a few dozen families each) and **about 100 units**. Staging and prod share one database instance and one load balancer, so those are shown once as "shared".

Why Google Cloud rather than Azure or AWS, and what each would cost: `/mnt/project-files/launch/cloud-hosting-plan.md` in the project (summary at the end of this page).

## Launch: about $33 a month

| Where | Piece | Size | $/month |
|---|---|---|---|
| Shared | Cloud SQL Postgres 16 `core-pg` | `db-f1-micro` (shared core, 0.6 GB) | 7.67 |
| Shared | Database disk | 10 GB SSD, grows by itself | 1.70 |
| Shared | Cloud SQL backups and point-in-time logs | 14 daily backups, 7 days of logs | ~1.00 |
| Shared | Load balancer for the custom domain (`edge.tf`) | forwarding rules, up to five | 18.25 |
| Shared | Artifact Registry | 15 most recent images | ~0.30 |
| Shared | Backups bucket (`backups.tf`) | nightly export + uploads copy, 30 days, `us-east1` | ~0.20 |
| Shared | Logging (90 days) and alerting | | ~1.00 |
| Prod | Cloud Run `core-prod` | scales to zero; inside the free tier (2M requests, 180,000 vCPU-seconds) | 0.00 |
| Prod | Secret Manager | 18 secrets (the first 6 versions on the account are free) | ~0.90 |
| Prod | Uploads bucket, internet egress | a few GB | ~0.60 |
| Prod | Firebase Hosting: Waypoint, Lantern, landing | inside the free tier | 0.00 |
| Prod | Cloud Scheduler: hourly cron, nightly export | 3 jobs on the account are free | 0.00 |
| Staging | Cloud Run `core-staging`, its secrets, its Hosting sites | scales to zero | ~0.90 |
| | **Total** | | **~$33** |

Without a custom domain (everything on `run.app` and `web.app`) there is no load balancer: about **$15**.

## About 100 units: about $62, or $75 with prod kept warm

| Where | Piece | Size | $/month |
|---|---|---|---|
| Shared | Cloud SQL `core-pg` | `db-g1-small` (shared core, 1.7 GB) | 25.55 |
| Shared | Database disk | 20 GB SSD | 3.40 |
| Shared | Cloud SQL backups and logs | | ~2.50 |
| Shared | Load balancer, plus ~30 GB processed | | 18.50 |
| Shared | Artifact Registry, backups bucket | | ~1.80 |
| Shared | Logging and alerting | | ~2.00 |
| Prod | Cloud Run `core-prod`, scales to zero | still mostly inside the free tier | 0 to 3 |
| Prod | *or* kept warm (`min_instances = 1`) | one idle instance, 1 vCPU, 1 GiB | ~13 |
| Prod | Secrets, uploads (~30 GB), egress (~30 GB), Hosting | | ~6 |
| Staging | | | ~1 |
| | **Total** | | **~$62 cold, ~$75 warm** |

At $99 a unit a year, 100 units bring in about $825 a month, so hosting is under a tenth of it.

## Not in Terraform, not on the Google bill

| What | Cost |
|---|---|
| Email (Resend; Compass's only mail driver) | Free to 3,000 a month and 100 a day. A unit's weekly newsletter to 40 families passes that at about 15 units: then Pro, $20/month for 50,000. |
| Domain | ~$15 a year at the registrar |
| Stripe | 2.9% + 30¢ per payment |

## When to change what

| Sign | Change | Monthly effect |
|---|---|---|
| About 30 units, or the "Core database under pressure" memory alert | `db_tier = "db-g1-small"` (a restart of a minute or two; do it at night) | +$18 |
| Customers want an uptime promise | `db_tier = "db-custom-1-3840"`: a dedicated core, the first tier Google's SLA covers | +$42 over `db-g1-small` |
| Same, and a zone outage must not take it down | `availability_type = "REGIONAL"` in `main.tf` | doubles the database line |
| First request after a quiet hour feels slow, or a big event | `prod = { min_instances = 1, ... }` | +$13 while on |
| Spend crosses the budget alert | `monthly_budget_usd` in `bootstrap/` (default $50: 50%, 90% and forecast 100% emails) | none |

## What the other clouds would cost for the same thing

| | Launch | ~100 units | Why |
|---|---|---|---|
| **Google Cloud (this)** | **~$33** | **~$62 to $75** | Built: this directory |
| Azure | ~$25 to $30 | ~$45 to $60 | Container Apps scale to zero, Postgres B1ms has 2 GB; but Compass has no Azure Blob driver and Container Apps can't issue wildcard certificates |
| AWS | ~$65 to $75 | ~$110 to $120 | No scale-to-zero container host since App Runner closed to new customers (April 2026): Fargate, a load balancer and public IPv4 addresses run all month |
