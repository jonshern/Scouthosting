// Roster import tests. Pin the contract for both CSV and XLSX paths,
// and confirm the header normaliser tolerates the messy real-world
// variations (spaces, underscores, casing).

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseRoster,
  parseCsv,
  parseXlsx,
  mapMemberRows,
} from "../lib/rosterImport.js";

describe("parseCsv", () => {
  it("parses a basic header + rows", () => {
    const out = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(out).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas and newlines", () => {
    const out = parseCsv('name,note\n"Park, A","line 1\nline 2"');
    expect(out).toEqual([
      ["name", "note"],
      ["Park, A", "line 1\nline 2"],
    ]);
  });

  it("handles escaped double quotes", () => {
    const out = parseCsv('q\n"a ""b"" c"');
    expect(out).toEqual([["q"], ['a "b" c']]);
  });

  it("drops trailing blank lines", () => {
    const out = parseCsv("a\n1\n\n");
    expect(out).toEqual([["a"], ["1"]]);
  });

  it("treats CRLF line endings the same as LF", () => {
    const out = parseCsv("a,b\r\n1,2\r\n");
    expect(out).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseXlsx", () => {
  function makeXlsx(rows) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  it("reads the first sheet of a workbook into a row matrix", () => {
    const buf = makeXlsx([
      ["firstName", "lastName", "email"],
      ["Alex", "Park", "alex@example.com"],
      ["Pat", "Adams", "pat@example.com"],
    ]);
    const out = parseXlsx(buf);
    expect(out[0]).toEqual(["firstName", "lastName", "email"]);
    expect(out[1]).toEqual(["Alex", "Park", "alex@example.com"]);
  });

  it("coerces numeric cells to strings (so age '12' doesn't become 12)", () => {
    const buf = makeXlsx([["isYouth"], [1]]);
    const out = parseXlsx(buf);
    expect(out[1][0]).toBe("1");
  });

  it("skips truly blank rows", () => {
    const buf = makeXlsx([["a"], ["1"], [], ["2"]]);
    const out = parseXlsx(buf);
    const data = out.slice(1).map((r) => r[0]).filter((v) => v !== "");
    expect(data).toEqual(["1", "2"]);
  });
});

describe("parseRoster format detection", () => {
  it("uses the filename extension to dispatch to xlsx vs csv", () => {
    const csvOut = parseRoster({ filename: "roster.csv", text: "a,b\n1,2" });
    expect(csvOut).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("falls back to CSV when text is provided without a filename", () => {
    const out = parseRoster({ text: "a,b\n1,2" });
    expect(out).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("sniffs the PK header on a buffer when no filename is given", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["a"], ["1"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const out = parseRoster({ buffer: buf });
    expect(out[0]).toEqual(["a"]);
  });
});

describe("mapMemberRows", () => {
  const orgId = "org1";

  it("maps standard headers", () => {
    const rows = [
      ["firstName", "lastName", "email", "patrol", "isYouth"],
      ["Alex", "Park", "alex@example.com", "Eagles", "1"],
    ];
    const [m] = mapMemberRows({ rows, orgId });
    expect(m.firstName).toBe("Alex");
    expect(m.lastName).toBe("Park");
    expect(m.email).toBe("alex@example.com");
    expect(m.patrol).toBe("Eagles");
    expect(m.isYouth).toBe(true);
  });

  it("tolerates header aliases (First Name, last_name, den)", () => {
    const rows = [
      ["First Name", "Last_Name", "Email", "Den"],
      ["Liam", "O'Brien", "liam@example.com", "Wolf"],
    ];
    const [m] = mapMemberRows({ rows, orgId });
    expect(m.firstName).toBe("Liam");
    expect(m.lastName).toBe("O'Brien");
    expect(m.patrol).toBe("Wolf");
  });

  it("uses 'level' as a patrol alias for Girl Scout sheets", () => {
    const rows = [
      ["firstName", "lastName", "level"],
      ["Maya", "G.", "Brownie"],
    ];
    const [m] = mapMemberRows({ rows, orgId });
    expect(m.patrol).toBe("Brownie");
  });

  it("drops rows missing first or last name silently", () => {
    const rows = [
      ["firstName", "lastName", "email"],
      ["Alex", "Park", "alex@example.com"],
      ["", "", ""],
      ["Pat", "", "pat@example.com"],
      ["", "Adams", "adams@example.com"],
    ];
    const out = mapMemberRows({ rows, orgId });
    expect(out).toHaveLength(1);
    expect(out[0].firstName).toBe("Alex");
  });

  it("splits skills/interests on , ; or |", () => {
    const rows = [
      ["firstName", "lastName", "skills"],
      ["Alex", "Park", "knots; first-aid | navigation"],
    ];
    const [m] = mapMemberRows({ rows, orgId });
    expect(m.skills).toEqual(["knots", "first-aid", "navigation"]);
  });

  it("falls back to safe defaults when isYouth/commPreference are missing", () => {
    const rows = [
      ["firstName", "lastName"],
      ["Alex", "Park"],
    ];
    const [m] = mapMemberRows({ rows, orgId });
    expect(m.isYouth).toBe(true);
    expect(m.commPreference).toBe("email");
  });

  it("normalises commPreference and rejects unknown values", () => {
    const rows = [
      ["firstName", "lastName", "commPreference"],
      ["A", "B", "BOTH"],
      ["C", "D", "garbage"],
    ];
    const out = mapMemberRows({ rows, orgId });
    expect(out[0].commPreference).toBe("both");
    expect(out[1].commPreference).toBe("email");
  });
});
