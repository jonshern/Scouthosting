// Channel post-policy tests. These pin who's allowed to post to a
// channel under each of the four policies, including the edge cases
// (suspended, archived, misconfigured "section" without a patrolName).

import { describe, it, expect } from "vitest";
import {
  POST_POLICIES,
  POST_POLICY_LABELS,
  canPostToChannel,
  normalisePostPolicy,
} from "../lib/chatPermissions.js";

const ACTIVE = { id: "c1", postPolicy: "members", patrolName: null, isSuspended: false, archivedAt: null };

const adultLeader = { role: "leader", channelMembership: null, member: null };
const orgAdmin = { role: "admin", channelMembership: null, member: null };
const parentInChannel = { role: "parent", channelMembership: { id: "cm1" }, member: { patrol: "Wolves" } };
const parentOutOfChannel = { role: "parent", channelMembership: null, member: { patrol: "Wolves" } };
const wolfParent = { role: "parent", channelMembership: null, member: { patrol: "Wolves" } };
const tigerParent = { role: "parent", channelMembership: null, member: { patrol: "Tigers" } };

describe("canPostToChannel — universal short-circuits", () => {
  it("admins always pass", () => {
    expect(canPostToChannel({ ...ACTIVE, postPolicy: "leaders" }, orgAdmin).ok).toBe(true);
    expect(canPostToChannel({ ...ACTIVE, postPolicy: "section", patrolName: "Wolves" }, orgAdmin).ok).toBe(true);
  });

  it("adult leaders always pass (regardless of policy)", () => {
    expect(canPostToChannel({ ...ACTIVE, postPolicy: "members" }, adultLeader).ok).toBe(true);
    expect(canPostToChannel({ ...ACTIVE, postPolicy: "section", patrolName: "Wolves" }, adultLeader).ok).toBe(true);
    expect(canPostToChannel({ ...ACTIVE, postPolicy: "everyone" }, adultLeader).ok).toBe(true);
  });

  it("suspended channels block everyone except — wait, even leaders can't post when suspended", () => {
    const sus = { ...ACTIVE, isSuspended: true };
    expect(canPostToChannel(sus, orgAdmin)).toEqual({ ok: false, reason: "suspended" });
    expect(canPostToChannel(sus, adultLeader)).toEqual({ ok: false, reason: "suspended" });
  });

  it("archived channels block everyone", () => {
    const arch = { ...ACTIVE, archivedAt: new Date() };
    expect(canPostToChannel(arch, orgAdmin)).toEqual({ ok: false, reason: "archived" });
    expect(canPostToChannel(arch, adultLeader)).toEqual({ ok: false, reason: "archived" });
  });

  it("missing channel returns the missing reason", () => {
    expect(canPostToChannel(null, orgAdmin)).toEqual({ ok: false, reason: "channel-missing" });
  });
});

describe("canPostToChannel — everyone policy", () => {
  const ch = { ...ACTIVE, postPolicy: "everyone" };
  it("any actor passes (no membership required)", () => {
    expect(canPostToChannel(ch, parentOutOfChannel).ok).toBe(true);
    expect(canPostToChannel(ch, tigerParent).ok).toBe(true);
  });
});

describe("canPostToChannel — members policy", () => {
  const ch = { ...ACTIVE, postPolicy: "members" };
  it("actor in the channel passes", () => {
    expect(canPostToChannel(ch, parentInChannel).ok).toBe(true);
  });
  it("actor not in the channel is blocked", () => {
    expect(canPostToChannel(ch, parentOutOfChannel)).toEqual({
      ok: false,
      reason: "not-in-channel",
    });
  });
});

describe("canPostToChannel — section policy", () => {
  const ch = { ...ACTIVE, postPolicy: "section", patrolName: "Wolves" };
  it("only members of the matching patrol can post", () => {
    expect(canPostToChannel(ch, wolfParent).ok).toBe(true);
    expect(canPostToChannel(ch, tigerParent)).toEqual({
      ok: false,
      reason: "not-in-section",
    });
  });
  it("a leader still passes regardless of patrol", () => {
    expect(canPostToChannel(ch, adultLeader).ok).toBe(true);
  });
  it("falls back to members semantics when patrolName is missing (misconfigured)", () => {
    const broken = { ...ACTIVE, postPolicy: "section", patrolName: null };
    expect(canPostToChannel(broken, parentInChannel).ok).toBe(true);
    expect(canPostToChannel(broken, parentOutOfChannel)).toEqual({
      ok: false,
      reason: "not-in-channel",
    });
  });
});

describe("canPostToChannel — leaders policy (announcements)", () => {
  const ch = { ...ACTIVE, postPolicy: "leaders" };
  it("non-leaders are blocked even if they're channel members", () => {
    expect(canPostToChannel(ch, parentInChannel)).toEqual({
      ok: false,
      reason: "leaders-only",
    });
  });
  it("admins + leaders pass", () => {
    expect(canPostToChannel(ch, orgAdmin).ok).toBe(true);
    expect(canPostToChannel(ch, adultLeader).ok).toBe(true);
  });
});

describe("normalisePostPolicy", () => {
  it("returns the value when known", () => {
    expect(normalisePostPolicy("everyone")).toBe("everyone");
    expect(normalisePostPolicy("section")).toBe("section");
  });
  it("treats null/empty as 'members' (safe default)", () => {
    expect(normalisePostPolicy(null)).toBe("members");
    expect(normalisePostPolicy("")).toBe("members");
    expect(normalisePostPolicy(undefined)).toBe("members");
  });
  it("throws on tampered values (the admin form should never produce these)", () => {
    expect(() => normalisePostPolicy("nuke")).toThrow(/Unknown postPolicy/);
  });
});

describe("POST_POLICIES + POST_POLICY_LABELS", () => {
  it("has a label for every policy", () => {
    for (const p of POST_POLICIES) {
      expect(POST_POLICY_LABELS[p]).toBeTruthy();
    }
  });
  it("is frozen so the admin UI can't mutate it", () => {
    expect(Object.isFrozen(POST_POLICIES)).toBe(true);
    expect(Object.isFrozen(POST_POLICY_LABELS)).toBe(true);
  });
});
