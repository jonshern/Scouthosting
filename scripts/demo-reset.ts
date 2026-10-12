// Reset the demo database from a checkout: wipe it and seed the sample
// troop (src/lib/demo). `make demo-reset` runs this. Needs DEMO_MODE=1
// and refuses a database that holds any real unit.
//
//   DEMO_MODE=1 DATABASE_URL=… node_modules/.bin/tsx scripts/demo-reset.ts

import { resetDemo } from "@/lib/demo/reset";
import { prisma } from "@/lib/db";

resetDemo({ reason: "cli" })
  .then((summary) => {
    console.log("demo reset:", summary);
    return prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
