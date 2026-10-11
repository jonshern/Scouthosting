// /api/v1/events/[id]/slots/[slotId]/{take,release} against a real
// Postgres with real bearer tokens. Runs only with
//   TEST_DATABASE_URL=postgresql://.../compass_test npm test
// Creates its own orgs/users (suffix-tagged) and removes only those.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.FLY_APP_NAME;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import * as take from "@/app/api/v1/events/[id]/slots/[slotId]/take/route";
import * as release from "@/app/api/v1/events/[id]/slots/[slotId]/release/route";
import * as eventDetail from "@/app/api/v1/events/[id]/route";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}s`;

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(
  handler: Handler,
  token: string | null,
  params: Record<string, string>,
  body?: unknown,
  method = "POST",
) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest("http://localhost/api/v1/test", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

const f = {} as {
  org: string;
  other: string;
  a: { id: string; token: string };
  b: { id: string; token: string };
  outsider: { id: string; token: string };
  event: string;
  otherEvent: string;
  one: string;
  noWait: string;
  otherSlot: string;
};

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: { email: `${label}-${S}@example.invalid`, displayName: `${label} ${S}` },
  });
  const token = await issueToken(user.id, "test", prisma);
  return { id: user.id, token: token.raw };
}

async function makeOrg(label: string) {
  return (
    await prisma.org.create({
      data: {
        slug: `${label}-${S}`.toLowerCase(),
        unitType: "Troop",
        unitNumber: "100",
        displayName: `${label} ${S}`,
        charterOrg: "Test",
        city: "Test",
        state: "MN",
        scoutmasterName: "Test",
        scoutmasterEmail: `sm-${S}@example.invalid`,
      },
    })
  ).id;
}

const P = (slot: string, event = f.event) => ({ id: event, slotId: slot });

describe.skipIf(!db)("/api/v1 slot take/release (Postgres)", () => {
  beforeAll(async () => {
    f.org = await makeOrg("v1slots");
    f.other = await makeOrg("v1slotsother");
    f.a = await makeUser("slot-a");
    f.b = await makeUser("slot-b");
    f.outsider = await makeUser("slot-out");
    await prisma.orgMembership.createMany({
      data: [
        { orgId: f.org, userId: f.a.id, role: "parent" },
        { orgId: f.org, userId: f.b.id, role: "parent" },
        { orgId: f.other, userId: f.outsider.id, role: "admin" },
      ],
    });
    const soon = new Date(Date.now() + 7 * 86400_000);
    f.event = (await prisma.event.create({ data: { orgId: f.org, title: "Campout", startsAt: soon } })).id;
    f.otherEvent = (await prisma.event.create({ data: { orgId: f.org, title: "Other", startsAt: soon } })).id;
    const slot = (eventId: string, title: string, capacity: number, allowWaitlist = true) =>
      prisma.signupSlot
        .create({ data: { orgId: f.org, eventId, title, capacity, allowWaitlist } })
        .then((s) => s.id);
    f.one = await slot(f.event, "Driver", 1);
    f.noWait = await slot(f.event, "Cook", 1, false);
    f.otherSlot = await slot(f.otherEvent, "Other", 5);
  });

  afterAll(async () => {
    const users = [f.a, f.b, f.outsider].filter(Boolean).map((u) => u.id);
    await prisma.org.deleteMany({ where: { id: { in: [f.org, f.other].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: users.map((u) => ({ key: { startsWith: `v1:user:${u}` } })) },
    });
  });

  it("takes a seat, idempotently", async () => {
    const r = await call(take.POST as Handler, f.a.token, P(f.one), { notes: "Minivan, 6 seats" });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, waitlisted: false });
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect((await call(take.POST as Handler, f.a.token, P(f.one), {})).json).toEqual({ ok: true, waitlisted: false });
    const rows = await prisma.slotAssignment.findMany({ where: { slotId: f.one } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: f.a.id, notes: "Minivan, 6 seats", waitlisted: false });
  });

  it("waitlists when full, shows the caller's seat, and release promotes the waitlister", async () => {
    expect((await call(take.POST as Handler, f.b.token, P(f.one), {})).json).toEqual({ ok: true, waitlisted: true });

    const detail = await call(eventDetail.GET as Handler, f.b.token, { id: f.event }, undefined, "GET");
    const slots = (detail.json.event as { slots: { id: string; mine: string | null }[] }).slots;
    expect(slots.find((s) => s.id === f.one)?.mine).toBe("waitlisted");

    const rel = await call(release.POST as Handler, f.a.token, P(f.one));
    expect(rel.status).toBe(200);
    expect(rel.json).toEqual({ ok: true, released: true });
    const rows = await prisma.slotAssignment.findMany({ where: { slotId: f.one } });
    expect(rows).toEqual([expect.objectContaining({ userId: f.b.id, waitlisted: false })]);

    // Releasing again is a no-op, still ok.
    expect((await call(release.POST as Handler, f.a.token, P(f.one))).json).toEqual({ ok: true, released: false });
  });

  it("409 slot_full when full and the slot has no waitlist", async () => {
    expect((await call(take.POST as Handler, f.a.token, P(f.noWait), {})).status).toBe(200);
    const r = await call(take.POST as Handler, f.b.token, P(f.noWait), {});
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "slot_full" });
  });

  it("hides other orgs' events and mismatched slots as 404; needs a token", async () => {
    expect((await call(take.POST as Handler, f.outsider.token, P(f.one), {})).json).toEqual({ error: "not_found" });
    expect((await call(take.POST as Handler, f.a.token, P(f.otherSlot), {})).status).toBe(404);
    expect((await call(release.POST as Handler, f.a.token, P("nope"))).status).toBe(404);
    expect((await call(take.POST as Handler, null, P(f.one), {})).status).toBe(401);
  });

  it("validates the body", async () => {
    const r = await call(take.POST as Handler, f.a.token, P(f.otherSlot, f.otherEvent), { notes: "x".repeat(201) });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ error: "notes_too_long" });
  });
});
