// Seed the demo org. Idempotent — re-running is safe.
//
// Builds out a fully-populated tenant: page content, members with
// family linkages + dietary flags, equipment catalog, recurring +
// one-off events, a campout with a complete trip plan + sign-up slots,
// photo albums with procedurally-generated images, an activity feed
// with photo posts, comments, announcements, custom pages, and forms.
//
// Run with `npm run db:seed`. Procedural images are written to
// var/uploads/<orgId>/ when STORAGE_DRIVER=fs (the default).

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { save as saveFile } from "../lib/storage.js";
import { gradientPng } from "../lib/imageGen.js";
import { buildSeedSubgroups } from "../lib/orgRoles.js";
import { hashPassword } from "../lib/auth.js";

const prisma = new PrismaClient();

const DEMO = {
  slug: "troop100",
  unitType: "Troop",
  unitNumber: "100",
  displayName: "Sample Troop 100",
  tagline: "A demo unit for showing what Compass can do.",
  charterOrg: "Example Charter Organization",
  city: "Anytown",
  state: "USA",
  council: "Sample Council",
  district: "District 1",
  founded: "2010",
  meetingDay: "Mondays",
  meetingTime: "7:00 PM",
  meetingLocation: "Example Charter Organization, Anytown USA",
  scoutmasterName: "Demo Scoutmaster",
  scoutmasterEmail: "scoutmaster@example.invalid",
  committeeChairEmail: "committee@example.invalid",
  primaryColor: "#1d6b39",
  accentColor: "#caa54a",
  plan: "patrol",
  isDemo: true,
};

const day = 24 * 60 * 60 * 1000;

// ---------- helpers ----------

async function findOrCreate(model, where, data) {
  const existing = await prisma[model].findFirst({ where });
  if (existing) return existing;
  return prisma[model].create({ data });
}

function randomFilename(ext) {
  return `${crypto.randomBytes(12).toString("hex")}.${ext}`;
}

async function writeImage(orgId, top, bottom, w = 800, h = 600) {
  const filename = randomFilename("png");
  const buf = gradientPng(w, h, top, bottom);
  await saveFile(orgId, filename, buf);
  return { filename, mimeType: "image/png", sizeBytes: buf.length };
}

// ---------- seed sections ----------

async function seedPage(orgId) {
  await prisma.page.upsert({
    where: { orgId },
    update: {},
    create: {
      orgId,
      heroHeadline: "Adventure, leadership, and the outdoors — since 2010.",
      heroLede:
        "Sample Troop 100 is a demo unit on Compass. Click around — every section here is real, just filled with placeholder content.",
      aboutBody:
        "We meet every Monday at 7 PM at the Example Charter Organization. Scouts ages 11–17 are welcome to drop in for a meeting before joining.\n\n" +
        "We rotate one major outdoor adventure per year — Philmont, Sea Base, Boundary Waters, jamborees — and a service project every quarter.\n\n" +
        "We're scout-led: the Scouts run meetings; the adults guide and plan.",
      joinBody:
        "Show up to a Monday meeting. Wear comfortable clothes — closed-toe shoes are smart. A current member will pair you with a patrol so you're not standing alone.\n\n" +
        "Bring a parent the first time so we can hand them a welcome packet.",
      contactNote:
        "Questions before you visit? Email the Scoutmaster — replies usually within a day.",
    },
  });
  console.log("✓ Page content");
}

async function seedCustomPages(orgId) {
  const pages = [
    {
      slug: "history",
      title: "Our History",
      body:
        "Sample Troop 100 was chartered in 2010 by the Example Charter Organization.\n\n" +
        "In our first decade we sent over 50 Scouts to the rank of Eagle, took six contingents to Philmont, and contributed more than 8,000 hours of community service.\n\n" +
        "Some highlights:\n\n" +
        "- 2012 — first Sea Base trip\n" +
        "- 2015 — built a pavilion at the local nature center for an Eagle project\n" +
        "- 2019 — World Scout Jamboree at the Summit Bechtel Reserve\n" +
        "- 2023 — 50th Eagle Scout in troop history",
      visibility: "public",
      sortOrder: 1,
      showInNav: true,
    },
    {
      slug: "faq",
      title: "FAQ",
      body:
        "Q: What does it cost to join?\nA: $100 a year, which covers BSA registration, the troop's meeting space, and a uniform neckerchief. Scholarships available — ask the Scoutmaster.\n\n" +
        "Q: My kid has dietary restrictions. Is that a problem?\nA: Not at all. Add the flag in the directory and our trip planner factors it into every meal plan.\n\n" +
        "Q: How often do you camp?\nA: Roughly monthly during the school year, plus one big summer trip.",
      visibility: "public",
      sortOrder: 2,
      showInNav: true,
    },
  ];
  for (const p of pages) {
    await prisma.customPage.upsert({
      where: { orgId_slug: { orgId, slug: p.slug } },
      update: {},
      create: { orgId, ...p },
    });
  }
  console.log(`✓ Custom pages (${pages.length})`);
}

