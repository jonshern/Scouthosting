// Position-based delegation tests. These pin the contract between the
// (free-form) position string on a Member and the set of scopes that
// position implies. The chat / treasurer / advancement gates all rely
// on these checks so we're paranoid about coverage of the well-known
// program titles.

import { describe, it, expect } from "vitest";
import {
  SCOPES,
  scopesForPosition,
  scopesForPositions,
  positionHasScope,
  requireScope,
} from "../lib/permissions.js";

describe("scopesForPosition", () => {
  it("Cubmaster is a unit leader", () => {
    expect(scopesForPosition("Cubmaster").has(SCOPES.UNIT_LEADER)).toBe(true);
  });

  it("Scoutmaster is a unit leader", () => {
    expect(scopesForPosition("Scoutmaster").has(SCOPES.UNIT_LEADER)).toBe(true);
  });

  it("Skipper is a unit leader", () => {
    expect(scopesForPosition("Skipper").has(SCOPES.UNIT_LEADER)).toBe(true);
  });

  it("Crew Advisor + Post Advisor + Troop Leader (Girl Scouts) are unit leaders", () => {
    expect(scopesForPosition("Crew Advisor").has(SCOPES.UNIT_LEADER)).toBe(true);
    expect(scopesForPosition("Post Advisor").has(SCOPES.UNIT_LEADER)).toBe(true);
    expect(scopesForPosition("Troop Leader").has(SCOPES.UNIT_LEADER)).toBe(true);
  });

  it("Assistant Scoutmaster + Mate + Co-Leader are assistants", () => {
    expect(scopesForPosition("Assistant Scoutmaster").has(SCOPES.ASSISTANT_LEADER)).toBe(true);
    expect(scopesForPosition("Mate").has(SCOPES.ASSISTANT_LEADER)).toBe(true);
    expect(scopesForPosition("Co-Leader").has(SCOPES.ASSISTANT_LEADER)).toBe(true);
  });

  it("Committee Chair grants both committee-chair AND committee", () => {
    const s = scopesForPosition("Committee Chair");
    expect(s.has(SCOPES.COMMITTEE_CHAIR)).toBe(true);
    expect(s.has(SCOPES.COMMITTEE)).toBe(true);
  });

  it("Treasurer grants both treasurer AND committee", () => {
    const s = scopesForPosition("Treasurer");
    expect(s.has(SCOPES.TREASURER)).toBe(true);
    expect(s.has(SCOPES.COMMITTEE)).toBe(true);
  });

  it("Cookie Manager grants treasurer (Girl Scouts cookie revenue)", () => {
    expect(scopesForPosition("Cookie Manager").has(SCOPES.TREASURER)).toBe(true);
  });

  it("Service Unit Manager grants committee-chair (Girl Scouts)", () => {
    expect(scopesForPosition("Service Unit Manager").has(SCOPES.COMMITTEE_CHAIR)).toBe(true);
  });

  it("Senior Patrol Leader is a youth-leader (not a patrol-leader)", () => {
    const s = scopesForPosition("Senior Patrol Leader");
    expect(s.has(SCOPES.YOUTH_LEADER)).toBe(true);
    expect(s.has(SCOPES.PATROL_LEADER)).toBe(false);
  });

  it("Patrol Leader / Den Leader / Den Chief share the patrol-leader scope", () => {
    expect(scopesForPosition("Patrol Leader").has(SCOPES.PATROL_LEADER)).toBe(true);
    expect(scopesForPosition("Den Leader").has(SCOPES.PATROL_LEADER)).toBe(true);
    expect(scopesForPosition("Den Chief").has(SCOPES.PATROL_LEADER)).toBe(true);
  });

  it("normalises whitespace and case", () => {
    expect(scopesForPosition("  scoutmaster ").has(SCOPES.UNIT_LEADER)).toBe(true);
    expect(scopesForPosition("Senior  Patrol  Leader").has(SCOPES.YOUTH_LEADER)).toBe(true);
  });

  it("empty / null / unknown positions return empty Set (no implicit privilege)", () => {
    expect(scopesForPosition("").size).toBe(0);
    expect(scopesForPosition(null).size).toBe(0);
    expect(scopesForPosition("Eagle Mentor").size).toBe(0);
  });
});

