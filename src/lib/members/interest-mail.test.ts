import { describe, expect, it } from "vitest";
import { interestEmail, unitWord } from "./interest-mail";

describe("interestEmail", () => {
  it("escapes what the family typed and links to Pending", () => {
    const m = interestEmail({
      org: { slug: "troop100", customDomain: "troop100.example.org", displayName: "Troop 100" },
      from: { name: "Pat <b>Lee</b>", email: "pat@example.invalid", phone: null },
      scout: "Sam, 11",
      message: "Hi\n<script>x</script>",
      alreadyOnRoster: false,
      leadId: "m1",
    });
    expect(m.subject).toBe("Pat <b>Lee</b> wants to know about Troop 100");
    expect(m.html).toContain("Pat &lt;b&gt;Lee&lt;/b&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("://troop100.example.org/admin/members?tab=pending");
  });
  it("says when the address is already on the roster", () => {
    const m = interestEmail({
      org: { slug: "t", displayName: "T" },
      from: { name: "A", email: "a@example.invalid", phone: "555" },
      scout: null,
      message: null,
      alreadyOnRoster: true,
      leadId: null,
    });
    expect(m.html).toContain("already on your roster");
    expect(m.html).not.toContain("Pending list");
  });
});

describe("unitWord", () => {
  it("uses the unit's own word", () => {
    expect(unitWord("Troop")).toBe("troop");
    expect(unitWord("Pack")).toBe("pack");
    expect(unitWord("Nope")).toBe("unit");
  });
});
