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

  // Sample upcoming events, idempotent by (orgId, title, startsAt).
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const sampleEvents = [
    {
      title: "PLC Meeting",
      description: "Patrol Leaders' Council. Patrol leaders, the SPL/ASPLs, and the Scoutmaster.",
      startsAt: new Date(now + 4 * day),
      endsAt: new Date(now + 4 * day + 60 * 60 * 1000),
      location: "Example Charter Organization",
      locationAddress: "100 Sample Way, Anytown USA",
      category: "PLC",
    },
    {
      title: "May Court of Honor",
      description: "Family ceremony recognizing recent ranks and merit badges. Light refreshments after.",
      startsAt: new Date(now + 11 * day),
      endsAt: new Date(now + 11 * day + 90 * 60 * 1000),
      location: "Example Charter Organization",
      locationAddress: "100 Sample Way, Anytown USA",
      category: "Court of Honor",
    },
    {
      title: "Spring Camporee",
      description: "Weekend campout with cooking, scout skills, and a saturday-night campfire.",
      startsAt: new Date(now + 18 * day + 16 * 60 * 60 * 1000),
      endsAt: new Date(now + 20 * day + 12 * 60 * 60 * 1000),
      location: "Sample Scout Reservation",
      locationAddress: "1 Camporee Rd, Anytown USA",
      cost: 35,
      capacity: 40,
      signupRequired: true,
      category: "Campout",
    },
  ];
  for (const e of sampleEvents) {
    const exists = await prisma.event.findFirst({
      where: { orgId: org.id, title: e.title, startsAt: e.startsAt },
    });
    if (!exists) await prisma.event.create({ data: { orgId: org.id, ...e } });
  }
  console.log(`✓ Seeded sample events`);

  // Sample members (idempotent on (orgId, firstName, lastName))
  const sampleMembers = [
    { firstName: "Alex", lastName: "Park", email: "alex@example.invalid", patrol: "Eagles", position: "SPL", isYouth: true, commPreference: "both", smsOptIn: true },
    { firstName: "Sam", lastName: "Lee", email: "sam@example.invalid", patrol: "Eagles", isYouth: true, commPreference: "email" },
    { firstName: "Jordan", lastName: "Diaz", email: "jordan@example.invalid", patrol: "Foxes", position: "Patrol Leader", isYouth: true, commPreference: "email" },
    { firstName: "Pat", lastName: "Adams", email: "pat@example.invalid", phone: "555-0142", position: "Scoutmaster", isYouth: false, commPreference: "both", smsOptIn: true },
    { firstName: "Riley", lastName: "Khan", email: "riley@example.invalid", position: "Committee Chair", isYouth: false, commPreference: "email" },
  ];
  for (const m of sampleMembers) {
    const exists = await prisma.member.findFirst({
      where: { orgId: org.id, firstName: m.firstName, lastName: m.lastName },
    });
    if (!exists) await prisma.member.create({ data: { orgId: org.id, ...m } });
  }
  console.log(`✓ Seeded sample members`);

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
