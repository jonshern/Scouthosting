import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRoster, parseXlsx } from "./import";

const fixture = readFileSync(path.join(__dirname, "__fixtures__", "roster.xlsx"));

describe("parseXlsx", () => {
  it("reads the first sheet as strings and drops blank rows", async () => {
    const rows = await parseXlsx(fixture);
    expect(rows[0]).toEqual(["firstName", "lastName", "email", "patrol", "isYouth", "birthdate"]);
    expect(rows).toHaveLength(4);
    expect(rows[1]!.slice(0, 4)).toEqual(["Casey", "Youth", "casey@example.invalid", "Eagles"]);
    expect(rows[1]![4]).toBe("true");
    expect(rows[1]![5]).toBe("2012-05-01");
    expect(rows[2]![3]).toBe("");
    expect(rows[3]![4]).toBe("1");
  });

  it("rejects a file that isn't a spreadsheet with a readable message", async () => {
    await expect(parseXlsx(Buffer.from("<html>not a sheet</html>"))).rejects.toThrow(/\.xlsx or \.csv/);
  });
});

describe("parseRoster", () => {
  it("routes .xlsx uploads through the spreadsheet reader", async () => {
    const rows = await parseRoster({ buffer: fixture, filename: "troop.xlsx" });
    expect(rows[1]![0]).toBe("Casey");
  });

  it("still parses pasted CSV", async () => {
    const rows = await parseRoster({ text: "firstName,lastName\nAlex,R" });
    expect(rows).toEqual([
      ["firstName", "lastName"],
      ["Alex", "R"],
    ]);
  });
});
