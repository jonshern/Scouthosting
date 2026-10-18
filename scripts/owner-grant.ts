// Make an existing account a platform owner, so it can open the owner
// console at /super-admin (or take that away). The console never grants
// this itself; it's a command on the server on purpose.
//
//   npm run owner:grant -- jon@example.com
//   npm run owner:grant -- jon@example.com --revoke

import { prisma } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  if (!email) throw new Error("usage: npm run owner:grant -- <email> [--revoke]");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}. Sign up first, then run this again.`);
  await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: !revoke } });
  await prisma.auditLog.create({
    data: {
      userDisplay: "owner:grant (command line)",
      entityType: "User",
      entityId: user.id,
      action: revoke ? "user.owner_revoke" : "user.owner_grant",
      summary: email,
    },
  });
  console.log(revoke ? `${email} is no longer an owner.` : `${email} can open /super-admin now.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
