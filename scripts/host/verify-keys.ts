// Checks that MASTER_KEY can read a database: unwraps every org's data
// key and decrypts one roster name per org. Run by restore.sh --drill
// against the restored copy, so a drill fails when the key that would
// be used for a real restore can't read the backup.
//
//   VERIFY_DATABASE_URL=postgresql://… MASTER_KEY=… npx tsx scripts/host/verify-keys.ts

import { PrismaClient } from "@prisma/client";
import { unwrapDekWithMaster, masterKeyConfigured } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

async function main() {
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) throw new Error("VERIFY_DATABASE_URL is required");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const orgs = await prisma.org.findMany({
      where: { encryptedDek: { not: null } },
      select: { id: true, slug: true, encryptedDek: true },
    });
    if (orgs.length && !masterKeyConfigured()) {
      throw new Error(`MASTER_KEY is not set; ${orgs.length} org(s) have encrypted data`);
    }
    let failed = 0;
    for (const org of orgs) {
      try {
        const dek = unwrapDekWithMaster(org);
        const member = await prisma.member.findFirst({
          where: { orgId: org.id, encFirstName: { not: null } },
        });
        if (member) decryptMemberPii(member, dek, org.id);
        console.log(`ok   ${org.slug}${member ? "" : " (no encrypted members)"}`);
      } catch (err) {
        failed += 1;
        console.log(`FAIL ${org.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`${orgs.length - failed}/${orgs.length} org(s) readable with this MASTER_KEY`);
    if (failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
