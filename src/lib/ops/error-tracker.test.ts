import { describe, expect, it } from "vitest";
import { scrubPath, scrubSecrets } from "./error-tracker";

describe("scrubSecrets", () => {
  it("removes app, scout and connector tokens", () => {
    expect(scrubSecrets("bad compass_pat_abc123 here")).toBe("bad compass_pat_[scrubbed] here");
    expect(scrubSecrets("lantern_scout_Zz9-_")).toBe("lantern_scout_[scrubbed]");
    expect(scrubSecrets("compass_mcp_rt_abc")).toBe("compass_mcp_rt_[scrubbed]");
    expect(scrubSecrets("Authorization: Bearer abc.def")).toBe("Authorization: Bearer [scrubbed]");
  });

  it("removes tokens from links", () => {
    expect(scrubSecrets("lantern://auth/callback?state=s&token=xyz&userId=u")).toBe(
      "lantern://auth/callback?state=s&token=[scrubbed]&userId=u",
    );
    expect(scrubSecrets("https://w.example/signed-in#token=xyz")).toBe("https://w.example/signed-in#token=[scrubbed]");
  });

  it("removes email addresses only when asked", () => {
    expect(scrubSecrets("no user a.b@x.org")).toBe("no user a.b@x.org");
    expect(scrubSecrets("no user a.b@x.org", { emails: true })).toBe("no user [email]");
  });
});

describe("scrubPath", () => {
  it("drops the query and signed-link tokens", () => {
    expect(scrubPath("/staff-rsvp?token=abc")).toBe("/staff-rsvp");
    expect(scrubPath("/rsvp/eyJhbGc.sig")).toBe("/rsvp/[token]");
    expect(scrubPath("/permission-slip/abc/sign")).toBe("/permission-slip/[token]/sign");
    expect(scrubPath("/unsubscribe/abc?x=1 (render /unsubscribe/[token])")).toBe(
      "/unsubscribe/[token] (render /unsubscribe/[token])",
    );
  });

  it("leaves ordinary paths alone", () => {
    expect(scrubPath("/o/troop100/admin/events")).toBe("/o/troop100/admin/events");
  });
});
