// Dashboard view-model tests. The dashboard helper is a pure function of
// (prisma, orgId, now) — these tests pin the shape so the AdminBalanced
// template can rely on it.

import { describe, it, expect } from "vitest";
import {
  buildDashboardModel,
  categoryColor,
  greetingFor,
} from "../lib/dashboard.js";

function fakePrisma({
  members = [],
  events = [],
  rsvps = [],
  reimbursements = [],
  messages = [],
  photos = [],
  posts = [],
} = {}) {
  function within(records, where, dateField) {
    return records.filter((r) => {
      if (where.orgId && r.orgId !== where.orgId) return false;
      if (where.isYouth !== undefined && r.isYouth !== where.isYouth) return false;
      if (where.status && r.status !== where.status) return false;
      if (where.deletedAt === null && r.deletedAt) return false;
      if (where[dateField]?.gte && new Date(r[dateField]) < where[dateField].gte) return false;
      if (where.response && r.response !== where.response) return false;
      if (where.eventId?.in && !where.eventId.in.includes(r.eventId)) return false;
      return true;
    });
  }
  return {
    member: {
      count: async ({ where }) => within(members, where).length,
      findMany: async ({ where, take }) => within(members, where).slice(0, take),
    },
    event: {
      findMany: async ({ where, take }) =>
        within(events, where, "startsAt")
          .sort((a, b) => a.startsAt - b.startsAt)
          .slice(0, take)
          .map((e) => ({ ...e, _count: { rsvps: rsvps.filter((r) => r.eventId === e.id).length } })),
    },
    rsvp: {
      findMany: async ({ where, take }) =>
        within(rsvps, where, "createdAt")
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, take)
          .map((r) => ({
            ...r,
            event: events.find((e) => e.id === r.eventId) || null,
          })),
      groupBy: async ({ where }) => {
        const filtered = within(rsvps, where);
        const grouped = new Map();
        for (const r of filtered) {
          grouped.set(r.eventId, (grouped.get(r.eventId) || 0) + 1);
        }
        return [...grouped.entries()].map(([eventId, count]) => ({
          eventId,
          _count: { _all: count },
        }));
      },
    },
    reimbursement: {
      count: async ({ where }) => within(reimbursements, where).length,
      aggregate: async ({ where }) => ({
        _sum: {
          amountCents: within(reimbursements, where).reduce(
            (s, r) => s + r.amountCents,
            0
          ),
        },
      }),
      findMany: async ({ where, take }) =>
        within(reimbursements, where, "submittedAt")
          .sort((a, b) => b.submittedAt - a.submittedAt)
          .slice(0, take),
    },
    message: {
      count: async ({ where }) => within(messages, where, "createdAt").length,
    },
    photo: {
      count: async ({ where }) => within(photos, where, "createdAt").length,
    },
    post: {
      findMany: async ({ where, take }) =>
        within(posts, where, "publishedAt")
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, take)
          .map((p) => ({ ...p, author: p.authorDisplay ? { displayName: p.authorDisplay } : null })),
    },
  };
}

describe("greetingFor", () => {
  it("uses italic-accent phase for evening", () => {
    const g = greetingFor(new Date("2026-05-05T19:30:00Z")); // Tuesday 7:30pm UTC
    expect(g.day).toBe("Tuesday");
    expect(g.phase).toBe("evening.");
  });
  it("uses morning before noon", () => {
    const g = greetingFor(new Date("2026-05-04T09:00:00Z")); // Monday 9am
    expect(g.day).toBe("Monday");
    expect(g.phase).toBe("morning.");
  });
  it("uses 'late.' for predawn hours", () => {
    const g = greetingFor(new Date("2026-05-05T03:00:00Z"));
    expect(g.phase).toBe("late.");
  });
});

describe("categoryColor", () => {
  it("maps known categories to consistent tokens", () => {
    expect(categoryColor("meeting")).toBe("sky");
    expect(categoryColor("campout")).toBe("accent");
    expect(categoryColor("court-of-honor")).toBe("raspberry");
  });
  it("normalises whitespace + case", () => {
    expect(categoryColor("Court of Honor")).toBe("raspberry");
  });
  it("falls back to primary for unknown categories", () => {
    expect(categoryColor("not-a-real-category")).toBe("primary");
    expect(categoryColor(null)).toBe("primary");
  });
});

