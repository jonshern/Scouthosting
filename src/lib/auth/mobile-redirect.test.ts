import { describe, expect, it } from "vitest";
import { allowedMobileRedirect } from "./mobile-redirect";

describe("allowedMobileRedirect", () => {
  it("accepts the app's deep link everywhere", () => {
    expect(allowedMobileRedirect("compass://auth/callback", true)?.href).toBe("compass://auth/callback");
    for (const scheme of ["bluecard", "waypoint", "emmettjourney", "summit"]) {
      expect(allowedMobileRedirect(`${scheme}://auth/callback`, true)?.protocol).toBe(`${scheme}:`);
    }
  });

  it("refuses web sites, which would receive the user's API token", () => {
    expect(allowedMobileRedirect("https://attacker.example/steal", true)).toBeNull();
    expect(allowedMobileRedirect("https://attacker.example/steal", false)).toBeNull();
    expect(allowedMobileRedirect("http://localhost:8081/cb", true)).toBeNull();
  });

  it("allows Expo Go and localhost only outside production", () => {
    expect(allowedMobileRedirect("exp://192.168.1.5:8081/--/auth/callback", false)).not.toBeNull();
    expect(allowedMobileRedirect("exp://192.168.1.5:8081/--/auth/callback", true)).toBeNull();
    expect(allowedMobileRedirect("http://localhost:8081/cb", false)).not.toBeNull();
  });

  it("refuses other schemes and junk", () => {
    expect(allowedMobileRedirect("javascript:alert(1)", false)).toBeNull();
    expect(allowedMobileRedirect("not a url", false)).toBeNull();
    expect(allowedMobileRedirect("otherapp://auth/callback", true)).toBeNull();
  });
});
