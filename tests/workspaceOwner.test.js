// Workspace-owner gate tests. Pin the contract for isOwnerOfOrg and the
// requireOwner middleware — both should treat ownership as a narrow
// superpower (billing, plan-change, delete, transfer) that only fires
// for the user recorded as `Org.ownerId`. Owners also hold an admin
// OrgMembership row, so all the "any admin" gates already let them
// through; this gate adds the second tier.

import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("../lib/db.js", () => ({
  prisma: {
    org: { findUnique: (...args) => findUniqueMock(...args) },
    // Lucia's PrismaAdapter takes references to these at module-load
    // time but doesn't call methods on them in our tests.
    session: {},
    user: {},
    orgMembership: { findUnique: async () => null },
  },
}));

const { isOwnerOfOrg, requireOwner } = await import("../lib/auth.js");

beforeEach(() => findUniqueMock.mockReset());

describe("isOwnerOfOrg", () => {
  it("returns true when userId matches Org.ownerId", async () => {
    findUniqueMock.mockResolvedValue({ ownerId: "u1" });
    expect(await isOwnerOfOrg("u1", "o1")).toBe(true);
  });

  it("returns false when userId does not match", async () => {
    findUniqueMock.mockResolvedValue({ ownerId: "u1" });
    expect(await isOwnerOfOrg("u2", "o1")).toBe(false);
  });

  it("returns false when the org has no owner yet", async () => {
    findUniqueMock.mockResolvedValue({ ownerId: null });
    expect(await isOwnerOfOrg("u1", "o1")).toBe(false);
  });

  it("returns false on missing inputs", async () => {
    expect(await isOwnerOfOrg(null, "o1")).toBe(false);
    expect(await isOwnerOfOrg("u1", null)).toBe(false);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});

describe("requireOwner", () => {
  function fakeRes() {
    return {
      statusCode: 200,
      body: "",
      headers: {},
      status(c) { this.statusCode = c; return this; },
      type() { return this; },
      send(b) { this.body = b; return this; },
      redirect(loc) { this.statusCode = 302; this.body = loc; return this; },
    };
  }

  it("calls next when the user is the recorded owner", async () => {
    findUniqueMock.mockResolvedValue({ ownerId: "u1" });
    let called = false;
    await requireOwner(
      { org: { id: "o1" }, user: { id: "u1" } },
      fakeRes(),
      () => { called = true; },
    );
    expect(called).toBe(true);
  });

  it("403s when the user is an admin but not the owner", async () => {
    findUniqueMock.mockResolvedValue({ ownerId: "u-other" });
    const res = fakeRes();
    let called = false;
    await requireOwner(
      { org: { id: "o1" }, user: { id: "u1" } },
      res,
      () => { called = true; },
    );
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatch(/owner/i);
  });

  it("404s requests with no resolved org (apex / unknown subdomain)", async () => {
    const res = fakeRes();
    await requireOwner({ org: null, user: { id: "u1" } }, res, () => {});
    expect(res.statusCode).toBe(404);
  });

  it("redirects unauthenticated callers to the admin login", async () => {
    const res = fakeRes();
    await requireOwner({ org: { id: "o1" }, user: null }, res, () => {});
    expect(res.statusCode).toBe(302);
    expect(res.body).toBe("/admin/login");
  });
});
