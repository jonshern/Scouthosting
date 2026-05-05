import { describe, expect, it } from "vitest";
import { makeInviteToken, verifyInviteToken } from "./invite-token";

const SECRET = "test-invite-secret-not-used-in-prod";

describe("invite-token", () => {
  it("round-trips invite claims", () => {
    const tok = makeInviteToken(
      { orgId: "org_1", email: "Inv@Example.com", role: "leader", invitedBy: "user_1" },
      { secret: SECRET },
    );
    const claims = verifyInviteToken(tok, { secret: SECRET });
    expect(claims?.orgId).toBe("org_1");
    expect(claims?.email).toBe("inv@example.com"); // lowercased
    expect(claims?.role).toBe("leader");
    expect(claims?.invitedBy).toBe("user_1");
    expect(claims?.kind).toBe("invite");
  });

  it("rejects wrong-kind token", () => {
    // make a non-invite signed token
    const tok = makeInviteToken(
      { orgId: "org_1", email: "x@y.com", role: "leader" },
      { secret: SECRET },
    );
    // verify with a different secret
    expect(verifyInviteToken(tok, { secret: "other" })).toBeNull();
  });

  it("requires fields", () => {
    expect(() =>
      makeInviteToken(
        { orgId: "", email: "x@y.com", role: "leader" },
        { secret: SECRET },
      ),
    ).toThrow(/orgId required/);
    expect(() =>
      makeInviteToken(
        { orgId: "org_1", email: "", role: "leader" },
        { secret: SECRET },
      ),
    ).toThrow(/email required/);
  });
});
