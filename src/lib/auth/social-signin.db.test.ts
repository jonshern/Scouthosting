// "Continue with Google" end to end against a real Postgres: the begin
// route, Google's answer (the token endpoint faked), and Better Auth's
// callback through /api/auth/[...all]. Covers the redirect URI per host,
// a new account, and linking to an existing account by verified email.
// Runs when TEST_DATABASE_URL is set (see auth.db.test.ts).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

const url = process.env.TEST_DATABASE_URL;
const DOMAIN = "@socialtest.invalid";

function fakeIdToken(claims: Record<string, unknown>): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256", typ: "JWT" })}.${enc(claims)}.sig`;
}

function cookieHeader(setCookies: string[]): string {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

describe.skipIf(!url)("Google sign-in (database)", () => {
  type Mods = {
    beginSocial: typeof import("./social-routes").beginSocial;
    GET: (req: Request) => Promise<Response>;
    prisma: typeof import("@/lib/db").prisma;
  };
  let m: Mods;
  const realFetch = globalThis.fetch;
  let googleProfile: Record<string, unknown> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");
    vi.stubEnv("PASSKEY_EXTRA_HOSTS", "jons-mac.tail1234.ts.net");
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    vi.stubEnv("APPLE_CLIENT_ID", "app.compass.signin");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
    vi.stubEnv("APPLE_KEY_ID", "KEY1234567");
    vi.stubEnv("APPLE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    vi.stubEnv("APPLE_REDIRECT_URI", "");
    const [{ beginSocial }, route, { prisma }] = await Promise.all([
      import("./social-routes"),
      import("@/app/api/auth/[...all]/route"),
      import("@/lib/db"),
    ]);
    m = { beginSocial, GET: route.GET as (req: Request) => Promise<Response>, prisma };
  });

  beforeEach(async () => {
    await m.prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (target.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "ya29.test",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "openid email profile",
            id_token: fakeIdToken({
              iss: "https://accounts.google.com",
              aud: "test-client.apps.googleusercontent.com",
              ...googleProfile,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return realFetch(input, init);
    });
  });

  afterEach(() => {
    vi.mocked(globalThis.fetch).mockRestore();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await m?.prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await m?.prisma.$disconnect();
  });

  async function signInWithGoogle(host: string, next = "/start") {
    const scheme = host.startsWith("localhost") ? "http" : "https";
    const begin = await m.beginSocial(
      "google",
      new NextRequest(`${scheme}://${host}/api/auth/google/begin?next=${encodeURIComponent(next)}`, {
        headers: { host },
      }),
    );
    expect(begin.status).toBe(307);
    const google = new URL(begin.headers.get("location")!);
    expect(google.origin).toBe("https://accounts.google.com");
    const state = google.searchParams.get("state")!;
    // The proxy in front may say http; the callback must still match.
    const callback = await m.GET(
      new Request(`http://${host}/api/auth/callback/google?code=test-code&state=${state}`, {
        headers: { host, cookie: cookieHeader(begin.headers.getSetCookie()) },
      }),
    );
    return { redirectURI: google.searchParams.get("redirect_uri"), callback };
  }

  it("builds the redirect URI from the host: http on localhost, https on the Tailscale name", async () => {
    googleProfile = { sub: "g-host", email: `host${DOMAIN}`, email_verified: true, name: "Host Test" };
    const local = await signInWithGoogle("localhost:3000");
    expect(local.redirectURI).toBe("http://localhost:3000/api/auth/callback/google");
    const tailnet = await signInWithGoogle("jons-mac.tail1234.ts.net");
    expect(tailnet.redirectURI).toBe("https://jons-mac.tail1234.ts.net/api/auth/callback/google");
    expect(tailnet.callback.status).toBe(302);
    expect(tailnet.callback.headers.get("location")).toContain("/auth/after-sign-in");
  });

  it("starts Sign in with Apple with a per-host https callback Apple posts back to", async () => {
    const host = "jons-mac.tail1234.ts.net";
    const begin = await m.beginSocial(
      "apple",
      new NextRequest(`https://${host}/api/auth/apple/begin?next=%2Fstart`, { headers: { host } }),
    );
    expect(begin.status).toBe(307);
    const apple = new URL(begin.headers.get("location")!);
    expect(apple.origin).toBe("https://appleid.apple.com");
    expect(apple.searchParams.get("client_id")).toBe("app.compass.signin");
    expect(apple.searchParams.get("redirect_uri")).toBe(`https://${host}/api/auth/callback/apple`);
    expect(apple.searchParams.get("response_mode")).toBe("form_post");
    expect(begin.headers.getSetCookie().some((c) => c.startsWith("compass.state="))).toBe(true);
  });

  it("makes a new account, signed in, still to confirm it's an adult", async () => {
    googleProfile = { sub: "g-new", email: `new${DOMAIN}`, email_verified: true, name: "New Parent" };
    const { callback } = await signInWithGoogle("localhost:3000");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/auth/after-sign-in?next=%2Fstart");
    expect(callback.headers.getSetCookie().some((c) => c.startsWith("compass_session="))).toBe(true);
    const user = await m.prisma.user.findUniqueOrThrow({
      where: { email: `new${DOMAIN}` },
      include: { accounts: true },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.adultAttestedAt).toBeNull();
    expect(user.accounts.map((a) => a.providerId)).toEqual(["google"]);
  });

  it("links to an existing account with the same confirmed email instead of making another", async () => {
    const existing = await m.prisma.user.create({
      data: { email: `linked${DOMAIN}`, displayName: "Existing", emailVerified: true, adultAttestedAt: new Date() },
    });
    googleProfile = { sub: "g-linked", email: `linked${DOMAIN}`, email_verified: true, name: "Existing" };
    const { callback } = await signInWithGoogle("localhost:3000");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/auth/after-sign-in?next=%2Fstart");
    const users = await m.prisma.user.findMany({ where: { email: `linked${DOMAIN}` }, include: { accounts: true } });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(existing.id);
    expect(users[0].accounts.map((a) => a.providerId)).toEqual(["google"]);
  });

  it("won't attach Google to an account whose email was never confirmed", async () => {
    await m.prisma.user.create({
      data: { email: `unconfirmed${DOMAIN}`, displayName: "Unconfirmed", emailVerified: false },
    });
    googleProfile = { sub: "g-unconfirmed", email: `unconfirmed${DOMAIN}`, email_verified: true, name: "Someone" };
    const { callback } = await signInWithGoogle("localhost:3000");
    expect(callback.headers.get("location")).toContain("error=account_not_linked");
    const user = await m.prisma.user.findUniqueOrThrow({
      where: { email: `unconfirmed${DOMAIN}` },
      include: { accounts: true },
    });
    expect(user.accounts).toHaveLength(0);
  });
});
