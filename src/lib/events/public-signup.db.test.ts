// POST /api/events/[slug]/signups against a real Postgres: the route
// handler, the slot row lock and the unique constraints. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Creates its own org (suffix-tagged) and removes only what it made.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/events/[slug]/signups/route";
import { SIGNUP_LIMITS } from "./public-signup";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
let ipSeq = 0;
const ips: string[] = [];
const emails = new Set<string>();

function nextIp() {
  ipSeq += 1;
  const ip = `10.${(process.pid >> 8) & 255}.${process.pid & 255}.${ipSeq}`;
  ips.push(ip);
  return ip;
}

async function post(slug: string, body: unknown, opts: { contentType?: string; ip?: string } = {}) {
  const b = body as { guardian?: { email?: string } };
  if (b?.guardian?.email) emails.add(b.guardian.email.toLowerCase());
  const req = new NextRequest(`http://localhost/api/events/${slug}/signups`, {
    method: "POST",
    headers: {
      "content-type": opts.contentType ?? "application/json",
      "x-forwarded-for": opts.ip ?? nextIp(),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ slug }) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

const f = {} as {
  orgId: string;
  slug: string;
  eventId: string;
  closedSlug: string;
  slots: Record<string, string>;
};

const guardian = (n: string) => ({ name: `Parent ${n}`, email: `p-${n}-${S}@example.invalid`, phone: "612-555-0100" });

const signup = (over: Record<string, unknown> = {}) => ({
  eventSlug: f.slug,
  guardian: guardian("a"),
  scoutName: "Alex P.",
  unit: "Troop 100",
  stationIds: ["open"],
  volunteerRoles: [] as string[],
  ...over,
});

describe.skipIf(!db)("POST /api/events/[slug]/signups (Postgres)", () => {
  beforeAll(async () => {
    const org = await prisma.org.create({
      data: {
        slug: `signups-${S}`,
        unitType: "Troop",
        unitNumber: "100",
        displayName: `Signups ${S}`,
        charterOrg: "Test",
        city: "Test",
        state: "MN",
        scoutmasterName: "Test",
        scoutmasterEmail: `sm-${S}@example.invalid`,
      },
    });
    f.orgId = org.id;
    f.slug = `badge-day-${S}`;
    f.closedSlug = `closed-day-${S}`;
    const soon = new Date(Date.now() + 7 * 86400_000);
    const event = await prisma.event.create({
      data: { orgId: org.id, title: "Badge day", startsAt: soon, signupRequired: true, publicSlug: f.slug },
    });
    f.eventId = event.id;
    await prisma.event.create({
      data: { orgId: org.id, title: "Members only", startsAt: soon, signupRequired: false, publicSlug: f.closedSlug },
    });
    const mk = async (key: string, title: string, capacity: number, allowWaitlist = true) =>
      (
        await prisma.signupSlot.create({
          data: { orgId: org.id, eventId: event.id, key, title, capacity, allowWaitlist },
        })
      ).id;
    f.slots = {
      open: await mk("station:open", "First Aid", 50),
      small: await mk("station:small", "Chemistry", 1),
      race: await mk("station:race", "Archery", 1),
      closed: await mk("station:closed", "Climbing", 1, false),
      grill: await mk("role:grill", "Volunteer: Grill", 5),
    };
  });

  afterAll(async () => {
    if (f.orgId) await prisma.org.delete({ where: { id: f.orgId } }).catch(() => {});
    await prisma.rateLimitBucket.deleteMany({
      where: {
        key: { in: [...ips.map((ip) => `signup:ip:${ip}`), ...[...emails].map((e) => `signup:email:${e}`)] },
      },
    });
  });

  const rows = (slot: string) =>
    prisma.slotAssignment.findMany({ where: { slotId: f.slots[slot] }, orderBy: { createdAt: "asc" } });

  it("confirms a station and a volunteer role, storing only first name + initial", async () => {
    const g = guardian("confirm");
    const r = await post(f.slug, signup({ guardian: { ...g, email: g.email.toUpperCase() }, volunteerRoles: ["grill"] }));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: "confirmed" });
    expect(r.headers.get("cache-control")).toContain("no-store");

    const seat = (await rows("open")).find((a) => a.email === g.email)!;
    expect(seat).toMatchObject({
      name: g.name,
      email: g.email,
      phone: "612-555-0100",
      scoutName: "Alex P.",
      notes: "Unit: Troop 100",
      userId: null,
      waitlisted: false,
    });
    const vol = (await rows("grill")).find((a) => a.email === g.email)!;
    expect(vol).toMatchObject({ name: g.name, scoutName: "", waitlisted: false });
  });

  it("is idempotent for the same scout, and seats a second scout of the same guardian", async () => {
    const g = guardian("twice");
    const first = await post(f.slug, signup({ guardian: g }));
    const again = await post(f.slug, signup({ guardian: g, scoutName: " Alex  P. " }));
    const sibling = await post(f.slug, signup({ guardian: g, scoutName: "Sam P." }));
    expect([first.status, again.status, sibling.status]).toEqual([200, 200, 200]);
    expect(again.json).toEqual(first.json);
    const mine = (await rows("open")).filter((a) => a.email === g.email);
    expect(mine.map((a) => a.scoutName).sort()).toEqual(["Alex P.", "Sam P."]);
  });

  it("waitlists a full station and names it; a resubmit keeps the waitlist spot", async () => {
    const a = await post(f.slug, signup({ guardian: guardian("w1"), stationIds: ["small"] }));
    expect(a.json).toEqual({ status: "confirmed" });
    const body = signup({ guardian: guardian("w2"), stationIds: ["open", "small"] });
    const b = await post(f.slug, body);
    expect(b.status).toBe(200);
    expect(b.json).toEqual({ status: "waitlisted", waitlistedStationIds: ["small"] });
    expect(await post(f.slug, body).then((r) => r.json)).toEqual(b.json);
    expect((await rows("small")).map((x) => x.waitlisted)).toEqual([false, true]);
  });

  it("409s when a slot is full without a waitlist, and keeps nothing from that request", async () => {
    expect((await post(f.slug, signup({ guardian: guardian("c1"), stationIds: ["closed"] }))).status).toBe(200);
    const g = guardian("c2");
    const r = await post(f.slug, signup({ guardian: g, stationIds: ["open", "closed"] }));
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: "slot_full", message: "Climbing is full.", stationId: "closed" });
    expect((await rows("open")).some((a) => a.email === g.email)).toBe(false);
  });

  it("two parallel requests for the last spot: one confirmed, one waitlisted", async () => {
    const [x, y] = await Promise.all([
      post(f.slug, signup({ guardian: guardian("r1"), stationIds: ["race"] })),
      post(f.slug, signup({ guardian: guardian("r2"), stationIds: ["race"] })),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect([x.json.status, y.json.status].sort()).toEqual(["confirmed", "waitlisted"]);
    const all = await rows("race");
    expect(all.filter((a) => !a.waitlisted)).toHaveLength(1);
    expect(all).toHaveLength(2);
  });

  it("404s an unknown slug and an event that isn't taking sign-ups", async () => {
    const unknown = await post(`nope-${S}`, signup({ eventSlug: undefined }));
    expect(unknown.status).toBe(404);
    expect(unknown.json).toMatchObject({ error: "event_not_found", message: expect.any(String) });
    expect((await post(f.closedSlug, signup({ eventSlug: f.closedSlug }))).status).toBe(404);
    expect((await post("Bad_Slug!", signup({ eventSlug: undefined }))).status).toBe(404);
  });

  it("400s unknown station and role ids, naming them", async () => {
    const r = await post(f.slug, signup({ stationIds: ["open", "ghost"], volunteerRoles: ["grill", "dj"] }));
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({
      error: "unknown_ids",
      unknownStationIds: ["ghost"],
      unknownVolunteerRoles: ["dj"],
    });
  });

  it("400s bad input with a message; 415s non-JSON", async () => {
    const r = await post(f.slug, signup({ scoutName: "Alexander Parker" }));
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ error: "invalid_request" });
    expect(String(r.json.message)).toMatch(/first name and last initial/);
    expect((await post(f.slug, "{not json")).json).toMatchObject({ error: "bad_json", message: expect.any(String) });
    const form = await post(f.slug, "a=b", { contentType: "application/x-www-form-urlencoded" });
    expect(form.status).toBe(415);
  });

  it("rate-limits per guardian email (429 with Retry-After)", async () => {
    const g = guardian("limited");
    await prisma.rateLimitBucket.create({
      data: {
        key: `signup:email:${g.email}`,
        count: SIGNUP_LIMITS.email.limit,
        resetAt: new Date(Date.now() + 60_000),
      },
    });
    emails.add(g.email);
    const r = await post(f.slug, signup({ guardian: g }));
    expect(r.status).toBe(429);
    expect(r.json).toMatchObject({ error: "rate_limited", message: expect.any(String) });
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
});
