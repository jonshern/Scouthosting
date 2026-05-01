#!/usr/bin/env node
// Sweep every org and fire YPT-expiration reminders for any leader
// inside a 60 / 30 / 7 day window. Idempotent — re-running the same
// day is a no-op via AuditLog dedupe.
//
// Run from cron once a day:
//   0 14 * * *  /usr/bin/node /app/scripts/run-ypt-reminders.js
//
// Or hit /__super (super-admin) → "Run reminders now" (queued as a
// future button on the super-admin dashboard).

import { prisma } from "../lib/db.js";
import { runYptReminderSweep } from "../lib/yptReminder.js";
import { logger } from "../lib/log.js";

const log = logger.child("ypt-cron");

async function main() {
  const orgs = await prisma.org.findMany({
    where: { suspendedAt: null },
    select: { id: true, slug: true, displayName: true },
  });
  log.info("starting sweep", { orgs: orgs.length });

  let totalReminded = 0;
  let totalErrors = 0;
  for (const org of orgs) {
    try {
      const result = await runYptReminderSweep({ prisma, org });
      totalReminded += result.reminded;
      totalErrors += result.errors.length;
      if (result.reminded > 0) {
        log.info("reminded leaders", {
          orgSlug: org.slug,
          reminded: result.reminded,
          errors: result.errors.length,
        });
      }
    } catch (err) {
      log.error("sweep failed", { orgSlug: org.slug, err });
    }
  }
  log.info("done", { reminded: totalReminded, errors: totalErrors });
}

main()
  .catch((err) => {
    log.error("uncaught", { err });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
