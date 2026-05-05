import { beforeEach, describe, expect, it } from "vitest";
import { _resetAllForTests, consume } from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(() => _resetAllForTests());

  it("allows up to the limit then denies", () => {
    expect(consume("k", 3, 60_000).ok).toBe(true);
    expect(consume("k", 3, 60_000).ok).toBe(true);
    expect(consume("k", 3, 60_000).ok).toBe(true);
    expect(consume("k", 3, 60_000).ok).toBe(false);
  });

  it("resets after the window", () => {
    const t0 = 1_000_000;
    expect(consume("k", 1, 1000, t0).ok).toBe(true);
    expect(consume("k", 1, 1000, t0).ok).toBe(false);
    expect(consume("k", 1, 1000, t0 + 1500).ok).toBe(true);
  });

  it("isolates buckets by key", () => {
    expect(consume("a", 1, 60_000).ok).toBe(true);
    expect(consume("b", 1, 60_000).ok).toBe(true);
    expect(consume("a", 1, 60_000).ok).toBe(false);
  });
});
