import { describe, expect, it } from "vitest";
import { relyingPartyForHost } from "./passkeys";

const prod = { apexHost: "compass.app", production: true };
const dev = { apexHost: "localhost:3000", production: false };

describe("relyingPartyForHost", () => {
  it("uses the apex for the apex and every unit subdomain", () => {
    expect(relyingPartyForHost("compass.app", prod)).toEqual({ rpID: "compass.app", origins: ["https://compass.app"] });
    expect(relyingPartyForHost("troop100.compass.app", prod)).toEqual({
      rpID: "compass.app",
      origins: ["https://troop100.compass.app"],
    });
  });

  it("gives an org's custom domain its own passkeys", () => {
    expect(relyingPartyForHost("troop42.org", { ...prod, isCustomDomain: true })?.rpID).toBe("troop42.org");
    expect(relyingPartyForHost("troop42.org", prod)).toBeNull();
  });

  it("refuses look-alike and unknown hosts", () => {
    expect(relyingPartyForHost("evilcompass.app", prod)).toBeNull();
    expect(relyingPartyForHost("compass.app.evil.example", prod)).toBeNull();
    expect(relyingPartyForHost("localhost:3000", prod)).toBeNull();
    expect(relyingPartyForHost(null, prod)).toBeNull();
  });

  it("covers the Mac and Tailscale hosts listed in PASSKEY_EXTRA_HOSTS", () => {
    const opts = { ...prod, extraHosts: ["jons-mac.tail1234.ts.net"] };
    expect(relyingPartyForHost("jons-mac.tail1234.ts.net", opts)).toEqual({
      rpID: "jons-mac.tail1234.ts.net",
      origins: ["https://jons-mac.tail1234.ts.net"],
    });
  });

  it("allows plain http only on localhost in production", () => {
    const mac = { apexHost: "localhost", production: true };
    expect(relyingPartyForHost("troop100.localhost:3000", mac)).toEqual({
      rpID: "localhost",
      origins: ["https://troop100.localhost:3000", "http://troop100.localhost:3000"],
    });
  });

  it("uses localhost in development, over http or https, keeping the port", () => {
    expect(relyingPartyForHost("troop100.localhost:3000", dev)).toEqual({
      rpID: "localhost",
      origins: ["https://troop100.localhost:3000", "http://troop100.localhost:3000"],
    });
  });
});
