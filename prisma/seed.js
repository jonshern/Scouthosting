// Seed the demo org. Idempotent — re-running is safe.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO = {
  slug: "troop100",
  unitType: "Troop",
  unitNumber: "100",
  displayName: "Sample Troop 100",
  tagline: "A demo unit for showing what Scouthosting can do.",
  charterOrg: "Example Charter Organization",
  city: "Anytown",
  state: "USA",
  council: "Sample Council",
  district: "District 1",
  founded: "2010",
  meetingDay: "Mondays",
  meetingTime: "7:00 PM",
  meetingLocation: "Example Charter Organization, Anytown USA",
  scoutmasterName: "Sample Scoutmaster",
  scoutmasterEmail: "scoutmaster@example.invalid",
  committeeChairEmail: "committee@example.invalid",
  primaryColor: "#1d6b39",
  accentColor: "#caa54a",
  plan: "patrol",
  isDemo: true,
};

async function main() {
  const org = await prisma.org.upsert({
    where: { slug: DEMO.slug },
    update: DEMO,
    create: DEMO,
  });
  console.log(`✓ Seeded demo org: ${org.displayName} (${org.slug})`);

  // Sample announcement, idempotent on title
  const annTitle = "Welcome to our new website!";
  const existingAnn = await prisma.announcement.findFirst({
    where: { orgId: org.id, title: annTitle },
  });
  if (!existingAnn) {
    await prisma.announcement.create({
      data: {
        orgId: org.id,
        title: annTitle,
        body:
          "We've moved to Scouthosting — same troop, faster site, easier to update.\n\n" +
          "Leaders can post announcements like this from the admin dashboard.",
        pinned: true,
      },
    });
    console.log(`✓ Seeded sample announcement`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