describe("buildDashboardModel", () => {
  const NOW = new Date("2026-05-05T19:00:00Z");
  const orgId = "org1";

  it("counts youth + adults separately", async () => {
    const prisma = fakePrisma({
      members: [
        { id: "1", orgId, isYouth: true, firstName: "A", lastName: "B" },
        { id: "2", orgId, isYouth: true, firstName: "C", lastName: "D" },
        { id: "3", orgId, isYouth: false, firstName: "E", lastName: "F" },
      ],
    });
    const model = await buildDashboardModel({ prisma, orgId, now: NOW });
    expect(model.stats.scouts.value).toBe(2);
    expect(model.stats.scouts.hint).toBe("1 adult leader");
  });

  it("attaches yes-RSVP counts to upcoming events and picks color by category", async () => {
    const evId = "ev1";
    const prisma = fakePrisma({
      events: [
        {
          id: evId,
          orgId,
          title: "PLC",
          startsAt: new Date("2026-05-06T01:00:00Z"),
          category: "meeting",
          capacity: 12,
        },
      ],
      rsvps: [
        { id: "r1", orgId, eventId: evId, response: "yes", name: "X", createdAt: NOW },
        { id: "r2", orgId, eventId: evId, response: "yes", name: "Y", createdAt: NOW },
        { id: "r3", orgId, eventId: evId, response: "no", name: "Z", createdAt: NOW },
      ],
    });
    const model = await buildDashboardModel({ prisma, orgId, now: NOW });
    expect(model.events).toHaveLength(1);
    expect(model.events[0].yes).toBe(2);
    expect(model.events[0].capacity).toBe(12);
    expect(model.events[0].color).toBe("sky");
  });

  it("aggregates pending reimbursement totals into the treasurer stat", async () => {
    const prisma = fakePrisma({
      reimbursements: [
        {
          id: "r1",
          orgId,
          status: "pending",
          amountCents: 1500,
          purpose: "x",
          requesterName: "A",
          submittedAt: NOW,
        },
        {
          id: "r2",
          orgId,
          status: "pending",
          amountCents: 8500,
          purpose: "y",
          requesterName: "B",
          submittedAt: NOW,
        },
        {
          id: "r3",
          orgId,
          status: "paid",
          amountCents: 99900,
          purpose: "z",
          requesterName: "C",
          submittedAt: NOW,
        },
      ],
    });
    const model = await buildDashboardModel({ prisma, orgId, now: NOW });
    expect(model.stats.treasurer.value).toBe("$100");
    expect(model.stats.treasurer.hint).toBe("2 reimbursements pending");
  });

  it("merges + sorts the activity stream by recency across kinds", async () => {
    const t0 = new Date(NOW.getTime() - 60_000);
    const t1 = new Date(NOW.getTime() - 120_000);
    const t2 = new Date(NOW.getTime() - 180_000);
    const prisma = fakePrisma({
      events: [{ id: "e1", orgId, title: "Trek", startsAt: NOW }],
      rsvps: [
        {
          id: "r1",
          orgId,
          eventId: "e1",
          response: "yes",
          name: "Sara",
          createdAt: t0,
        },
      ],
      reimbursements: [
        {
          id: "rm1",
          orgId,
          status: "pending",
          amountCents: 8500,
          purpose: "fuel",
          requesterName: "Alex",
          submittedAt: t2,
        },
      ],
      posts: [
        {
          id: "p1",
          orgId,
          title: "Recap",
          body: "...",
          publishedAt: t1,
          authorDisplay: "Leader",
        },
      ],
    });
    const model = await buildDashboardModel({ prisma, orgId, now: NOW });
    expect(model.activity.map((a) => a.kind)).toEqual([
      "rsvp",
      "post",
      "reimbursement",
    ]);
    expect(model.activity[0].who).toBe("Sara");
  });

  it("handles empty orgs without crashing", async () => {
    const prisma = fakePrisma();
    const model = await buildDashboardModel({ prisma, orgId, now: NOW });
    expect(model.events).toEqual([]);
    expect(model.activity).toEqual([]);
    expect(model.stats.scouts.value).toBe(0);
    expect(model.stats.rsvps.value).toBe("—");
    expect(model.stats.treasurer.value).toBe("$0");
    expect(model.rosterPreview).toEqual([]);
  });
});
