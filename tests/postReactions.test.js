// Activity-feed reaction policy tests.

import { describe, it, expect } from "vitest";
import {
  REACTION_KINDS,
  normaliseReactionKind,
  decideToggle,
  summariseReactions,
} from "../lib/postReactions.js";

describe("normaliseReactionKind", () => {
  it("accepts known kinds", () => {
    for (const k of REACTION_KINDS) {
      expect(normaliseReactionKind(k)).toBe(k);
    }
  });
  it("throws on unknown kinds", () => {
    expect(() => normaliseReactionKind("haha")).toThrow(/Unknown reaction kind/);
    expect(() => normaliseReactionKind("")).toThrow();
  });
});

describe("decideToggle", () => {
  it("inserts when no existing reaction", () => {
    expect(decideToggle({ existing: null, kind: "like" })).toBe("insert");
  });
  it("deletes when an existing reaction is present", () => {
    expect(decideToggle({ existing: { id: "x" }, kind: "like" })).toBe("delete");
  });
});

describe("summariseReactions", () => {
  it("counts likes publicly + flags youLiked when the viewer liked", () => {
    const rows = [
      { postId: "p1", userId: "u1", kind: "like" },
      { postId: "p1", userId: "u2", kind: "like" },
      { postId: "p1", userId: "u3", kind: "like" },
    ];
    const summary = summariseReactions(rows, "u1");
    expect(summary.get("p1").likes).toBe(3);
    expect(summary.get("p1").youLiked).toBe(true);
  });

  it("treats bookmarks as private — only the viewer's own bookmark counts", () => {
    const rows = [
      { postId: "p1", userId: "u1", kind: "bookmark" },
      { postId: "p1", userId: "u2", kind: "bookmark" },
      { postId: "p1", userId: "u3", kind: "bookmark" },
    ];
    const asU1 = summariseReactions(rows, "u1");
    expect(asU1.get("p1").bookmarks).toBe(1);
    expect(asU1.get("p1").youBookmarked).toBe(true);

    const asU99 = summariseReactions(rows, "u99");
    expect(asU99.get("p1").bookmarks).toBe(0);
    expect(asU99.get("p1").youBookmarked).toBe(false);
  });

  it("rolls up per-post separately", () => {
    const rows = [
      { postId: "p1", userId: "u1", kind: "like" },
      { postId: "p2", userId: "u1", kind: "like" },
      { postId: "p2", userId: "u2", kind: "like" },
    ];
    const s = summariseReactions(rows, "u1");
    expect(s.get("p1").likes).toBe(1);
    expect(s.get("p2").likes).toBe(2);
  });

  it("returns an empty map when no rows", () => {
    expect(summariseReactions([], "u1").size).toBe(0);
  });
});
