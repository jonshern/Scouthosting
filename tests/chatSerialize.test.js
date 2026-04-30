// Reactions + polls — pure-functional tests on the serializers and the
// poll-attachment normalizer. The HTTP routes themselves need a Postgres
// instance to exercise end-to-end (covered by the integration suite); here
// we test the small bits of logic that don't need a DB.

import { describe, it, expect } from "vitest";

// We import from server/api.js by re-evaluating the handful of helpers
// we want to test. They aren't exported, so we copy them here. Keeping
// them in sync with api.js is a maintenance cost; future cleanup could
// hoist these into a lib/chatSerialize.js shared module if the surface
// grows.

function serializeReactions(rows, viewerUserId) {
  if (!rows || !rows.length) return [];
  const buckets = new Map();
  for (const r of rows) {
    if (!buckets.has(r.emoji)) {
      buckets.set(r.emoji, { emoji: r.emoji, count: 0, youReacted: false });
    }
    const b = buckets.get(r.emoji);
    b.count += 1;
    if (viewerUserId && r.userId === viewerUserId) b.youReacted = true;
  }
  return [...buckets.values()].sort((a, b) =>
    b.count - a.count || a.emoji.localeCompare(b.emoji),
  );
}

const POLL_MAX_OPTIONS = 12;
const POLL_MAX_QUESTION_LEN = 280;
const POLL_MAX_OPTION_LEN = 80;

function normalizePollAttachment(obj) {
  const question = String(obj.question || "").trim().slice(0, POLL_MAX_QUESTION_LEN);
  const optionsRaw = Array.isArray(obj.options) ? obj.options.slice(0, POLL_MAX_OPTIONS) : [];
  const options = optionsRaw
    .map((o, i) => {
      const label = typeof o === "string" ? o : String(o?.label ?? "");
      const trimmed = label.trim().slice(0, POLL_MAX_OPTION_LEN);
      if (!trimmed) return null;
      return {
        id: typeof o?.id === "string" && /^[A-Za-z0-9_-]+$/.test(o.id) ? o.id : `o${i + 1}`,
        label: trimmed,
        votes: [],
      };
    })
    .filter(Boolean);
  if (!question || options.length < 2) return null;
  return {
    kind: "poll",
    question,
    options,
    closesAt: obj.closesAt ? String(obj.closesAt) : null,
    allowMulti: !!obj.allowMulti,
  };
}

