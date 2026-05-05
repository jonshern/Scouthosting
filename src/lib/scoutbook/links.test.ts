import { describe, expect, it } from "vitest";
import { hasScoutbookId, scoutbookUrl } from "./links";

describe("scoutbook/links", () => {
  it("returns dashboard fallback when no id", () => {
    expect(scoutbookUrl(null)).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl(undefined)).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl("")).toBe("https://scoutbook.scouting.org/");
  });

  it("builds a profile URL for a valid id", () => {
    const url = scoutbookUrl("ABC123");
    expect(url).toContain("scoutprofile.asp?ScoutUserID=ABC123");
  });

  it("rejects invalid ids and falls back", () => {
    expect(scoutbookUrl("../../etc/passwd")).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl("a b")).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl("a".repeat(41))).toBe("https://scoutbook.scouting.org/");
  });

  it("hasScoutbookId mirrors the validator", () => {
    expect(hasScoutbookId("ABC123")).toBe(true);
    expect(hasScoutbookId("../../x")).toBe(false);
    expect(hasScoutbookId(null)).toBe(false);
  });
});