async function seedMembers(orgId) {
  const adults = [
    { firstName: "Demo", lastName: "Scoutmaster", email: "demo-scoutmaster@example.invalid", phone: "555-0142", position: "Scoutmaster", isYouth: false, commPreference: "both", smsOptIn: true },
    { firstName: "Demo", lastName: "Committee Chair", email: "demo-committee@example.invalid", position: "Committee Chair", isYouth: false, commPreference: "email" },
    { firstName: "Demo", lastName: "Parent A", email: "demo-parent-a@example.invalid", phone: "555-0123", isYouth: false, commPreference: "both", smsOptIn: true },
    { firstName: "Demo", lastName: "Parent B", email: "demo-parent-b@example.invalid", phone: "555-0188", isYouth: false, commPreference: "email" },
  ];
  for (const m of adults) {
    await findOrCreate(
      "member",
      { orgId, firstName: m.firstName, lastName: m.lastName },
      { orgId, ...m }
    );
  }
  const parentA = await prisma.member.findFirst({ where: { orgId, lastName: "Parent A" } });
  const parentB = await prisma.member.findFirst({ where: { orgId, lastName: "Parent B" } });

  const youth = [
    { firstName: "Demo", lastName: "Scout 1", email: "demo-scout-1@example.invalid", patrol: "Eagles", position: "SPL", isYouth: true, commPreference: "both", smsOptIn: true, parentIds: [parentA.id], dietaryFlags: ["Vegetarian"] },
    { firstName: "Demo", lastName: "Scout 2", email: "demo-scout-2@example.invalid", patrol: "Eagles", isYouth: true, commPreference: "email", parentIds: [parentA.id] },
    { firstName: "Demo", lastName: "Scout 3", email: "demo-scout-3@example.invalid", patrol: "Foxes", position: "Patrol Leader", isYouth: true, commPreference: "email", parentIds: [parentB.id], dietaryFlags: ["Nut allergy"] },
    { firstName: "Demo", lastName: "Scout 4", email: "demo-scout-4@example.invalid", patrol: "Foxes", isYouth: true, commPreference: "email", parentIds: [parentB.id] },
    { firstName: "Demo", lastName: "Scout 5", email: "demo-scout-5@example.invalid", patrol: "Hawks", isYouth: true, commPreference: "email", dietaryFlags: ["Gluten-free"] },
  ];
  for (const m of youth) {
    await findOrCreate(
      "member",
      { orgId, firstName: m.firstName, lastName: m.lastName },
      { orgId, ...m }
    );
  }
  console.log(`✓ Members (4 adults + 5 youth, with family links + dietary flags)`);
}

async function seedEquipment(orgId) {
  const items = [
    { name: "Troop trailer", category: "Trailer", serialOrTag: "VIN-TRAILER-001", location: "Holy Nativity parking lot", condition: "good", quantity: 1, notes: "Insurance + registration in the side pouch." },
    { name: "Patrol box (Eagles)", category: "Patrol box", location: "Trailer", condition: "good", quantity: 1 },
    { name: "Patrol box (Foxes)", category: "Patrol box", location: "Trailer", condition: "good", quantity: 1 },
    { name: "Patrol box (Hawks)", category: "Patrol box", location: "Trailer", condition: "needs-repair", quantity: 1, notes: "Latch broken on the lid." },
    { name: "Coleman 2-burner stove", category: "Cooking", location: "Trailer", condition: "good", quantity: 3 },
    { name: "Propane tank (1 lb)", category: "Cooking", location: "Trailer", condition: "good", quantity: 12 },
    { name: "Dining fly", category: "Shelter", location: "Trailer", condition: "good", quantity: 1 },
    { name: "First-aid kit (large)", category: "First aid", location: "Trailer", condition: "good", quantity: 1 },
    { name: "Lantern (battery)", category: "Lanterns / lights", location: "Trailer", condition: "fair", quantity: 4 },
  ];
  for (const it of items) {
    await findOrCreate("equipment", { orgId, name: it.name }, { orgId, ...it });
  }
  console.log(`✓ Equipment / trailer (${items.length})`);
}

