// Writes the demo unit (./season.ts) into an empty demo database.
// Called by ./reset.ts after the wipe; never by hand on a real database.

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { provisionOrg } from "@/lib/provision/provision-org";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { encryptMemberPii } from "@/lib/members/crypto";
import { provisionEventChannel, provisionStandingChannels } from "@/lib/chat";
import { postTransaction } from "@/lib/treasury/posting";
import { slotsFromEventFile } from "@/lib/events/waypoint-file";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoRole } from "./mode";
import {
  ANNOUNCEMENTS,
  BADGE_DAY_FILE,
  BADGE_DAY_STAFF,
  BADGE_DAY_SIGNUPS,
  BADGE_DAY_SLUG,
  COH_AWARDS,
  COUNSELOR_ASSIGNMENTS,
  COUNSELOR_BADGES,
  COUNSELOR_LIST,
  DEMO_ADULTS,
  DEMO_EVENTS,
  DEMO_SCOUTS,
  DEMO_UNIT,
  MESSAGES,
  PATROLS,
  POSTS,
  PROGRESS,
  TREASURY,
  demoEmail,
  type DemoAdult,
  type DemoEvent,
  type MessageChannel,
} from "./season";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SeedOptions = {
  /** Treat this as the moment of the reset (tests pin it). */
  now?: Date;
  /** Another unit number, so a test can seed beside a real demo. */
  unitNumber?: string;
};

export type SeedSummary = {
  orgId: string;
  slug: string;
  accounts: number;
  members: number;
  events: number;
  messages: number;
  transactions: number;
};

/** `now` moved by whole days, at a local wall-clock time. */
export function atDay(now: Date, day: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + day);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/** Offset in days to the next Monday (today when it's Monday). */
export function daysToMonday(now: Date): number {
  return (8 - now.getDay()) % 7;
}

