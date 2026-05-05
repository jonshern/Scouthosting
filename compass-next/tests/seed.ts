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

  // eslint-disable-next-line no-console
  console.log("Seeded:", { user: user.email, org: org.slug });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
