// Which sign-ups each queue view shows, in what order, and what the
// owner's invite and plan emails link to.

import { describe, expect, it } from "vitest";
import { filterSignups, type SignupItem } from "./signups";
import { inviteEmail, inviteLink } from "./signup-mail";

const NOW = new Date("2026-10-19T15:00:00Z");

function person(id: string, over: Partial<SignupItem> = {}): SignupItem {
  return {
    kind: "person",
    id,
    at: new Date("2026-10-10T00:00:00Z"),
    name: id,
    email: `${id}@example.invalid`,
    units: 0,
    products: [],
    confirmed: true,
    off: false,
    invitedAt: null,
    status: "new",
    note: null,
    followUpOn: null,
    reviewedAt: null,
    ...over,
  } as SignupItem;
}

describe("filterSignups", () => {
  const items = [
    person("new-old", { at: new Date("2026-10-01T00:00:00Z") }),
    person("new-recent", { at: new Date("2026-10-18T00:00:00Z"), products: ["lantern"] }),
    person("follow-later", { status: "follow_up", followUpOn: new Date("2026-10-25T12:00:00Z") }),
    person("follow-due", { status: "follow_up", followUpOn: new Date("2026-10-19T12:00:00Z"), at: new Date("2026-09-01T00:00:00Z") }),
    person("approved", { status: "approved", products: ["waypoint"] }),
    person("declined", { status: "declined" }),
    person("done", { status: "done", products: ["lantern"] }),
  ];
  const ids = (xs: SignupItem[]) => xs.map((x) => x.id);

  it("to do is new plus follow-ups, with follow-ups due today first", () => {
    expect(ids(filterSignups(items, { view: "todo" }, NOW))).toEqual(["follow-due", "new-recent", "follow-later", "new-old"]);
  });

  it("each status view shows only that status", () => {
    expect(ids(filterSignups(items, { view: "declined" }, NOW))).toEqual(["declined"]);
    expect(ids(filterSignups(items, { view: "approved" }, NOW))).toEqual(["approved"]);
    expect(filterSignups(items, { view: "all" }, NOW)).toHaveLength(items.length);
  });

  it("filters by the app they signed up through", () => {
    expect(ids(filterSignups(items, { view: "all", product: "lantern" }, NOW))).toEqual(["new-recent", "done"]);
    expect(ids(filterSignups(items, { view: "todo", product: "waypoint" }, NOW))).toEqual([]);
  });
});

describe("owner emails", () => {
  it("a Compass invite starts a unit; the apps make an account", () => {
    expect(inviteLink("compass", "https://compass.app")).toBe("https://compass.app/start");
    expect(inviteLink("lantern", "https://compass.app")).toBe("https://compass.app/signup");
  });

  it("escapes what the owner typed", () => {
    const mail = inviteEmail({ product: "waypoint", name: "<b>Sam</b>", note: "See you & the troop", link: "https://x/signup" });
    expect(mail.subject).toBe("You're invited to try Waypoint");
    expect(mail.html).toContain("&lt;b&gt;Sam&lt;/b&gt;");
    expect(mail.html).toContain("See you &amp; the troop");
  });
});