describe("scopesForPositions", () => {
  it("merges scopes across multiple held positions", () => {
    const s = scopesForPositions(["Committee Chair", "Treasurer"]);
    expect(s.has(SCOPES.COMMITTEE_CHAIR)).toBe(true);
    expect(s.has(SCOPES.COMMITTEE)).toBe(true);
    expect(s.has(SCOPES.TREASURER)).toBe(true);
  });

  it("empty / undefined input returns empty Set", () => {
    expect(scopesForPositions().size).toBe(0);
    expect(scopesForPositions([]).size).toBe(0);
  });
});

describe("positionHasScope", () => {
  it("convenience helper matches scopesForPosition", () => {
    expect(positionHasScope("Treasurer", SCOPES.TREASURER)).toBe(true);
    expect(positionHasScope("Den Leader", SCOPES.TREASURER)).toBe(false);
  });
});

describe("requireScope middleware", () => {
  function fakeReq({ role, position, email = "user@example.com" }) {
    return {
      role,
      member: position ? { position } : null,
      user: { email },
      org: { id: "org1" },
    };
  }
  function fakeRes() {
    const res = { statusCode: 200, body: "" };
    res.status = (n) => { res.statusCode = n; return res; };
    res.type = () => res;
    res.send = (b) => { res.body = b; return res; };
    return res;
  }
  // Stub Prisma — only the lazy-load case calls findFirst; tests set
  // req.member up-front so this rarely fires.
  const fakePrisma = {
    member: {
      findFirst: async () => null,
    },
  };

  it("admins always pass", async () => {
    let called = false;
    const gate = requireScope(fakePrisma, SCOPES.TREASURER);
    await gate(fakeReq({ role: "admin" }), fakeRes(), () => { called = true; });
    expect(called).toBe(true);
  });

  it("leaders pass on broad scopes (committee-chair, committee, unit-leader)", async () => {
    let called = false;
    const gate = requireScope(fakePrisma, SCOPES.COMMITTEE_CHAIR);
    await gate(fakeReq({ role: "leader" }), fakeRes(), () => { called = true; });
    expect(called).toBe(true);
  });

  it("leaders are blocked from narrow scopes (treasurer, secretary, advancement) without a position", async () => {
    let called = false;
    const gate = requireScope(fakePrisma, SCOPES.TREASURER);
    const res = fakeRes();
    await gate(fakeReq({ role: "leader" }), res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("a leader holding the Treasurer position passes the treasurer gate", async () => {
    let called = false;
    const gate = requireScope(fakePrisma, SCOPES.TREASURER);
    await gate(
      fakeReq({ role: "leader", position: "Treasurer" }),
      fakeRes(),
      () => { called = true; },
    );
    expect(called).toBe(true);
  });

  it("a leader holding the Cookie Manager position passes the treasurer gate (GS)", async () => {
    let called = false;
    const gate = requireScope(fakePrisma, SCOPES.TREASURER);
    await gate(
      fakeReq({ role: "leader", position: "Cookie Manager" }),
      fakeRes(),
      () => { called = true; },
    );
    expect(called).toBe(true);
  });

  it("returns a useful 403 message when blocked", async () => {
    const res = fakeRes();
    await requireScope(fakePrisma, SCOPES.TREASURER)(fakeReq({ role: "leader" }), res, () => {});
    expect(res.body).toMatch(/treasurer/i);
    expect(res.body).toMatch(/Scoutmaster|Committee Chair/);
  });

  it("lazy-loads req.member from prisma when not pre-populated", async () => {
    let lookupCalled = false;
    const prisma = {
      member: {
        findFirst: async () => {
          lookupCalled = true;
          return { id: "m1", position: "Treasurer" };
        },
      },
    };
    let next = false;
    const gate = requireScope(prisma, SCOPES.TREASURER);
    await gate(fakeReq({ role: "leader" }), fakeRes(), () => { next = true; });
    expect(lookupCalled).toBe(true);
    expect(next).toBe(true);
  });

  it("admins skip the lazy lookup entirely (hot-path optimisation)", async () => {
    let lookupCalled = false;
    const prisma = {
      member: {
        findFirst: async () => { lookupCalled = true; return null; },
      },
    };
    await requireScope(prisma, SCOPES.TREASURER)(fakeReq({ role: "admin" }), fakeRes(), () => {});
    expect(lookupCalled).toBe(false);
  });
});
