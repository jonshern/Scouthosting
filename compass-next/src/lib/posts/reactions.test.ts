import { describe, expect, it } from "vitest";
import {
  decideToggle,
  normaliseReactionKind,
  summariseReactions,
} from "./reactions";

describe("posts/reactions", () => {
  it("normaliseReactionKind accepts known kinds", () => {
    expect(normaliseReactionKind("like")).toBe("like");
    expect(normaliseReactionKind("bookmark")).toBe("bookmark");
    expect(() => normaliseReactionKind("upvote")).toThrow(/Unknown reaction kind/);
  });

  it("decideToggle inserts when not existing, deletes when existing", () => {
    expect(decideToggle({ existing: null, kind: "like" })).toBe("insert");
    expect(decideToggle({ existing: { id: "x" }, kind: "like" })).toBe("delete");
  });

  it("summariseReactions counts likes publicly, bookmarks privately", () => {
    const rows = [
      { postId: "p1", userId: "u1", kind: "like" },
      { postId: "p1", userId: "u2", kind: "like" },
      { postId: "p1", userId: "u1", kind: "bookmark" },
      { postId: "p1", userId: "u3", kind: "bookmark" }, // not viewer's
    ];
    const out = summariseReactions(rows, "u1");
    const s = out.get("p1");
    expect(s?.likes).toBe(2);
    expect(s?.bookmarks).toBe(1); // only viewer's bookmark counted
    expect(s?.youLiked).toBe(true);
    expect(s?.youBookmarked).toBe(true);
  });

  it("non-viewer gets bookmarks=0", () => {
    const rows = [
      { postId: "p1", userId: "u1", kind: "bookmark" },
      { postId: "p1", userId: "u2", kind: "bookmark" },
    ];
    const out = summariseReactions(rows, null);
    expect(out.get("p1")?.bookmarks).toBe(0);
    expect(out.get("p1")?.youBookmarked).toBe(false);
  });
});
