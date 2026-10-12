import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { mcpOrigin, normaliseScope, DEFAULT_SCOPE } from "../config";
import { redirectAllowed, validateRegistration, validRedirectUri } from "./clients";
import { pkceMatches, validChallenge } from "./tokens";

describe("redirect URIs", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", true],
    ["http://localhost:33418/callback", true],
    ["http://127.0.0.1:5000/cb", true],
    ["com.example.app:/oauth/callback", true],
    ["cursor://anysphere.cursor-retrieval/oauth/callback", false],
    ["http://evil.example.com/cb", false],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["myapp:/cb", false],
    ["https://claude.ai/cb#frag", false],
    ["https://user:pw@claude.ai/cb", false],
    ["not a url", false],
  ])("%s → %s", (uri, ok) => {
    expect(validRedirectUri(uri)).toBe(ok);
  });

  it("matches exactly, except a loopback port", () => {
    expect(redirectAllowed(["https://claude.ai/cb"], "https://claude.ai/cb")).toBe(true);
    expect(redirectAllowed(["https://claude.ai/cb"], "https://claude.ai/cb2")).toBe(false);
    expect(redirectAllowed(["http://127.0.0.1:1000/cb"], "http://127.0.0.1:2000/cb")).toBe(true);
    expect(redirectAllowed(["http://127.0.0.1:1000/cb"], "http://127.0.0.1:2000/other")).toBe(false);
    expect(redirectAllowed(["http://127.0.0.1:1000/cb"], "http://localhost:2000/cb")).toBe(false);
  });
});

describe("client registration", () => {
  it("accepts a public client and cleans the name", () => {
    const r = validateRegistration({ redirect_uris: ["https://claude.ai/cb", "https://claude.ai/cb"], client_name: "Claude\u0007", token_endpoint_auth_method: "none" });
    expect(r).toEqual({ clientName: "Claude", clientUri: null, redirectUris: ["https://claude.ai/cb"] });
  });

  it("refuses confidential clients, other grants and bad redirects", () => {
    expect(validateRegistration({ redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "client_secret_basic" })).toMatchObject({ error: "invalid_client_metadata" });
    expect(validateRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["client_credentials"] })).toMatchObject({ error: "invalid_client_metadata" });
    expect(validateRegistration({ redirect_uris: ["http://a.example/cb"] })).toMatchObject({ error: "invalid_redirect_uri" });
    expect(validateRegistration({ redirect_uris: [] })).toMatchObject({ error: "invalid_redirect_uri" });
    expect(validateRegistration("nope")).toMatchObject({ error: "invalid_client_metadata" });
  });
});

describe("scopes and origin", () => {
  it("normalises scopes", () => {
    expect(normaliseScope(null)).toBe(DEFAULT_SCOPE);
    expect(normaliseScope("offline_access")).toBe(DEFAULT_SCOPE);
    expect(normaliseScope("scouts:write scouts:read")).toBe("scouts:read scouts:write");
    expect(normaliseScope("scouts:read offline_access")).toBe("scouts:read");
    expect(normaliseScope("scouts:read admin")).toBeNull();
  });

  it("needs https unless loopback", () => {
    expect(mcpOrigin({ MCP_PUBLIC_URL: "https://compass.example.com/" })).toBe("https://compass.example.com");
    expect(mcpOrigin({ MCP_PUBLIC_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(() => mcpOrigin({ MCP_PUBLIC_URL: "http://compass.example.com" })).toThrow(/https/);
  });
});

describe("PKCE", () => {
  it("checks S256", () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(validChallenge(challenge)).toBe(true);
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(`${verifier}x`, challenge)).toBe(false);
    expect(pkceMatches("short", challenge)).toBe(false);
    expect(validChallenge("plain-text")).toBe(false);
  });
});
