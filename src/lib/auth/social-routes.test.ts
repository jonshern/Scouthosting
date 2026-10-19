import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ auth: {} }));

import { withSignInScheme } from "./social-routes";

describe("withSignInScheme", () => {
  it("uses https for a Tailscale or public host whatever the proxy said", async () => {
    const req = new Request("http://jons-mac.tail1234.ts.net/api/auth/callback/google?code=x", {
      headers: { host: "jons-mac.tail1234.ts.net" },
    });
    const out = await withSignInScheme(req);
    expect(out.url).toBe("https://jons-mac.tail1234.ts.net/api/auth/callback/google?code=x");
  });

  it("keeps http on localhost and its subdomains", async () => {
    const req = new Request("http://localhost:3000/api/auth/callback/google", { headers: { host: "localhost:3000" } });
    expect(await withSignInScheme(req)).toBe(req);
    const sub = new Request("https://troop100.localhost:3000/x", { headers: { host: "troop100.localhost:3000" } });
    expect((await withSignInScheme(sub)).url).toBe("http://troop100.localhost:3000/x");
  });

  it("carries a POST body (Apple's form_post) across", async () => {
    const req = new Request("http://compass.app/api/auth/callback/apple", {
      method: "POST",
      headers: { host: "compass.app", "content-type": "application/x-www-form-urlencoded" },
      body: "code=abc&state=xyz",
    });
    const out = await withSignInScheme(req);
    expect(out.url).toBe("https://compass.app/api/auth/callback/apple");
    expect(out.method).toBe("POST");
    expect(await out.text()).toBe("code=abc&state=xyz");
  });
});