export function eventTimes(ev: DemoEvent, now: Date): { startsAt: Date; endsAt: Date } {
  const day = ev.rrule ? daysToMonday(now) : ev.day;
  const startsAt = atDay(now, day, ev.at);
  const endsAt = ev.nights
    ? atDay(now, day + ev.nights, "12:00")
    : new Date(startsAt.getTime() + (ev.hours ?? 1) * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

function accountEmail(role: DemoRole): string {
  const a = DEMO_ACCOUNTS.find((x) => x.role === role);
  if (!a) throw new Error(`no demo account for ${role}`);
  return a.email;
}

export function adultEmail(a: DemoAdult): string {
  return a.account ? accountEmail(a.account) : demoEmail(a.firstName, a.lastName);
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const shortName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName[0]}.`;

/** OrgMembership role for each adult. */
function membershipRole(a: DemoAdult): "admin" | "leader" | "parent" {
  if (a.account === "admin") return "admin";
  if (a.account === "leader") return "leader";
  if (a.position === "Committee Chair" || a.position === "Treasurer") return "leader";
  return "parent";
}

export async function seedDemo(opts: SeedOptions = {}): Promise<SeedSummary> {
  const now = opts.now ?? new Date();
  const unitNumber = opts.unitNumber ?? DEMO_UNIT.unitNumber;
  const yearOut = new Date(now.getTime() + 365 * DAY_MS);

  // --- people with sign-ins -------------------------------------------------
  // Every adult gets a User so their chat messages and sign-ups have a
  // name; only the four demo accounts get a password.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIdByAdult = new Map<string, string>();
  for (const a of DEMO_ADULTS) {
    const user = await prisma.user.create({
      data: {
        email: adultEmail(a),
        displayName: fullName(a),
        emailVerified: true,
        adultAttestedAt: now,
      },
      select: { id: true },
    });
    userIdByAdult.set(a.key, user.id);
    if (a.account) {
      await prisma.account.create({
        data: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash },
      });
    }
  }
  const userOf = (adultKey: string): string => {
    const id = userIdByAdult.get(adultKey);
    if (!id) throw new Error(`unknown demo adult ${adultKey}`);
    return id;
  };
  const admin = DEMO_ADULTS.find((a) => a.account === "admin")!;
  const leader = DEMO_ADULTS.find((a) => a.account === "leader")!;
  const counselor = DEMO_ADULTS.find((a) => a.account === "counselor")!;
  const treasurer = DEMO_ADULTS.find((a) => a.position === "Treasurer") ?? admin;

  // --- the unit -------------------------------------------------------------
  const { org: created } = await provisionOrg({
    ...DEMO_UNIT,
    unitNumber,
    scoutmasterName: fullName(admin),
    scoutmasterEmail: adultEmail(admin),
    plan: "troop",
    isDemo: true,
    addOns: ["messaging"],
  });
  const org = await prisma.org.update({
    where: { id: created.id },
    data: { ownerId: userOf(admin.key), subscriptionStatus: "active", trialEndsAt: null },
  });
  const dek = unwrapDekWithMaster(org);

  for (const a of DEMO_ADULTS) {
    const role = membershipRole(a);
    await prisma.orgMembership.create({
      data: {
        userId: userOf(a.key),
        orgId: org.id,
        role,
        yptCurrentUntil: a.ypt ? yearOut : null,
      },
    });
  }

  // --- roster ---------------------------------------------------------------
  const memberIdByKey = new Map<string, string>();
  for (const a of DEMO_ADULTS) {
    const m = await prisma.member.create({
      data: {
        orgId: org.id,
        ...encryptMemberPii(
          { firstName: a.firstName, lastName: a.lastName, phone: a.phone, city: DEMO_UNIT.city, state: DEMO_UNIT.state },
          dek,
          org.id,
        ),
        email: adultEmail(a),
        isYouth: false,
        position: a.position ?? null,
        commPreference: a.phone ? "both" : "email",
        smsOptIn: !!a.phone,
        skills: a.skills ?? [],
        joinedAt: new Date(now.getTime() - 400 * DAY_MS),
        createdAt: new Date(now.getTime() - 400 * DAY_MS),
      },
      select: { id: true },
    });
    memberIdByKey.set(a.key, m.id);
  }
  for (const s of DEMO_SCOUTS) {
    const birthdate = new Date(now.getTime());
    birthdate.setFullYear(birthdate.getFullYear() - s.age, (birthdate.getMonth() + 5) % 12, 12);
    const m = await prisma.member.create({
      data: {
        orgId: org.id,
        ...encryptMemberPii({ firstName: s.firstName, lastName: s.lastName, city: DEMO_UNIT.city, state: DEMO_UNIT.state }, dek, org.id),
        email: null,
        isYouth: true,
        patrol: s.patrol,
        position: s.position ?? null,
        birthdate,
        parentIds: [memberIdByKey.get(s.parent)!],
        notes: `Rank: ${s.rank}`,
        joinedAt: new Date(now.getTime() - (s.age - 10) * 365 * DAY_MS),
        createdAt: new Date(now.getTime() - (s.age - 10) * 365 * DAY_MS),
      },
      select: { id: true },
    });
    memberIdByKey.set(s.key, m.id);
  }
  const memberOf = (key: string): string => {
    const id = memberIdByKey.get(key);
    if (!id) throw new Error(`unknown demo person ${key}`);
    return id;
  };
  const scoutByKey = new Map(DEMO_SCOUTS.map((s) => [s.key, s]));
  const adultByKey = new Map(DEMO_ADULTS.map((a) => [a.key, a]));

  await prisma.memberSubaccount.createMany({
    data: DEMO_SCOUTS.map((s) => ({ orgId: org.id, memberId: memberOf(s.key) })),
    skipDuplicates: true,
  });

  for (const [i, p] of PATROLS.entries()) {
    const leaderScout = DEMO_SCOUTS.find((s) => s.patrol === p.name && s.position === "Patrol Leader");
    await prisma.patrol.create({
      data: {
        orgId: org.id,
        name: p.name,
        color: p.color,
        description: p.description,
        sortOrder: i,
        leaderMemberId: leaderScout ? memberOf(leaderScout.key) : null,
      },
    });
  }

  const termStart = new Date(now.getTime() - 120 * DAY_MS);
  for (const person of [...DEMO_ADULTS, ...DEMO_SCOUTS]) {
    if (!person.position) continue;
    await prisma.positionTerm.create({
      data: { orgId: org.id, memberId: memberOf(person.key), position: person.position, startedAt: termStart },
    });
  }
  for (const a of DEMO_ADULTS.filter((x) => x.ypt)) {
    await prisma.training.create({
      data: {
        orgId: org.id,
        memberId: memberOf(a.key),
        courseName: "Youth Protection Training",
        completedAt: new Date(now.getTime() - 300 * DAY_MS),
        expiresAt: new Date(now.getTime() + 430 * DAY_MS),
      },
    });
  }

  // --- calendar -------------------------------------------------------------
  const eventIdByKey = new Map<string, string>();
  let eventCount = 0;
  for (const ev of DEMO_EVENTS) {
    const { startsAt, endsAt } = eventTimes(ev, now);
    const event = await prisma.event.create({
      data: {
        orgId: org.id,
        title: ev.title,
        description: ev.description,
        category: ev.category,
        startsAt,
        endsAt,
        allDay: false,
        location: ev.location,
        locationAddress: ev.locationAddress ?? null,
        cost: ev.cost ?? null,
        capacity: ev.capacity ?? null,
        signupRequired: !!ev.signupRequired,
        requiresPermissionSlip: !!ev.requiresPermissionSlip,
        rrule: ev.rrule ?? null,
        serviceHours: ev.serviceHours ?? null,
        campingNights: ev.campingNights ?? null,
        hikingMiles: ev.hikingMiles ?? null,
        publicSlug: ev.key === "badgeday" && !opts.unitNumber ? BADGE_DAY_SLUG : null,
      },
      select: { id: true, title: true },
    });
    eventCount++;
    eventIdByKey.set(ev.key, event.id);

    const rsvps: Array<[string, "yes" | "maybe" | "no"]> = [
      ...(ev.going ?? []).map((k) => [k, "yes"] as [string, "yes"]),
      ...(ev.maybe ?? []).map((k) => [k, "maybe"] as [string, "maybe"]),
      ...(ev.notGoing ?? []).map((k) => [k, "no"] as [string, "no"]),
    ];
    for (const [key, response] of rsvps) {
      const scout = scoutByKey.get(key);
      if (!scout) throw new Error(`unknown demo scout ${key}`);
      await prisma.rsvp.create({
        data: {
          orgId: org.id,
          eventId: event.id,
          memberId: memberOf(key),
          name: fullName(scout),
          response,
          createdAt: new Date(startsAt.getTime() - 10 * DAY_MS),
        },
      });
    }

    for (const [sortOrder, slot] of (ev.slots ?? []).entries()) {
      const row = await prisma.signupSlot.create({
        data: {
          orgId: org.id,
          eventId: event.id,
          title: slot.title,
          description: slot.description ?? null,
          capacity: slot.capacity,
          sortOrder,
        },
        select: { id: true },
      });
      const seats = [
        ...slot.takenBy.map((k) => ({ k, waitlisted: false })),
        ...(slot.waitlist ?? []).map((k) => ({ k, waitlisted: true })),
      ];
      for (const [i, seat] of seats.entries()) {
        const a = adultByKey.get(seat.k);
        if (!a) throw new Error(`unknown demo adult ${seat.k}`);
        await prisma.slotAssignment.create({
          data: {
            orgId: org.id,
            slotId: row.id,
            userId: userOf(a.key),
            name: fullName(a),
            email: adultEmail(a),
            waitlisted: seat.waitlisted,
            createdAt: new Date(now.getTime() - (seats.length - i) * 60 * 60 * 1000),
          },
        });
      }
    }

    if (ev.key === "badgeday") await seedBadgeDay(org.id, event.id, now, userOf, adultByKey, scoutByKey);
    if (ev.channel) await provisionEventChannel({ event, org, prismaClient: prisma });
  }

  const coh = eventIdByKey.get("coh");
  if (coh) {
    for (const [i, a] of COH_AWARDS.entries()) {
      await prisma.cohAward.create({
        data: {
          orgId: org.id,
          eventId: coh,
          recipient: fullName(scoutByKey.get(a.scout)!),
          award: a.award,
          category: a.category,
          sortOrder: i,
        },
      });
    }
  }

  for (const loc of [
    { name: "Maple Ridge Community Center", type: "Meeting", address: "15 Center St, Maple Ridge, MN" },
    { name: "Pine Hollow Scout Camp", type: "Camp", address: "4100 Pine Hollow Rd, Maple Ridge, MN", distanceMiles: 38 },
    { name: "Ridge Trail, east trailhead", type: "Trailhead", address: "Ridge Rd & County 9, Maple Ridge, MN", distanceMiles: 12 },
  ]) {
    await prisma.location.create({ data: { orgId: org.id, ...loc } });
  }

  const counselorIdByName = new Map<string, string>();
  for (const c of COUNSELOR_LIST) {
    const row = await prisma.meritBadgeCounselor.create({
      data: {
        orgId: org.id,
        name: c.name,
        email: c.adult ? adultEmail(adultByKey.get(c.adult)!) : demoEmail(...(c.name.split(" ") as [string, string])),
        badges: c.badges,
        memberId: c.adult ? memberOf(c.adult) : null,
        notes: c.notes,
      },
      select: { id: true },
    });
    counselorIdByName.set(c.name, row.id);
  }

  // --- badge day staff ------------------------------------------------------
  const badgeDayId = eventIdByKey.get("badgeday");
  if (badgeDayId) {
    const slots = await prisma.signupSlot.findMany({ where: { eventId: badgeDayId }, select: { id: true, key: true } });
    for (const st of BADGE_DAY_STAFF) {
      const adult = st.adult ? adultByKey.get(st.adult) : undefined;
      const listed = COUNSELOR_LIST.find((c) => c.name === st.counselor || (adult && c.adult === adult.key));
      const name = adult ? fullName(adult) : st.counselor!;
      await prisma.eventStaff.create({
        data: {
          orgId: org.id,
          eventId: badgeDayId,
          userId: adult ? userOf(adult.key) : null,
          counselorId: listed ? counselorIdByName.get(listed.name) ?? null : null,
          name,
          email: adult ? adultEmail(adult) : demoEmail(...(name.split(" ") as [string, string])),
          phone: adult?.phone ?? null,
          role: st.role,
          slotId: st.station ? slots.find((x) => x.key === st.station)?.id ?? null : null,
          status: st.status,
          notes: st.notes ?? null,
          respondedAt: st.status === "invited" ? null : new Date(now.getTime() - 2 * DAY_MS),
        },
      });
    }
  }

  // --- chat -----------------------------------------------------------------
  const standing = await provisionStandingChannels({ org, prismaClient: prisma });
  if (badgeDayId) {
    await provisionEventChannel({
      event: { id: badgeDayId, title: DEMO_EVENTS.find((e) => e.key === "badgeday")!.title },
      org,
      audience: "staff",
      prismaClient: prisma,
    });
  }
  const eventChannels = await prisma.channel.findMany({
    where: { orgId: org.id, kind: "event" },
    select: { id: true, eventId: true, audience: true },
  });
  const channelFor = (key: MessageChannel): string => {
    if (key === "troop" || key === "parents" || key === "leaders") return standing[key].id;
    const [eventKey, audience] = key === "badgeday-staff" ? ["badgeday", "staff"] : [key, "families"];
    const ch = eventChannels.find(
      (c) => c.eventId === eventIdByKey.get(eventKey) && (c.audience ?? "families") === audience,
    );
    if (!ch) throw new Error(`no channel for ${key}`);
    return ch.id;
  };
  for (const msg of MESSAGES) {
    const channelId = channelFor(msg.channel);
    const authorId = userOf(msg.from);
    // Seeded authors post where they belong; make sure they're listed.
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: authorId } },
      update: {},
      create: { channelId, userId: authorId },
    });
    await prisma.message.create({
      data: { channelId, authorId, body: msg.body, createdAt: new Date(now.getTime() - msg.ago * 60 * 1000) },
    });
  }

  // --- treasury -------------------------------------------------------------
  const funds = await prisma.fund.findMany({ where: { orgId: org.id }, select: { id: true, code: true } });
  const fundId = (code: string) => {
    const f = funds.find((x) => x.code === code);
    if (!f) throw new Error(`no ${code} fund`);
    return f.id;
  };
  for (const t of TREASURY) {
    await postTransaction({
      orgId: org.id,
      fundId: fundId(t.fund),
      type: t.type,
      amountCents: t.amountCents,
      description: t.description,
      memberId: t.scout ? memberOf(t.scout) : null,
      eventId: t.event ? eventIdByKey.get(t.event) ?? null : null,
      createdById: userOf(treasurer.key),
      postedAt: atDay(now, t.day, "10:00"),
    });
  }

  // --- news -----------------------------------------------------------------
  for (const a of ANNOUNCEMENTS) {
    await prisma.announcement.create({
      data: {
        orgId: org.id,
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        authorId: userOf(leader.key),
        publishedAt: atDay(now, a.day, "09:00"),
        createdAt: atDay(now, a.day, "09:00"),
      },
    });
  }
  for (const p of POSTS) {
    await prisma.post.create({
      data: {
        orgId: org.id,
        authorId: userOf(admin.key),
        title: p.title,
        body: p.body,
        publishedAt: atDay(now, p.day, "20:00"),
        createdAt: atDay(now, p.day, "20:00"),
      },
    });
  }

  // --- advancement and counseling ------------------------------------------
  const counselorUser = userOf(counselor.key);
  for (const badgeSlug of COUNSELOR_BADGES) {
    await prisma.counselorBadge.create({ data: { userId: counselorUser, badgeSlug } });
  }
  for (const a of COUNSELOR_ASSIGNMENTS) {
    await prisma.counselorAssignment.create({
      data: {
        orgId: org.id,
        counselorUserId: counselorUser,
        memberId: memberOf(a.scout),
        badgeSlug: a.badge,
        createdById: userOf(admin.key),
      },
    });
  }
  for (const p of PROGRESS) {
    const signer = p.by === "counselor" ? counselorUser : p.by === "leader" ? userOf(leader.key) : null;
    await prisma.requirementProgress.create({
      data: {
        orgId: org.id,
        memberId: memberOf(p.scout),
        requirementId: p.id,
        status: p.status,
        signedOffById: p.status === "signed_off" ? signer : null,
        signedOffAt: p.status === "signed_off" ? new Date(now.getTime() - 6 * DAY_MS) : null,
        updatedById: signer,
      },
    });
  }
  const meeting = await prisma.counselorMeeting.create({
    data: {
      orgId: org.id,
      counselorUserId: counselorUser,
      badgeSlug: "first-aid",
      startsAt: atDay(now, 6, "18:30"),
      endsAt: atDay(now, 6, "19:30"),
      place: "Maple Ridge Community Center, Room C",
      notes: "Bring your first aid kit list (req 2) and the worksheet.",
    },
    select: { id: true },
  });
  await prisma.counselorMeetingScout.createMany({
    data: ["max", "ben"].map((k) => ({ meetingId: meeting.id, memberId: memberOf(k) })),
  });
  const [messages, transactions] = await Promise.all([
    prisma.message.count({ where: { channel: { orgId: org.id } } }),
    prisma.transaction.count({ where: { orgId: org.id } }),
  ]);
  return {
    orgId: org.id,
    slug: org.slug,
    accounts: DEMO_ACCOUNTS.length,
    members: memberIdByKey.size,
    events: eventCount,
    messages,
    transactions,
  };
}

async function seedBadgeDay(
  orgId: string,
  eventId: string,
  now: Date,
  userOf: (k: string) => string,
  adultByKey: Map<string, DemoAdult>,
  scoutByKey: Map<string, (typeof DEMO_SCOUTS)[number]>,
): Promise<void> {
  const parsed = slotsFromEventFile(JSON.stringify(BADGE_DAY_FILE));
  if ("error" in parsed) throw new Error(`demo badge day file: ${parsed.error}`);
  for (const spec of parsed.slots) {
    const slot = await prisma.signupSlot.create({
      data: { orgId, eventId, key: spec.key, title: spec.title, description: spec.description, capacity: spec.capacity, sortOrder: spec.sortOrder },
      select: { id: true },
    });
    const signups = BADGE_DAY_SIGNUPS[spec.key];
    if (!signups) continue;
    const seats = [
      ...signups.taken.map((k) => ({ k, waitlisted: false })),
      ...(signups.waitlist ?? []).map((k) => ({ k, waitlisted: true })),
    ];
    for (const [i, seat] of seats.entries()) {
      const createdAt = new Date(now.getTime() - (seats.length - i) * 3 * 60 * 60 * 1000);
      const scout = scoutByKey.get(seat.k);
      if (scout) {
        // A scout's seat is held by their parent, scout named by first
        // name and last initial, like a public sign-up.
        const parent = adultByKey.get(scout.parent)!;
        await prisma.slotAssignment.create({
          data: {
            orgId,
            slotId: slot.id,
            name: fullName(parent),
            email: adultEmail(parent),
            scoutName: shortName(scout),
            waitlisted: seat.waitlisted,
            createdAt,
          },
        });
        continue;
      }
      const adult = adultByKey.get(seat.k);
      if (!adult) throw new Error(`unknown demo person ${seat.k}`);
      await prisma.slotAssignment.create({
        data: {
          orgId,
          slotId: slot.id,
          userId: userOf(adult.key),
          name: fullName(adult),
          email: adultEmail(adult),
          waitlisted: seat.waitlisted,
          createdAt,
        },
      });
    }
  }
}