async function seedEvents(orgId) {
  const now = Date.now();
  const monday7pm = (offsetDays) => {
    const d = new Date(now + offsetDays * day);
    d.setHours(19, 0, 0, 0);
    return d;
  };
  const events = [
    {
      title: "Troop Meeting (weekly)",
      description: "Regular Monday evening troop meeting.",
      startsAt: monday7pm(7),
      endsAt: new Date(monday7pm(7).getTime() + 90 * 60 * 1000),
      location: "Example Charter Organization",
      locationAddress: "100 Sample Way, Anytown USA",
      category: "Meeting",
      rrule: "FREQ=WEEKLY",
    },
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
      title: "Park cleanup service project",
      description: "Two-hour service at the local nature center. Bring gloves and water; we provide trash bags and snacks.",
      startsAt: new Date(now + 14 * day + 9 * 60 * 60 * 1000),
      endsAt: new Date(now + 14 * day + 12 * 60 * 60 * 1000),
      location: "Sample Nature Center",
      locationAddress: "200 Greenway Dr, Anytown USA",
      category: "Service",
    },
    {
      title: "Spring Camporee",
      description: "Weekend campout with patrol cooking, Scout skills, and a Saturday-night campfire.",
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
  for (const e of events) {
    await findOrCreate(
      "event",
      { orgId, title: e.title, startsAt: e.startsAt },
      { orgId, ...e }
    );
  }
  console.log(`✓ Events (${events.length}, including a weekly recurrence)`);
  return prisma.event.findMany({ where: { orgId } });
}

async function seedTripPlan(orgId, campout) {
  if (!campout) return;
  const plan = await prisma.tripPlan.upsert({
    where: { eventId: campout.id },
    update: {},
    create: {
      orgId,
      eventId: campout.id,
      headcountOverride: 24,
      notes: "Patrol cooking — each patrol cooks Saturday lunch + dinner; troop-wide breakfast Sunday.",
    },
  });

  const meals = [
    {
      name: "Friday dinner (in transit)",
      recipeName: "Sandwiches + chips",
      ingredients: [
        { name: "Bread", quantityPerPerson: 2, unit: "ea", category: "Bakery", unitCost: 0.20 },
        { name: "Sandwich meat", quantityPerPerson: 2, unit: "oz", category: "Meat", unitCost: 0.60 },
        { name: "Cheese slices", quantityPerPerson: 1, unit: "ea", category: "Dairy", unitCost: 0.30 },
        { name: "Chips (single bags)", quantityPerPerson: 1, unit: "ea", category: "Pantry", unitCost: 0.50 },
      ],
    },
    {
      name: "Saturday breakfast",
      recipeName: "Foil packets",
      ingredients: [
        { name: "Eggs", quantityPerPerson: 2, unit: "ea", category: "Dairy", unitCost: 0.25 },
        { name: "Bacon", quantityPerPerson: 0.25, unit: "lb", category: "Meat", unitCost: 6.00 },
        { name: "Bread", quantityPerPerson: 2, unit: "ea", category: "Bakery", unitCost: 0.20 },
        { name: "Orange juice", quantityPerPerson: 1, unit: "cup", category: "Drinks", unitCost: 0.30 },
      ],
    },
    {
      name: "Saturday dinner",
      recipeName: "Spaghetti + meatballs",
      ingredients: [
        { name: "Ground beef", quantityPerPerson: 0.25, unit: "lb", category: "Meat", unitCost: 5.50 },
        { name: "Spaghetti", quantityPerPerson: 0.2, unit: "lb", category: "Pantry", unitCost: 1.50 },
        { name: "Pasta sauce", quantityPerPerson: 0.5, unit: "cup", category: "Pantry", unitCost: 0.80 },
        { name: "Salad mix", quantityPerPerson: 0.5, unit: "cup", category: "Produce", unitCost: 0.80 },
        { name: "Garlic bread", quantityPerPerson: 1, unit: "ea", category: "Bakery", unitCost: 0.40 },
      ],
    },
    {
      name: "Sunday breakfast",
      recipeName: "Pancakes + sausage",
      ingredients: [
        { name: "Pancake mix", quantityPerPerson: 0.5, unit: "cup", category: "Pantry", unitCost: 0.40 },
        { name: "Syrup", quantityPerPerson: 0.25, unit: "cup", category: "Pantry", unitCost: 0.50 },
        { name: "Sausage links", quantityPerPerson: 2, unit: "ea", category: "Meat", unitCost: 0.50 },
        { name: "Orange juice", quantityPerPerson: 1, unit: "cup", category: "Drinks", unitCost: 0.30 },
      ],
    },
  ];
  for (let i = 0; i < meals.length; i++) {
    const m = meals[i];
    let meal = await prisma.meal.findFirst({ where: { tripPlanId: plan.id, name: m.name } });
    if (!meal) {
      meal = await prisma.meal.create({
        data: {
          orgId,
          tripPlanId: plan.id,
          name: m.name,
          recipeName: m.recipeName,
          sortOrder: i + 1,
        },
      });
      for (const ing of m.ingredients) {
        await prisma.ingredient.create({ data: { orgId, mealId: meal.id, ...ing } });
      }
    }
  }

  // Per-trip gear list
  const gear = [
    { name: "Patrol box (Eagles)", quantity: 1, assignedTo: "Demo Scout 1" },
    { name: "Patrol box (Foxes)", quantity: 1, assignedTo: "Demo Scout 3" },
    { name: "First-aid kit (large)", quantity: 1, assignedTo: "Demo Scoutmaster" },
    { name: "Dining fly", quantity: 1 },
    { name: "Coleman 2-burner stove", quantity: 2 },
    { name: "Propane tanks", quantity: 6 },
    { name: "Lantern (battery)", quantity: 4 },
    { name: "Tarps (8x10)", quantity: 3 },
  ];
  for (let i = 0; i < gear.length; i++) {
    const g = gear[i];
    const exists = await prisma.gearItem.findFirst({ where: { tripPlanId: plan.id, name: g.name } });
    if (!exists) {
      await prisma.gearItem.create({
        data: { orgId, tripPlanId: plan.id, ...g, sortOrder: i + 1 },
      });
    }
  }

  // Sign-up slots: drivers + a couple gear spots
  const slots = [
    { title: "Driver — patrol box truck", capacity: 1, sortOrder: 1 },
    { title: "Driver — Scouts (4 seats each)", capacity: 4, sortOrder: 2 },
    { title: "Bring extra propane", capacity: 1, sortOrder: 3 },
    { title: "Bring birthday cake (Demo Scout 4 turns 14!)", capacity: 1, sortOrder: 4 },
  ];
  for (const s of slots) {
    const exists = await prisma.signupSlot.findFirst({
      where: { eventId: campout.id, title: s.title },
    });
    if (!exists) {
      await prisma.signupSlot.create({ data: { orgId, eventId: campout.id, ...s } });
    }
  }
  console.log("✓ Trip plan with 4 meals, gear list, sign-up slots");
}

async function seedAlbums(orgId) {
  const albums = [
    {
      title: "Spring Camporee 2024",
      description: "Two days at the Sample Scout Reservation.",
      visibility: "public",
      colors: [
        [[60, 130, 80], [30, 80, 50]],   // forest greens
        [[210, 170, 90], [120, 90, 50]], // tan/brown
        [[80, 120, 180], [40, 70, 120]], // sky/water
      ],
    },
    {
      title: "First Aid training",
      description: "Hands-on session with Pat Adams.",
      visibility: "public",
      colors: [
        [[180, 90, 80], [110, 50, 40]],  // red cross-y
        [[200, 200, 200], [120, 120, 120]],
      ],
    },
    {
      title: "Eagle ceremony — Demo Scout 3",
      description: "Court of Honor program plus the family photo.",
      visibility: "public",
      colors: [
        [[210, 170, 90], [60, 100, 60]], // gold + green
        [[40, 80, 50], [200, 180, 120]],
      ],
    },
    {
      title: "Internal: PLC retreat photos",
      description: "Members-only — internal planning session.",
      visibility: "members",
      colors: [
        [[80, 80, 100], [30, 30, 50]],
      ],
    },
  ];
  for (let i = 0; i < albums.length; i++) {
    const a = albums[i];
    const slug = a.title.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    let album = await prisma.album.findUnique({ where: { orgId_slug: { orgId, slug } } });
    if (!album) {
      album = await prisma.album.create({
        data: {
          orgId,
          title: a.title,
          slug,
          description: a.description,
          visibility: a.visibility,
          takenAt: new Date(Date.now() - (i + 1) * 14 * day),
        },
      });
      for (let j = 0; j < a.colors.length; j++) {
        const [top, bottom] = a.colors[j];
        const img = await writeImage(orgId, top, bottom);
        await prisma.photo.create({
          data: {
            orgId,
            albumId: album.id,
            filename: img.filename,
            originalName: `${slug}-${j + 1}.png`,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            sortOrder: j + 1,
          },
        });
      }
    }
  }
  console.log(`✓ Albums (${albums.length}, with procedurally-generated photos)`);
}

async function seedAnnouncements(orgId) {
  const items = [
    {
      title: "Welcome to our new website!",
      body:
        "We've moved to Compass — same troop, faster site, easier to update.\n\n" +
        "Leaders can post announcements like this from the admin dashboard.",
      pinned: true,
    },
    {
      title: "Spring Camporee — sign up by Friday",
      body: "Slots are filling up. RSVP from the event page and grab a sign-up slot if you can drive.",
      pinned: false,
    },
    {
      title: "Class B order is in",
      body: "Pickup at the next meeting. $15 cash or check to the troop.",
      pinned: false,
    },
  ];
  for (const a of items) {
    const exists = await prisma.announcement.findFirst({ where: { orgId, title: a.title } });
    if (!exists) await prisma.announcement.create({ data: { orgId, ...a } });
  }
  console.log(`✓ Announcements (${items.length})`);
}

async function seedPosts(orgId) {
  const sm = await prisma.member.findFirst({ where: { orgId, lastName: "Scoutmaster" } });
  const posts = [
    {
      title: "Camporee recap",
      body:
        "What a weekend. The patrols absolutely crushed cooking — Foxes' Saturday dinner had the whole campsite asking for the recipe.\n\n" +
        "Highlights: 8 first-time campers, 3 Scouts knocked out their cooking requirements, and not a single rainout.",
      visibility: "public",
      pinned: false,
      photoColors: [
        [[60, 130, 80], [30, 80, 50]],
        [[210, 170, 90], [120, 90, 50]],
        [[40, 100, 70], [180, 200, 160]],
      ],
    },
    {
      title: "Pat's note on the May Court of Honor",
      body:
        "Reminder: Court of Honor is May 11 at 7 PM. Families welcome — light refreshments after.\n\n" +
        "Let me know if you need anything in advance.",
      visibility: "public",
      pinned: true,
    },
    {
      title: "Eagle Project — Demo Scout 3 build day",
      body: "Weekend two of the trail-bench build. Solid turnout from the troop and a few parents — thanks!",
      visibility: "public",
      pinned: false,
      photoColors: [[[210, 170, 90], [60, 100, 60]]],
    },
    {
      title: "Internal: PLC notes from last weekend",
      body: "Members-only post with the PLC notes.\n\n" +
        "- Spring service project locked in for May 8\n" +
        "- New equipment requests: 2 patrol boxes, 3 lanterns\n" +
        "- Patrol leader rotations finalized for the next 6 months",
      visibility: "members",
      pinned: false,
    },
  ];
  for (const p of posts) {
    const exists = await prisma.post.findFirst({ where: { orgId, title: p.title } });
    if (exists) continue;
    const post = await prisma.post.create({
      data: {
        orgId,
        authorId: null,
        title: p.title,
        body: p.body,
        visibility: p.visibility,
        pinned: p.pinned,
        publishedAt: new Date(Date.now() - Math.floor(Math.random() * 30) * day),
      },
    });
    if (p.photoColors) {
      for (let j = 0; j < p.photoColors.length; j++) {
        const [top, bottom] = p.photoColors[j];
        const img = await writeImage(orgId, top, bottom);
        await prisma.postPhoto.create({
          data: {
            orgId,
            postId: post.id,
            filename: img.filename,
            originalName: `post-${j + 1}.png`,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            sortOrder: j + 1,
          },
        });
      }
    }
  }
  console.log(`✓ Activity feed posts (${posts.length}, with photos)`);
}

async function seedForms(orgId) {
  // One URL link, one tiny generated PDF.
  const linkExists = await prisma.form.findFirst({
    where: { orgId, title: "BSA Health & Medical Record (A/B)" },
  });
  if (!linkExists) {
    await prisma.form.create({
      data: {
        orgId,
        title: "BSA Health & Medical Record (A/B)",
        url: "https://www.scouting.org/health-and-safety/ahmr/",
        category: "Health forms",
        visibility: "public",
      },
    });
  }
  const pdfExists = await prisma.form.findFirst({
    where: { orgId, title: "Troop welcome packet" },
  });
  if (!pdfExists) {
    const pdfBody =
      `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>> endobj
4 0 obj <</Length 44>>
stream
BT /F1 12 Tf 72 720 Td (Sample Troop 100 — welcome) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000054 00000 n
0000000100 00000 n
0000000170 00000 n
trailer <</Size 5 /Root 1 0 R>>
startxref
260
%%EOF
`;
    const buf = Buffer.from(pdfBody);
    const filename = randomFilename("pdf");
    await saveFile(orgId, filename, buf);
    await prisma.form.create({
      data: {
        orgId,
        title: "Troop welcome packet",
        category: "Welcome packet",
        visibility: "public",
        filename,
        originalName: "welcome-packet.pdf",
        mimeType: "application/pdf",
        sizeBytes: buf.length,
      },
    });
  }
  console.log("✓ Forms (URL link + generated PDF)");
}

// ---------- main ----------

// ---------- Cub Scout Pack demo ----------

const PACK_DEMO = {
  slug: "pack100",
  unitType: "Pack",
  unitNumber: "100",
  displayName: "Sample Pack 100",
  tagline: "Cub Scouting for the demo. Lions through Arrow of Light.",
  charterOrg: "Example Charter Organization",
  city: "Anytown",
  state: "USA",
  council: "Sample Council",
  meetingDay: "Wednesdays",
  meetingTime: "6:30 PM",
  meetingLocation: "Example Charter Organization, Anytown USA",
  scoutmasterName: "Demo Cubmaster",
  scoutmasterEmail: "cubmaster@example.invalid",
  committeeChairEmail: "pack-committee@example.invalid",
  primaryColor: "#0f172a",
  accentColor: "#1d4ed8",
  plan: "patrol",
  isDemo: true,
};

const PACK_DENS = [
  { label: "Lion", grade: "K", count: 2 },
  { label: "Tiger", grade: "1st", count: 3 },
  { label: "Wolf", grade: "2nd", count: 3 },
  { label: "Bear", grade: "3rd", count: 3 },
  { label: "Webelos", grade: "4th", count: 2 },
  { label: "Arrow of Light", grade: "5th", count: 2 },
];

async function seedPackSubgroups(orgId) {
  const seeds = buildSeedSubgroups("Pack");
  for (const s of seeds) {
    await findOrCreate(
      "subgroup",
      { orgId, name: s.name },
      { orgId, ...s },
    );
  }
  console.log(`✓ Pack dens (${seeds.length})`);
}

async function seedPackMembers(orgId) {
  const adults = [
    { firstName: "Demo", lastName: "Cubmaster", email: "demo-cubmaster@example.invalid", phone: "555-0200", position: "Cubmaster", isYouth: false, commPreference: "both", smsOptIn: true },
    { firstName: "Demo", lastName: "Pack Committee Chair", email: "demo-pack-cc@example.invalid", position: "Committee Chair", isYouth: false, commPreference: "email" },
    { firstName: "Demo", lastName: "Pack Treasurer", email: "demo-pack-treasurer@example.invalid", position: "Treasurer", isYouth: false, commPreference: "email" },
  ];
  for (const den of PACK_DENS) {
    adults.push({
      firstName: "Demo",
      lastName: `${den.label} Den Leader`,
      email: `demo-${den.label.toLowerCase().replace(/\s+/g, "")}-leader@example.invalid`,
      position: "Den Leader",
      patrol: den.label,
      isYouth: false,
      commPreference: "both",
      smsOptIn: true,
    });
  }
  for (const m of adults) {
    await findOrCreate("member", { orgId, firstName: m.firstName, lastName: m.lastName }, { orgId, ...m });
  }

  let cubIdx = 1;
  for (const den of PACK_DENS) {
    for (let i = 0; i < den.count; i++) {
      const last = `${den.label} Cub ${i + 1}`;
      const parentLast = `${den.label} Parent ${i + 1}`;
      const parent = await findOrCreate(
        "member",
        { orgId, firstName: "Demo", lastName: parentLast },
        {
          orgId,
          firstName: "Demo",
          lastName: parentLast,
          email: `demo-${den.label.toLowerCase().replace(/\s+/g, "")}-parent-${i + 1}@example.invalid`,
          isYouth: false,
          commPreference: "email",
        },
      );
      await findOrCreate(
        "member",
        { orgId, firstName: "Demo", lastName: last },
        {
          orgId,
          firstName: "Demo",
          lastName: last,
          isYouth: true,
          patrol: den.label,
          commPreference: "email",
          parentIds: [parent.id],
        },
      );
      cubIdx++;
    }
  }
  console.log(`✓ Pack members (${adults.length} adults + ${cubIdx - 1} cubs across 6 dens)`);
}

async function seedPackOrg() {
  const org = await prisma.org.upsert({
    where: { slug: PACK_DEMO.slug },
    update: PACK_DEMO,
    create: PACK_DEMO,
  });
  console.log(`\nSeeding ${org.displayName} (${org.slug})…`);
  await seedPackSubgroups(org.id);
  await seedPackMembers(org.id);
  return org;
}

// ---------- Girl Scout Troop demo ----------

const GS_DEMO = {
  slug: "gstroop100",
  unitType: "GirlScoutTroop",
  unitNumber: "100",
  displayName: "Sample Girl Scout Troop 100",
  tagline: "Girl Scout Troop demo. Daisies through Ambassadors.",
  charterOrg: "Example Service Unit",
  city: "Anytown",
  state: "USA",
  council: "Example Council of the USA",
  meetingDay: "Thursdays",
  meetingTime: "5:00 PM",
  meetingLocation: "Example Service Unit, Anytown USA",
  scoutmasterName: "Demo Troop Leader",
  scoutmasterEmail: "troop-leader@example.invalid",
  committeeChairEmail: "gs-committee@example.invalid",
  primaryColor: "#0f172a",
  accentColor: "#1d4ed8",
  plan: "patrol",
  isDemo: true,
};

// Sample Girl Scout troop is multi-level (common for small communities):
// a Daisy/Brownie group meets together with a single Troop Leader pair.
const GS_LEVELS = [
  { label: "Daisy", grade: "K-1", count: 3 },
  { label: "Brownie", grade: "2-3", count: 4 },
];

async function seedGirlScoutSubgroups(orgId) {
  const seeds = buildSeedSubgroups("GirlScoutTroop");
  for (const s of seeds) {
    await findOrCreate(
      "subgroup",
      { orgId, name: s.name },
      { orgId, ...s },
    );
  }
  console.log(`✓ Girl Scout levels (${seeds.length})`);
}

async function seedGirlScoutMembers(orgId) {
  const adults = [
    { firstName: "Demo", lastName: "Troop Leader", email: "demo-gs-troop-leader@example.invalid", phone: "555-0300", position: "Troop Leader", isYouth: false, commPreference: "both", smsOptIn: true },
    { firstName: "Demo", lastName: "Co-Leader", email: "demo-gs-coleader@example.invalid", position: "Co-Leader", isYouth: false, commPreference: "email" },
    { firstName: "Demo", lastName: "Cookie Manager", email: "demo-gs-cookie@example.invalid", position: "Cookie Manager", isYouth: false, commPreference: "email" },
    { firstName: "Demo", lastName: "GS Treasurer", email: "demo-gs-treasurer@example.invalid", position: "Troop Treasurer", isYouth: false, commPreference: "email" },
  ];
  for (const m of adults) {
    await findOrCreate("member", { orgId, firstName: m.firstName, lastName: m.lastName }, { orgId, ...m });
  }
  let girlCount = 0;
  for (const lvl of GS_LEVELS) {
    for (let i = 0; i < lvl.count; i++) {
      const last = `${lvl.label} ${i + 1}`;
      const parent = await findOrCreate(
        "member",
        { orgId, firstName: "Demo", lastName: `${lvl.label} Parent ${i + 1}` },
        {
          orgId,
          firstName: "Demo",
          lastName: `${lvl.label} Parent ${i + 1}`,
          email: `demo-gs-${lvl.label.toLowerCase()}-parent-${i + 1}@example.invalid`,
          isYouth: false,
          commPreference: "email",
        },
      );
      await findOrCreate(
        "member",
        { orgId, firstName: "Demo", lastName: last },
        {
          orgId,
          firstName: "Demo",
          lastName: last,
          isYouth: true,
          patrol: lvl.label,
          commPreference: "email",
          parentIds: [parent.id],
        },
      );
      girlCount++;
    }
  }
  console.log(`✓ Girl Scout members (${adults.length} adults + ${girlCount} girls across ${GS_LEVELS.length} levels)`);
}

async function seedGirlScoutOrg() {
  const org = await prisma.org.upsert({
    where: { slug: GS_DEMO.slug },
    update: GS_DEMO,
    create: GS_DEMO,
  });
  console.log(`\nSeeding ${org.displayName} (${org.slug})…`);
  await seedGirlScoutSubgroups(org.id);
  await seedGirlScoutMembers(org.id);
  return org;
}

// ---------- Demo login users ----------
//
// Creates ready-to-use sign-in accounts so a fresh local install can hit
// /admin and /__super without the signup dance. Idempotent: existing rows
// are updated to the canonical password + flags. Demo-only — never run
// against production. The User.email is the lookup key; passwordHash is
// rewritten every run.

const DEMO_PASSWORD = "compassdemo123";

async function upsertDemoUser({ email, displayName, isSuperAdmin = false, orgAdminSlugs = [] }) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, displayName, isSuperAdmin, emailVerified: true },
    create: { email, passwordHash, displayName, isSuperAdmin, emailVerified: true },
  });
  for (const slug of orgAdminSlugs) {
    const org = await prisma.org.findUnique({ where: { slug } });
    if (!org) continue;
    await prisma.orgMembership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: { role: "admin" },
      create: { userId: user.id, orgId: org.id, role: "admin" },
    });
  }
  return user;
}

