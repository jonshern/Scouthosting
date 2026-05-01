// Invite-token tests.

import { describe, it, expect } from "vitest";
import { makeInviteToken, verifyInviteToken, INVITABLE_ROLES, INVITE_ROLE_LABELS } from "../lib/inviteToken.js";
import { makeSignedToken } from "../lib/signedToken.js";

const SECRET = "test-secret-32-bytes-long-pad-pad-padding";

describe("makeInviteToken / verifyInviteToken", () => {
  it("round-trips claims (orgId, email, role)", () => {
    const tok = makeInviteToken({ orgId: "o1", email: "a@b.com", role: "leader" }, { secret: SECRET });
    const claims = verifyInviteToken(tok, { secret: SECRET });
    expect(claims).toMatchObject({ kind: "invite", orgId: "o1", email: "a@b.com", role: "leader" });
  });

  it("normalises email to lowercase", () => {
    const tok = makeInviteToken({ orgId: "o1", email: "A@B.com", role: "parent" }, { secret: SECRET });
    expect(verifyInviteToken(tok, { secret: SECRET }).email).toBe("a@b.com");
  });

  it("rejects tampered tokens", () => {
    const tok = makeInviteToken({ orgId: "o1", email: "a@b.com", role: "leader" }, { secret: SECRET });
    const tampered = tok.slice(0, -2) + "xx";
    expect(verifyInviteToken(tampered, { secret: SECRET })).toBeNull();
  });

  it("rejects tokens signed with a different secret", () => {
    const tok = makeInviteToken({ orgId: "o1", email: "a@b.com", role: "leader" }, { secret: SECRET });
    expect(verifyInviteToken(tok, { secret: "another-secret" })).toBeNull();
  });

  it("rejects tokens of a different kind (defense against signed-token reuse)", () => {
    // Pretend a password-reset token's body got passed in; verifyInviteToken
    // should still reject it because kind != "invite".
    const fake = makeInviteToken({ orgId: "o1", email: "a@b.com", role: "leader" }, { secret: SECRET });
    const wrongKind = makeSignedToken(
      { kind: "reset", orgId: "o1", email: "a@b.com", role: "leader" },
      { secret: SECRET, ttlSeconds: 60 },
    );
    expect(verifyInviteToken(wrongKind, { secret: SECRET })).toBeNull();
    expect(verifyInviteToken(fake, { secret: SECRET })?.kind).toBe("invite");
  });

  it("requires orgId, email, and role", () => {
    expect(() => makeInviteToken({ email: "x", role: "leader" }, { secret: SECRET })).toThrow();
    expect(() => makeInviteToken({ orgId: "x", role: "leader" }, { secret: SECRET })).toThrow();
    expect(() => makeInviteToken({ orgId: "x", email: "y" }, { secret: SECRET })).toThrow();
  });
});

describe("INVITABLE_ROLES + labels", () => {
  it("every invitable role has a label", () => {
    for (const r of INVITABLE_ROLES) {
      expect(INVITE_ROLE_LABELS[r]).toBeTruthy();
    }
  });

  it("is frozen so admin-form code can't mutate it", () => {
    expect(Object.isFrozen(INVITABLE_ROLES)).toBe(true);
    expect(Object.isFrozen(INVITE_ROLE_LABELS)).toBe(true);
  });
});
