import { describe, it, expect } from "vitest";
import { scoutbookUrl, hasScoutbookId } from "../lib/scoutbook.js";

describe("scoutbookUrl", () => {
  it("builds a per-Scout deep link from a numeric id", () => {
    const u = scoutbookUrl("1234567");
    expect(u).toContain("scoutprofile.asp");
    expect(u).toContain("ScoutUserID=1234567");
  });

  it("falls back to the dashboard when no id is passed", () => {
    expect(scoutbookUrl()).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl("")).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl(null)).toBe("https://scoutbook.scouting.org/");
  });

  it("rejects ids with funky characters", () => {
    expect(scoutbookUrl("abc; drop table users")).toBe("https://scoutbook.scouting.org/");
    expect(scoutbookUrl("<script>")).toBe("https://scoutbook.scouting.org/");
  });

  it("accepts alphanumeric ids", () => {
    const u = scoutbookUrl("ABC123-x_y");
    expect(u).toContain("ScoutUserID=ABC123-x_y");
  });
});

describe("hasScoutbookId", () => {
  it("recognises valid ids", () => {
    expect(hasScoutbookId("1234567")).toBe(true);
    expect(hasScoutbookId("abc-def")).toBe(true);
  });
  it("rejects empty / unsafe values", () => {
    expect(hasScoutbookId("")).toBe(false);
    expect(hasScoutbookId(null)).toBe(false);
    expect(hasScoutbookId("with space")).toBe(false);
  });
});
