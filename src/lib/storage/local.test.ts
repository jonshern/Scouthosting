import { describe, expect, it } from "vitest";
import { buildKey, del, get, head, put } from "./local";

describe("local storage", () => {
  it("rejects unsafe keys", async () => {
    await expect(put("../escape", Buffer.from(""))).rejects.toThrow(/unsafe/);
    await expect(put("/abs/path", Buffer.from(""))).rejects.toThrow(/unsafe/);
  });

  it("put + head + get + del round-trip", async () => {
    const key = `tests/${Date.now()}-roundtrip.txt`;
    await put(key, Buffer.from("hello world"));
    const h = await head(key);
    expect(h.exists).toBe(true);
    expect(h.size).toBe(11);
    const body = await get(key);
    expect(body.toString("utf8")).toBe("hello world");
    await del(key);
    const h2 = await head(key);
    expect(h2.exists).toBe(false);
  });

  it("buildKey produces a scoped, randomized key", () => {
    const k = buildKey("org_abc", "photos", "vacation.JPG");
    expect(k).toMatch(/^orgs\/org_abc\/photos\/[0-9a-f]{16}\.jpg$/);
  });
});
