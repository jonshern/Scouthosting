import { describe, expect, it } from "vitest";
import { csvEscape } from "./csv";

describe("csvEscape", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
    expect(csvEscape(null)).toBe("");
  });
  it("defuses spreadsheet formulas from typed text", () => {
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape("+1 555")).toBe("'+1 555");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("-cmd")).toBe("'-cmd");
  });
  it("leaves negative amounts and numbers alone", () => {
    expect(csvEscape("-12.50")).toBe("-12.50");
    expect(csvEscape(-3)).toBe("-3");
    expect(csvEscape("2026-03-09")).toBe("2026-03-09");
  });
});
