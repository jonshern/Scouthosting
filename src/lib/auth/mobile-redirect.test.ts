import { describe, expect, it } from "vitest";
import { allowedMobileRedirect, expoGoSigninHosts, isWebSigninRedirect, signinTokenName, webSigninOrigins } from "./mobile-redirect";

describe("allowedMobileRedirect", () => {
  it("accepts the app's deep link everywhere", () => {
    expect(allowedMobileRedirect("compass://auth/callback", true)?.href).toBe("compass://auth/callback");
    for (const scheme of ["bluecard", "waypoint", "emmettjourney", "lantern"]) {
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

describe("website sign-in (WEB_SIGNIN_ORIGINS)", () => {
  const origins = webSigninOrigins("https://waypoint.example.org, https://mac.tail1234.ts.net/ ,not a url,https://x.example/path");

  it("parses exact origins only", () => {
    expect([...origins].sort()).toEqual(["https://mac.tail1234.ts.net", "https://waypoint.example.org"]);
    expect(webSigninOrigins(undefined).size).toBe(0);
  });

  it("accepts a listed origin's /signed-in page", () => {
    expect(allowedMobileRedirect("https://waypoint.example.org/signed-in", true, origins)?.href).toBe(
      "https://waypoint.example.org/signed-in",
    );
    expect(allowedMobileRedirect("https://mac.tail1234.ts.net/signed-in", true, origins)).not.toBeNull();
  });

  it("refuses an origin that isn't listed", () => {
    expect(allowedMobileRedirect("https://attacker.example/signed-in", true, origins)).toBeNull();
    expect(allowedMobileRedirect("https://waypoint.example.org.attacker.example/signed-in", true, origins)).toBeNull();
    expect(allowedMobileRedirect("https://waypoint.example.org:8443/signed-in", true, origins)).toBeNull();
  });

  it("refuses http in production", () => {
    const http = webSigninOrigins("http://waypoint.example.org");
    expect(allowedMobileRedirect("http://waypoint.example.org/signed-in", true, http)).toBeNull();
    expect(allowedMobileRedirect("http://waypoint.example.org/signed-in", false, http)).not.toBeNull();
  });

  it("refuses any other path or credentials on an allowed origin", () => {
    for (const p of ["/", "/signed-in/", "/signed-in/x", "/other", "/SIGNED-IN"]) {
      expect(allowedMobileRedirect(`https://waypoint.example.org${p}`, true, origins)).toBeNull();
    }
    expect(allowedMobileRedirect("https://user:pw@waypoint.example.org/signed-in", true, origins)).toBeNull();
  });

  it("marks only listed web pages as website sign-ins", () => {
    expect(isWebSigninRedirect(new URL("https://waypoint.example.org/signed-in"), true, origins)).toBe(true);
    expect(isWebSigninRedirect(new URL("http://localhost:8081/cb"), false, origins)).toBe(false);
    expect(isWebSigninRedirect(new URL("compass://auth/callback"), true, origins)).toBe(false);
  });
});

describe("Expo Go in production", () => {
  const none = new Set<string>();
  const hosts = expoGoSigninHosts("100.101.102.103:8081, junk, http://x:1, Jons-Mac.tail1234.ts.net:8081");

  it("parses host:port pairs and ignores anything else", () => {
    expect([...hosts]).toEqual(["100.101.102.103:8081", "jons-mac.tail1234.ts.net:8081"]);
    expect(expoGoSigninHosts(undefined).size).toBe(0);
  });

  it("allows only a listed dev server", () => {
    expect(allowedMobileRedirect("exp://100.101.102.103:8081/--/auth/callback", true, none, hosts)).not.toBeNull();
    expect(allowedMobileRedirect("exp://jons-mac.tail1234.ts.net:8081/--/auth/callback", true, none, hosts)).not.toBeNull();
    expect(allowedMobileRedirect("exp://100.101.102.103:8082/--/auth/callback", true, none, hosts)).toBeNull();
    expect(allowedMobileRedirect("exp://attacker.example:8081/--/auth/callback", true, none, hosts)).toBeNull();
    expect(allowedMobileRedirect("exp://100.101.102.103:8081/--/auth/callback", true, none, none)).toBeNull();
  });

  it("never lets a listed host through on another scheme", () => {
    expect(allowedMobileRedirect("http://100.101.102.103:8081/--/auth/callback", true, none, hosts)).toBeNull();
  });
});

describe("signinTokenName", () => {
  it("names the token after the app or site it went to", () => {
    expect(signinTokenName(new URL("lantern://auth/callback"))).toBe("Lantern app");
    expect(signinTokenName(new URL("bluecard://auth/callback"))).toBe("Waypoint app");
    expect(signinTokenName(new URL("compass://auth/callback"))).toBe("Compass app");
    expect(signinTokenName(new URL("https://waypoint.example.org/signed-in"))).toBe("Waypoint website");
    expect(signinTokenName(new URL("https://lantern.example.org/signed-in"))).toBe("Lantern website");
    expect(signinTokenName(new URL("https://jons-mac.ts.net/signed-in"))).toBe("Website (jons-mac.ts.net)");
    expect(signinTokenName(new URL("exp://192.168.1.2:8081/--/auth/callback"))).toBe("Expo Go (development)");
  });
});
