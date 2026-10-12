import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ org: { count: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { assertSafeToReset, DemoResetRefused, orderForDelete, resetDue, wipeTables } from "./reset";
import { atDay, daysToMonday, eventTimes } from "./seed";
import { DEMO_EVENTS } from "./season";
import { demoAccount, demoResetHours, isDemoAddress, isDemoMode } from "./mode";

const env = process.env as Record<string, string | undefined>;

describe("orderForDelete", () => {
  it("empties a table before the table it blocks", () => {
    const order = orderForDelete(["Fund", "Org", "Transaction", "User"], [["Transaction", "Fund"]]);
    expect(order.indexOf("Transaction")).toBeLessThan(order.indexOf("Fund"));
    expect(order.sort()).toEqual(["Fund", "Org", "Transaction", "User"]);
  });

  it("ignores blockers outside the list and survives cycles", () => {
    expect(orderForDelete(["A", "B"], [["X", "A"], ["A", "B"], ["B", "A"]]).sort()).toEqual(["A", "B"]);
  });
});

describe("wipeTables", () => {
  it("retries a table that failed until the one holding it is empty", async () => {
    const emptied = new Set<string>();
    const exec = vi.fn(async (sql: string) => {
      const t = sql.match(/"(\w+)"/)![1]!;
      if (t === "Fund" && !emptied.has("Transaction")) throw new Error("violates foreign key");
      emptied.add(t);
    });
    await wipeTables(["Fund", "Transaction", "Org"], exec);
    expect(emptied).toEqual(new Set(["Fund", "Transaction", "Org"]));
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it("gives up when a round makes no progress", async () => {
    await expect(wipeTables(["Fund"], async () => Promise.reject(new Error("nope")))).rejects.toThrow(/stuck on Fund: nope/);
  });

  it("refuses odd table names", async () => {
    await expect(wipeTables(['x"; drop table y; --'], async () => {})).rejects.toThrow(/unexpected table name/);
  });
});

describe("assertSafeToReset", () => {
  beforeEach(() => {
    db.org.count.mockReset();
  });
  afterEach(() => {
    delete env.DEMO_MODE;
  });

  it("refuses outside demo mode without touching the database", async () => {
    delete env.DEMO_MODE;
    await expect(assertSafeToReset()).rejects.toBeInstanceOf(DemoResetRefused);
    expect(db.org.count).not.toHaveBeenCalled();
  });

  it("refuses a database that holds a real unit", async () => {
    env.DEMO_MODE = "1";
    db.org.count.mockResolvedValue(2);
    await expect(assertSafeToReset()).rejects.toThrow(/2 real unit/);
    expect(db.org.count).toHaveBeenCalledWith({ where: { isDemo: false } });
  });

  it("allows an all-demo database", async () => {
    env.DEMO_MODE = "1";
    db.org.count.mockResolvedValue(0);
    await expect(assertSafeToReset()).resolves.toBeUndefined();
  });
});

describe("reset schedule", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  afterEach(() => {
    delete env.DEMO_RESET_HOURS;
  });

  it("is due with no demo unit, or once the unit is old enough", () => {
    expect(resetDue(null, now)).toBe(true);
    expect(resetDue({ createdAt: new Date("2026-10-12T00:00:00Z") }, now, 24)).toBe(false);
    expect(resetDue({ createdAt: new Date("2026-10-11T11:00:00Z") }, now, 24)).toBe(true);
  });

  it("reads DEMO_RESET_HOURS and falls back to a day", () => {
    expect(demoResetHours()).toBe(24);
    env.DEMO_RESET_HOURS = "6";
    expect(demoResetHours()).toBe(6);
    env.DEMO_RESET_HOURS = "soon";
    expect(demoResetHours()).toBe(24);
  });
});

describe("demo mode helpers", () => {
  afterEach(() => {
    delete env.DEMO_MODE;
  });

  it("is on only for DEMO_MODE=1", () => {
    expect(isDemoMode()).toBe(false);
    env.DEMO_MODE = "true";
    expect(isDemoMode()).toBe(false);
    env.DEMO_MODE = "1";
    expect(isDemoMode()).toBe(true);
  });

  it("recognizes demo addresses and accounts", () => {
    expect(isDemoAddress("Admin@Demo.Invalid ")).toBe(true);
    expect(isDemoAddress("someone@example.com")).toBe(false);
    expect(isDemoAddress("x@notdemo.invalid")).toBe(false);
    expect(isDemoAddress(null)).toBe(false);
    expect(demoAccount("parent")?.email).toBe("parent@demo.invalid");
    expect(demoAccount("super")).toBeNull();
  });
});

describe("demo dates", () => {
  // A Wednesday.
  const now = new Date(2026, 9, 14, 15, 30);

  it("moves whole days and sets the wall-clock time", () => {
    const d = atDay(now, 3, "17:30");
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([17, 17, 30]);
    expect(atDay(now, -9, "09:00").getDate()).toBe(5);
  });

  it("puts the weekly meeting on the next Monday", () => {
    expect(daysToMonday(now)).toBe(5);
    expect(daysToMonday(new Date(2026, 9, 12))).toBe(0);
    const meeting = DEMO_EVENTS.find((e) => e.rrule)!;
    const { startsAt } = eventTimes(meeting, now);
    expect(startsAt.getDay()).toBe(1);
  });

  it("ends a campout at noon on the last day", () => {
    const campout = DEMO_EVENTS.find((e) => e.nights)!;
    const { startsAt, endsAt } = eventTimes(campout, now);
    expect(endsAt.getDate() - startsAt.getDate()).toBe(campout.nights);
    expect(endsAt.getHours()).toBe(12);
  });

  it("keeps the season around today: some events past, most ahead", () => {
    const past = DEMO_EVENTS.filter((e) => !e.rrule && e.day < 0).length;
    const ahead = DEMO_EVENTS.filter((e) => e.rrule || e.day > 0).length;
    expect(past).toBeGreaterThanOrEqual(2);
    expect(ahead).toBeGreaterThan(past);
  });
});
