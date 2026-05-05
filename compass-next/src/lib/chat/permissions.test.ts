import { describe, expect, it } from "vitest";
import {
  POST_POLICIES,
  canPostToChannel,
  normalisePostPolicy,
} from "./permissions";

const channel = (over: object = {}) => ({
  id: "ch1",
  postPolicy: "members" as const,
  patrolName: null,
  isSuspended: false,
  archivedAt: null,
  ...over,
});

const parent = { role: "parent" };
const leader = { role: "leader" };
const admin = { role: "admin" };

describe("chat/permissions/canPostToChannel — gates", () => {
  it("rejects null channel", () => {
    expect(canPostToChannel(null, leader)).toEqual({ ok: false, reason: "channel-missing" });
  });

  it("rejects archived channel even for admin", () => {
    expect(canPostToChannel(channel({ archivedAt: new Date() }), admin)).toEqual({
      ok: false,
      reason: "archived",
    });
  });

  it("rejects suspended channel even for admin", () => {
    expect(canPostToChannel(channel({ isSuspended: true }), admin)).toEqual({
      ok: false,
      reason: "suspended",
    });
  });
});

describe("chat/permissions/canPostToChannel — leaders pass everything", () => {
  it("admin passes any policy", () => {
    expect(canPostToChannel(channel({ postPolicy: "leaders" }), admin).ok).toBe(true);
    expect(canPostToChannel(channel({ postPolicy: "members" }), admin).ok).toBe(true);
    expect(canPostToChannel(channel({ postPolicy: "section" }), admin).ok).toBe(true);
    expect(canPostToChannel(channel({ postPolicy: "everyone" }), admin).ok).toBe(true);
  });

  it("leader role passes any policy", () => {
    expect(canPostToChannel(channel({ postPolicy: "leaders" }), leader).ok).toBe(true);
  });

  it("isLeader=true convenience flag passes", () => {
    expect(
      canPostToChannel(channel({ postPolicy: "leaders" }), { role: "parent", isLeader: true }).ok,
    ).toBe(true);
  });

  it("unit-leader scope counts as leader", () => {
    const cubmaster = { role: "parent", scopes: new Set(["unit-leader"]) };
    expect(canPostToChannel(channel({ postPolicy: "leaders" }), cubmaster).ok).toBe(true);
  });
});

describe("chat/permissions/canPostToChannel — policy 'everyone'", () => {
  it("passes for any non-leader org member", () => {
    expect(canPostToChannel(channel({ postPolicy: "everyone" }), parent).ok).toBe(true);
  });
});

describe("chat/permissions/canPostToChannel — policy 'members'", () => {
  it("rejects when no channelMembership", () => {
    const r = canPostToChannel(channel({ postPolicy: "members" }), parent);
    expect(r).toEqual({ ok: false, reason: "not-in-channel" });
  });

  it("passes with a channelMembership row", () => {
    const r = canPostToChannel(channel({ postPolicy: "members" }), {
      ...parent,
      channelMembership: { role: "member" },
    });
    expect(r.ok).toBe(true);
  });
});

describe("chat/permissions/canPostToChannel — policy 'section'", () => {
  it("rejects when actor's patrol doesn't match", () => {
    const r = canPostToChannel(
      channel({ postPolicy: "section", patrolName: "Wolf" }),
      { ...parent, member: { patrol: "Tiger" } },
    );
    expect(r).toEqual({ ok: false, reason: "not-in-section" });
  });

  it("passes when actor.member.patrol === channel.patrolName", () => {
    const r = canPostToChannel(
      channel({ postPolicy: "section", patrolName: "Wolf" }),
      { ...parent, member: { patrol: "Wolf" } },
    );
    expect(r.ok).toBe(true);
  });

  it("falls back to members semantics when section channel has no patrolName", () => {
    const noMembership = canPostToChannel(channel({ postPolicy: "section" }), parent);
    expect(noMembership).toEqual({ ok: false, reason: "not-in-channel" });

    const withMembership = canPostToChannel(channel({ postPolicy: "section" }), {
      ...parent,
      channelMembership: { role: "member" },
    });
    expect(withMembership.ok).toBe(true);
  });
});

describe("chat/permissions/canPostToChannel — policy 'leaders'", () => {
  it("rejects non-leader, non-owner", () => {
    expect(canPostToChannel(channel({ postPolicy: "leaders" }), parent)).toEqual({
      ok: false,
      reason: "leaders-only",
    });
  });

  it("channel-owner role can post on a leaders channel", () => {
    const denLeader = { ...parent, channelMembership: { role: "owner" as const } };
    expect(canPostToChannel(channel({ postPolicy: "leaders" }), denLeader).ok).toBe(true);
  });
});

describe("chat/permissions/normalisePostPolicy", () => {
  it("returns 'members' for empty/null", () => {
    expect(normalisePostPolicy(null)).toBe("members");
    expect(normalisePostPolicy("")).toBe("members");
    expect(normalisePostPolicy(undefined)).toBe("members");
  });

  it("returns the input for known values", () => {
    for (const p of POST_POLICIES) {
      expect(normalisePostPolicy(p)).toBe(p);
    }
  });

  it("throws for unknown values", () => {
    expect(() => normalisePostPolicy("everyone-and-grandma")).toThrow(/Unknown postPolicy/);
  });
});
