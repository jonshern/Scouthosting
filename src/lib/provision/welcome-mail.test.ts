import { describe, expect, it } from "vitest";
import { welcomeEmail } from "./welcome-mail";
import { unitInviteEmail } from "@/lib/members/access";

const org = { slug: "troop12", customDomain: null, displayName: "Troop 12 <Anytown>" };

describe("new-unit emails", () => {
  it("welcomes the founder with the site, the admin page and the first steps, never the recovery code", () => {
    const m = welcomeEmail({ name: "Robin", org, trialEndsAt: new Date("2026-11-18T12:00:00Z") });
    expect(m.subject).toBe("Troop 12 <Anytown> is on Compass");
    expect(m.html).toContain("troop12.");
    expect(m.html).toContain("/admin");
    expect(m.html).toContain("November 18");
    expect(m.html).toContain("Troop 12 &lt;Anytown&gt;");
    expect(m.html).not.toContain("<Anytown>");
    expect(m.html).toMatch(/recovery code/i);
  });

  it("invites a family to the unit's join page with the address the roster has", () => {
    const m = unitInviteEmail({
      unitName: "Troop 12",
      firstName: "Ivy",
      inviterName: "Robin Leader",
      email: "ivy@example.invalid",
      link: "https://troop12.compass.app/join",
    });
    expect(m.subject).toBe("Join Troop 12 on Compass");
    expect(m.html).toContain("Robin Leader added you");
    expect(m.html).toContain('href="https://troop12.compass.app/join"');
    expect(m.html).toContain("ivy@example.invalid");
  });
});