function serializeAttachment(att, viewerUserId) {
  if (!att || typeof att !== "object") return null;
  if (att.kind !== "poll") return att;
  return {
    kind: "poll",
    question: att.question,
    closesAt: att.closesAt || null,
    allowMulti: !!att.allowMulti,
    options: (att.options || []).map((o) => ({
      id: o.id,
      label: o.label,
      count: (o.votes || []).length,
      youVoted: !!viewerUserId && (o.votes || []).includes(viewerUserId),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* serializeReactions                                                  */
/* ------------------------------------------------------------------ */

describe("serializeReactions", () => {
  it("returns [] for an empty input", () => {
    expect(serializeReactions([])).toEqual([]);
    expect(serializeReactions(null)).toEqual([]);
  });

  it("buckets by emoji and counts", () => {
    const rows = [
      { emoji: "👍", userId: "u1" },
      { emoji: "👍", userId: "u2" },
      { emoji: "❤️", userId: "u3" },
    ];
    const out = serializeReactions(rows, null);
    expect(out).toEqual([
      { emoji: "👍", count: 2, youReacted: false },
      { emoji: "❤️", count: 1, youReacted: false },
    ]);
  });

  it("flips youReacted when the viewer is one of the reactors", () => {
    const rows = [
      { emoji: "👍", userId: "u1" },
      { emoji: "👍", userId: "u2" },
    ];
    const out = serializeReactions(rows, "u2");
    expect(out[0].youReacted).toBe(true);
  });

  it("sorts most-popular first, with stable tiebreaker on emoji", () => {
    const rows = [
      { emoji: "🔥", userId: "u1" },
      { emoji: "👍", userId: "u2" },
      { emoji: "❤️", userId: "u3" },
    ];
    const out = serializeReactions(rows, null);
    expect(out.map((r) => r.emoji)).toEqual(["❤️", "🔥", "👍"].sort());
    // Three buckets, all count=1; sort tiebreaker is alphabetical-codepoint.
    expect(out.every((r) => r.count === 1)).toBe(true);
  });

  it("youReacted is only true for the reacting bucket, not all of them", () => {
    const rows = [
      { emoji: "👍", userId: "u1" },
      { emoji: "❤️", userId: "u2" },
    ];
    const out = serializeReactions(rows, "u1");
    const thumbs = out.find((r) => r.emoji === "👍");
    const heart = out.find((r) => r.emoji === "❤️");
    expect(thumbs.youReacted).toBe(true);
    expect(heart.youReacted).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* normalizePollAttachment                                             */
/* ------------------------------------------------------------------ */

describe("normalizePollAttachment", () => {
  it("accepts the canonical shape", () => {
    const out = normalizePollAttachment({
      question: "What for Friday?",
      options: ["Tacos", "Pasta", "Chicken"],
    });
    expect(out.kind).toBe("poll");
    expect(out.question).toBe("What for Friday?");
    expect(out.options).toHaveLength(3);
    expect(out.options[0]).toEqual({ id: "o1", label: "Tacos", votes: [] });
    expect(out.allowMulti).toBe(false);
    expect(out.closesAt).toBeNull();
  });

  it("rejects polls with fewer than 2 options", () => {
    expect(normalizePollAttachment({ question: "Q?", options: ["only-one"] })).toBeNull();
    expect(normalizePollAttachment({ question: "Q?", options: [] })).toBeNull();
  });

  it("rejects polls with empty / whitespace-only questions", () => {
    expect(normalizePollAttachment({ question: "   ", options: ["a", "b"] })).toBeNull();
    expect(normalizePollAttachment({ options: ["a", "b"] })).toBeNull();
  });

  it("caps the option count at 12 + the option-label length at 80", () => {
    const long = "x".repeat(120);
    const opts = Array.from({ length: 20 }, () => long);
    const out = normalizePollAttachment({ question: "Q?", options: opts });
    expect(out.options).toHaveLength(12);
    expect(out.options[0].label).toHaveLength(80);
  });

  it("respects an existing safe id, falls back to o{N} otherwise", () => {
    const out = normalizePollAttachment({
      question: "Q?",
      options: [
        { id: "tacos-fri", label: "Tacos" },
        { id: "💥 evil", label: "B" },
        { id: "pasta_3", label: "Pasta" },
      ],
    });
    expect(out.options.map((o) => o.id)).toEqual(["tacos-fri", "o2", "pasta_3"]);
  });

  it("forwards allowMulti + closesAt", () => {
    const out = normalizePollAttachment({
      question: "Q?",
      options: ["a", "b"],
      allowMulti: true,
      closesAt: "2026-05-01T12:00:00Z",
    });
    expect(out.allowMulti).toBe(true);
    expect(out.closesAt).toBe("2026-05-01T12:00:00Z");
  });

  it("rejects non-poll inputs (returns null) — wider parseAttachment guards this", () => {
    expect(normalizePollAttachment({ question: "Q?", options: [{ label: "" }, { label: "" }] })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* serializeAttachment (privacy)                                       */
/* ------------------------------------------------------------------ */

describe("serializeAttachment", () => {
  it("null in, null out", () => {
    expect(serializeAttachment(null)).toBeNull();
    expect(serializeAttachment("not-an-object")).toBeNull();
  });

  it("passes through unknown attachment kinds unchanged", () => {
    const att = { kind: "rsvp", title: "Hike" };
    expect(serializeAttachment(att, "u1")).toEqual(att);
  });

  it("turns poll votes:[userId,...] into count + youVoted", () => {
    const att = {
      kind: "poll",
      question: "Cook?",
      options: [
        { id: "o1", label: "Tacos", votes: ["u1", "u2"] },
        { id: "o2", label: "Pasta", votes: [] },
      ],
      allowMulti: false,
    };
    const out = serializeAttachment(att, "u1");
    expect(out.options[0]).toEqual({ id: "o1", label: "Tacos", count: 2, youVoted: true });
    expect(out.options[1]).toEqual({ id: "o2", label: "Pasta", count: 0, youVoted: false });
  });

  it("never leaks the raw userId arrays in the serialized output", () => {
    const att = {
      kind: "poll",
      question: "Cook?",
      options: [{ id: "o1", label: "Tacos", votes: ["u1", "u2", "u3"] }],
    };
    const out = serializeAttachment(att, "u1");
    expect(out.options[0].votes).toBeUndefined();
  });

  it("youVoted is false when no viewer is supplied", () => {
    const att = {
      kind: "poll",
      question: "Cook?",
      options: [{ id: "o1", label: "Tacos", votes: ["u1"] }],
    };
    const out = serializeAttachment(att, null);
    expect(out.options[0].youVoted).toBe(false);
  });
});