async function seedDemoUsers() {
  await upsertDemoUser({
    email: "super@compass.example",
    displayName: "Demo Super Admin",
    isSuperAdmin: true,
  });
  await upsertDemoUser({
    email: DEMO.scoutmasterEmail,
    displayName: DEMO.scoutmasterName,
    orgAdminSlugs: [DEMO.slug],
  });
  await upsertDemoUser({
    email: PACK_DEMO.scoutmasterEmail,
    displayName: PACK_DEMO.scoutmasterName,
    orgAdminSlugs: [PACK_DEMO.slug],
  });
  await upsertDemoUser({
    email: GS_DEMO.scoutmasterEmail,
    displayName: GS_DEMO.scoutmasterName,
    orgAdminSlugs: [GS_DEMO.slug],
  });
  console.log("✓ Demo login users (4)");
}

async function main() {
  const org = await prisma.org.upsert({
    where: { slug: DEMO.slug },
    update: DEMO,
    create: DEMO,
  });
  console.log(`Seeding ${org.displayName} (${org.slug})…`);

  await seedPage(org.id);
  await seedCustomPages(org.id);
  await seedMembers(org.id);
  await seedEquipment(org.id);
  const events = await seedEvents(org.id);
  const campout = events.find((e) => e.title === "Spring Camporee");
  await seedTripPlan(org.id, campout);
  await seedAlbums(org.id);
  await seedAnnouncements(org.id);
  await seedPosts(org.id);
  await seedForms(org.id);

  const pack = await seedPackOrg();
  const gs = await seedGirlScoutOrg();

  await seedDemoUsers();

  console.log("\nDemo seeded. Visit:");
  console.log(`  http://${DEMO.slug}.localhost:3000/`);
  console.log(`  http://${pack.slug}.localhost:3000/`);
  console.log(`  http://${gs.slug}.localhost:3000/`);
  console.log(`\nDemo login (password: ${DEMO_PASSWORD})`);
  console.log(`  super@compass.example          → super admin · http://localhost:3000/__super`);
  console.log(`  ${DEMO.scoutmasterEmail.padEnd(30)} → admin · http://${DEMO.slug}.localhost:3000/admin`);
  console.log(`  ${PACK_DEMO.scoutmasterEmail.padEnd(30)} → admin · http://${pack.slug}.localhost:3000/admin`);
  console.log(`  ${GS_DEMO.scoutmasterEmail.padEnd(30)} → admin · http://${gs.slug}.localhost:3000/admin`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
