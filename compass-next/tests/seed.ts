import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const ARGON_PARAMS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

const ADMIN_EMAIL = "scoutmaster@example.invalid";
const ADMIN_PASSWORD = "AdminPasswordTest123!";

async function main() {
  const passwordHash = await hash(ADMIN_PASSWORD, ARGON_PARAMS);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, displayName: "Sample Scoutmaster", emailVerified: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: "Sample Scoutmaster",
      emailVerified: true,
    },
  });

  const org = await prisma.org.upsert({
    where: { slug: "troop100" },
    update: {},
    create: {
      slug: "troop100",
      unitType: "Troop",
      unitNumber: "100",
      displayName: "Sample Troop 100",
      tagline: "Adventure since forever",
      charterOrg: "Example Charter Organization",
      city: "Anytown",
      state: "MN",
      council: "Sample Council",
      district: "District 1",
      meetingDay: "Mondays",
      meetingTime: "7:00 PM",
      scoutmasterName: "Sample Scoutmaster",
      scoutmasterEmail: ADMIN_EMAIL,
      ownerId: user.id,
      plan: "patrol",
      isDemo: true,
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: "admin" },
    create: { userId: user.id, orgId: org.id, role: "admin" },
  });

  // A handful of Members so the group-email audience builder has rows.
  // Mix of email-eligible adults, youth, an opt-out, and a bounce.
  const memberSeeds = [
    { firstName: "Avery", lastName: "Adult", email: "avery@example.invalid", isYouth: false, position: "Scoutmaster", patrol: null },
    { firstName: "Briar", lastName: "Adult", email: "briar@example.invalid", isYouth: false, position: null, patrol: null },
    { firstName: "Casey", lastName: "Youth", email: "casey@example.invalid", isYouth: true, position: null, patrol: "Eagles" },
    { firstName: "Dale",  lastName: "Youth", email: "dale@example.invalid",  isYouth: true, position: null, patrol: "Eagles" },
    { firstName: "Eden",  lastName: "Optout", email: "eden@example.invalid", isYouth: false, position: null, patrol: null,
      emailUnsubscribed: true, unsubscribedAt: new Date() },
  ];
  for (const m of memberSeeds) {
    const existing = await prisma.member.findFirst({
      where: { orgId: org.id, email: m.email },
      select: { id: true },
    });
    const data = {
      orgId: org.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      isYouth: m.isYouth,
      position: m.position,
      patrol: m.patrol,
      emailUnsubscribed: m.emailUnsubscribed ?? false,
      unsubscribedAt: m.unsubscribedAt ?? null,
      // Reset lifecycle on re-seed so test-run mutations don't leak.
      deletedAt: null,
      status: "active",
    };
    if (existing) {
      await prisma.member.update({ where: { id: existing.id }, data });
    } else {
      await prisma.member.create({ data });
    }
  }

  // eslint-disable-next-line no-console
  console.log("Seeded:", { user: user.email, org: org.slug, members: memberSeeds.length });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
