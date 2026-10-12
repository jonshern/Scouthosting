import { describe, expect, it } from "vitest";
import { REQUIREMENT_ID_PATTERN } from "@/lib/counselor/ids";
import { slotsFromEventFile } from "@/lib/events/waypoint-file";
import { DEMO_ACCOUNTS, DEMO_EMAIL_DOMAIN, isDemoAddress } from "./mode";
import {
  ANNOUNCEMENTS,
  BADGE_DAY_FILE,
  BADGE_DAY_SIGNUPS,
  COH_AWARDS,
  COUNSELOR_ASSIGNMENTS,
  COUNSELOR_BADGES,
  COUNSELOR_LIST,
  DEMO_ADULTS,
  DEMO_EVENTS,
  DEMO_SCOUTS,
  DEMO_UNIT,
  MESSAGES,
  PATROLS,
  POSTS,
  PROGRESS,
  RANKS,
  TREASURY,
  demoEmail,
} from "./season";
import { adultEmail } from "./seed";

const scoutKeys = new Set(DEMO_SCOUTS.map((s) => s.key));
const adultKeys = new Set(DEMO_ADULTS.map((a) => a.key));

describe("demo season data", () => {
  it("uses only invented people: no real names from this project", () => {
    const text = JSON.stringify({
      DEMO_UNIT,
      DEMO_ADULTS,
      DEMO_SCOUTS,
      DEMO_EVENTS,
      BADGE_DAY_FILE,
      COUNSELOR_LIST,
      MESSAGES,
      ANNOUNCEMENTS,
      POSTS,
      DEMO_ACCOUNTS,
    }).toLowerCase();
    for (const real of ["emmett", "shern", "jon ", "jonshern"]) expect(text).not.toContain(real);
  });

  it("gives every person a unique key and every address the demo domain", () => {
    expect(scoutKeys.size).toBe(DEMO_SCOUTS.length);
    expect(adultKeys.size).toBe(DEMO_ADULTS.length);
    for (const k of scoutKeys) expect(adultKeys.has(k)).toBe(false);
    const emails = DEMO_ADULTS.map(adultEmail);
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) expect(isDemoAddress(e)).toBe(true);
    expect(demoEmail("Thanh", "Nguyen")).toBe(`thanh.nguyen@${DEMO_EMAIL_DOMAIN}`);
  });

  it("links each demo account to exactly one adult", () => {
    for (const account of DEMO_ACCOUNTS) {
      const adults = DEMO_ADULTS.filter((a) => a.account === account.role);
      expect(adults).toHaveLength(1);
      expect(adultEmail(adults[0]!)).toBe(account.email);
      expect(`${adults[0]!.firstName} ${adults[0]!.lastName}`).toBe(account.displayName);
    }
  });

  it("has two YPT-current leaders so the chat channels pass two-deep", () => {
    expect(DEMO_ADULTS.filter((a) => a.ypt).length).toBeGreaterThanOrEqual(2);
  });

  it("puts every scout in a real patrol with a parent on the roster", () => {
    const patrols = new Set(PATROLS.map((p) => p.name));
    for (const s of DEMO_SCOUTS) {
      expect(patrols.has(s.patrol)).toBe(true);
      expect(adultKeys.has(s.parent)).toBe(true);
      expect(RANKS).toContain(s.rank);
    }
    // One patrol leader per patrol.
    for (const p of patrols) {
      expect(DEMO_SCOUTS.filter((s) => s.patrol === p && s.position === "Patrol Leader")).toHaveLength(1);
    }
  });

  it("gives the parent account the two scouts its card promises", () => {
    const parent = DEMO_ADULTS.find((a) => a.account === "parent")!;
    const kids = DEMO_SCOUTS.filter((s) => s.parent === parent.key).map((s) => s.firstName);
    expect(kids.sort()).toEqual(["Sam", "Theo"]);
    const card = DEMO_ACCOUNTS.find((a) => a.role === "parent")!;
    for (const k of kids) expect(card.summary).toContain(k);
  });

  it("shows scouts at several different ranks", () => {
    expect(new Set(DEMO_SCOUTS.map((s) => s.rank)).size).toBeGreaterThanOrEqual(5);
  });

  it("only refers to people and events that exist", () => {
    for (const ev of DEMO_EVENTS) {
      for (const k of [...(ev.going ?? []), ...(ev.maybe ?? []), ...(ev.notGoing ?? [])]) {
        expect(scoutKeys.has(k), `${ev.key}: ${k}`).toBe(true);
      }
      for (const slot of ev.slots ?? []) {
        expect(slot.takenBy.length).toBeLessThanOrEqual(slot.capacity);
        for (const k of [...slot.takenBy, ...(slot.waitlist ?? [])]) expect(adultKeys.has(k), k).toBe(true);
        if (slot.waitlist?.length) expect(slot.takenBy.length).toBe(slot.capacity);
      }
    }
    const eventKeys = new Set(DEMO_EVENTS.map((e) => e.key));
    for (const t of TREASURY) {
      if (t.scout) expect(scoutKeys.has(t.scout), t.scout).toBe(true);
      if (t.event) expect(eventKeys.has(t.event), t.event).toBe(true);
      expect(Number.isInteger(t.amountCents) && t.amountCents !== 0).toBe(true);
    }
    for (const m of MESSAGES) {
      expect(adultKeys.has(m.from), m.from).toBe(true);
      if (m.channel === "campout" || m.channel === "badgeday") {
        expect(DEMO_EVENTS.find((e) => e.key === m.channel)?.channel).toBe(true);
      }
    }
    for (const a of COH_AWARDS) expect(scoutKeys.has(a.scout)).toBe(true);
    for (const a of COUNSELOR_ASSIGNMENTS) {
      expect(scoutKeys.has(a.scout)).toBe(true);
      expect(COUNSELOR_BADGES).toContain(a.badge);
    }
    for (const c of COUNSELOR_LIST) if (c.adult) expect(adultKeys.has(c.adult)).toBe(true);
  });

  it("uses catalog requirement IDs for progress", () => {
    for (const p of PROGRESS) {
      expect(p.id).toMatch(REQUIREMENT_ID_PATTERN);
      expect(scoutKeys.has(p.scout)).toBe(true);
      if (p.status === "signed_off") expect(p.by).toBeDefined();
    }
    const pairs = PROGRESS.map((p) => `${p.scout} ${p.id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("builds the badge day from a valid Waypoint event file", () => {
    const parsed = slotsFromEventFile(JSON.stringify(BADGE_DAY_FILE));
    if ("error" in parsed) throw new Error(parsed.error);
    const byKey = new Map(parsed.slots.map((s) => [s.key, s]));
    for (const [key, seats] of Object.entries(BADGE_DAY_SIGNUPS)) {
      const slot = byKey.get(key);
      expect(slot, key).toBeDefined();
      expect(seats.taken.length).toBeLessThanOrEqual(slot!.capacity);
      if (seats.waitlist?.length) expect(seats.taken.length).toBe(slot!.capacity);
      const people = key.startsWith("station:") ? scoutKeys : adultKeys;
      for (const k of [...seats.taken, ...(seats.waitlist ?? [])]) expect(people.has(k), `${key}: ${k}`).toBe(true);
    }
    // At least one full station with a waitlist, to show how that looks.
    expect(Object.values(BADGE_DAY_SIGNUPS).some((s) => s.waitlist?.length)).toBe(true);
  });
});
