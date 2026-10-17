// Sign-in against a real Postgres: migrated passwords, the MFA gate, the
// admin SSO policy and unit claiming. Runs when TEST_DATABASE_URL points
// at a migrated database (CI sets it); skipped otherwise.
//
//   createdb compass_unit
//   DATABASE_URL=postgresql://…/compass_unit npx prisma migrate deploy
//   TEST_DATABASE_URL=postgresql://…/compass_unit npx vitest run src/lib/auth

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Better Auth sign-in (database)", () => {
  type Mods = {
    auth: typeof import("./auth").auth;
    prisma: typeof import("@/lib/db").prisma;
    hashPassword: typeof import("./password").hashPassword;
    generateSecret: typeof import("./mfa").generateSecret;
  };
  let m: Mods;
  const PASSWORD = "correct horse battery staple";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const [{ auth }, { prisma }, { hashPassword }, { generateSecret }] = await Promise.all([
      import("./auth"),
      import("@/lib/db"),
      import("./password"),
      import("./mfa"),
    ]);
    m = { auth, prisma, hashPassword, generateSecret };
  });

  beforeEach(async () => {
    // Other *.db.test.ts files share the database and run in parallel, so
    // only clear what this file creates. Deleting a user cascades to its
    // sessions, accounts, memberships and backup codes.
    await m.prisma.user.deleteMany({ where: { email: { endsWith: "@authtest.invalid" } } });
    await m.prisma.org.deleteMany({ where: { slug: { startsWith: "authtest-" } } });
    await m.prisma.verification.deleteMany({ where: { identifier: { startsWith: "mfa-" } } });
  });

  afterAll(async () => {
    await m?.prisma.$disconnect();
  });

  // A user as the migration leaves them: argon2 hash on a credential row.
  async function migratedUser(email: string, extra: { totpSecret?: string } = {}) {
    const user = await m.prisma.user.create({
      data: {
        email,
        displayName: "Test User",
        emailVerified: true,
        ...(extra.totpSecret ? { totpSecret: extra.totpSecret, totpEnrolledAt: new Date() } : {}),
      },
    });
    await m.prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await m.hashPassword(PASSWORD),
      },
    });
    return user;
  }

  async function sessionCount() {
    return m.prisma.session.count({ where: { user: { email: { endsWith: "@authtest.invalid" } } } });
  }

  function cookieHeader(setCookies: string[]): string {
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  }

  async function signIn(email: string, password = PASSWORD) {
    return m.auth.api.signInEmail({
      body: { email, password },
      headers: new Headers(),
      returnHeaders: true,
    });
  }

  it("signs in with a password hash carried over from Lucia", async () => {
    const user = await migratedUser("migrated@authtest.invalid");
    const { response, headers } = await signIn("migrated@authtest.invalid");
    expect((response as { user: { id: string } }).user.id).toBe(user.id);
    const cookies = headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("compass_session="))).toBe(true);

    const session = await m.auth.api.getSession({
      headers: new Headers({ cookie: cookieHeader(cookies) }),
    });
    expect(session?.user.id).toBe(user.id);
  });

  it("rejects a wrong password", async () => {
    await migratedUser("wrong@authtest.invalid");
    await expect(signIn("wrong@authtest.invalid", "not the password at all")).rejects.toThrow();
    expect(await sessionCount()).toBe(0);
  });

  describe("MFA", () => {
    async function challenge() {
      const secret = m.generateSecret();
      const user = await migratedUser("mfa@authtest.invalid", { totpSecret: secret });
      const { response, headers } = await signIn("mfa@authtest.invalid");
      return { user, secret, response, cookies: headers.getSetCookie() };
    }

    function codeFor(secret: string) {
      return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
    }

    it("holds the session back until the code is checked", async () => {
      const { user, secret, response, cookies } = await challenge();
      expect(response).toEqual({ mfaRequired: true });
      expect(await sessionCount()).toBe(0);
      expect(cookies.some((c) => c.startsWith("compass.mfa_pending="))).toBe(true);

      const res = await m.auth.api.verifyCompassMfa({
        body: { code: codeFor(secret) },
        headers: new Headers({ cookie: cookieHeader(cookies) }),
        returnHeaders: true,
      });
      expect(res.response.userId).toBe(user.id);
      expect(await sessionCount()).toBe(1);
      expect(res.headers.getSetCookie().some((c) => c.startsWith("compass_session="))).toBe(true);

      // The plain secret (as enrolled before sealing) is sealed on first use.
      const row = await m.prisma.user.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
      expect(row?.totpSecret?.startsWith("enc:v1:")).toBe(true);
      expect(row?.totpSecret).not.toContain(secret);
    });

    it("refuses a forged challenge cookie carrying a user id", async () => {
      const { user, secret } = await challenge();
      await expect(
        m.auth.api.verifyCompassMfa({
          body: { code: codeFor(secret) },
          headers: new Headers({ cookie: `compass.mfa_pending=${user.id}` }),
        }),
      ).rejects.toThrow();
      expect(await sessionCount()).toBe(0);
    });

    it("burns the challenge after five wrong codes", async () => {
      const { secret, cookies } = await challenge();
      const h = () => new Headers({ cookie: cookieHeader(cookies) });
      for (let i = 0; i < 5; i++) {
        await expect(m.auth.api.verifyCompassMfa({ body: { code: "000000" }, headers: h() })).rejects.toThrow();
      }
      await expect(
        m.auth.api.verifyCompassMfa({ body: { code: codeFor(secret) }, headers: h() }),
      ).rejects.toThrow(/expired/i);
      expect(await sessionCount()).toBe(0);
    });

    it("can't be replayed once the session exists", async () => {
      const { secret, cookies } = await challenge();
      const h = () => new Headers({ cookie: cookieHeader(cookies) });
      await m.auth.api.verifyCompassMfa({ body: { code: codeFor(secret) }, headers: h() });
      await expect(
        m.auth.api.verifyCompassMfa({ body: { code: codeFor(secret) }, headers: h() }),
      ).rejects.toThrow();
      expect(await sessionCount()).toBe(1);
    });
  });

  describe("admin SSO policy", () => {
    const env = process.env as Record<string, string | undefined>;
    let prevNodeEnv: string | undefined;
    beforeEach(() => {
      prevNodeEnv = env.NODE_ENV;
    });
    afterAll(() => {
      env.NODE_ENV = prevNodeEnv;
    });

    it("refuses password sign-in for a unit admin in production", async () => {
      const user = await migratedUser("admin@authtest.invalid");
      const org = await m.prisma.org.create({
        data: {
          slug: "authtest-admin",
          unitType: "Troop",
          unitNumber: "1",
          displayName: "Troop 1",
          charterOrg: "Test",
          city: "Test",
          state: "MN",
          scoutmasterName: "Test",
          scoutmasterEmail: "admin@authtest.invalid",
        },
      });
      await m.prisma.orgMembership.create({ data: { userId: user.id, orgId: org.id, role: "admin" } });
      env.NODE_ENV = "production";
      try {
        await expect(signIn("admin@authtest.invalid")).rejects.toThrow(/Google or Apple/);
      } finally {
        env.NODE_ENV = prevNodeEnv;
      }
      expect(await sessionCount()).toBe(0);
    });

    // A unit made at /start has a password admin; once they set up
    // two-step, the password takes them to the code prompt.
    it("lets a unit admin with two-step sign-in use their password in production", async () => {
      const user = await migratedUser("admin2@authtest.invalid", { totpSecret: m.generateSecret() });
      const org = await m.prisma.org.create({
        data: {
          slug: "authtest-admin2",
          unitType: "Troop",
          unitNumber: "1",
          displayName: "Troop 1",
          charterOrg: "Test",
          city: "Test",
          state: "MN",
          scoutmasterName: "Test",
          scoutmasterEmail: "admin2@authtest.invalid",
        },
      });
      await m.prisma.orgMembership.create({ data: { userId: user.id, orgId: org.id, role: "admin" } });
      env.NODE_ENV = "production";
      try {
        const { response } = await signIn("admin2@authtest.invalid");
        expect(response).toEqual({ mfaRequired: true });
      } finally {
        env.NODE_ENV = prevNodeEnv;
      }
      expect(await sessionCount()).toBe(0);
    });
  });

  describe("claiming a unit by scoutmaster email", () => {
    async function org(slug: string, scoutmasterEmail: string) {
      return m.prisma.org.create({
        data: {
          slug,
          unitType: "Troop",
          unitNumber: "2",
          displayName: "Troop 2",
          charterOrg: "Test",
          city: "Test",
          state: "MN",
          scoutmasterName: "Test",
          scoutmasterEmail,
        },
      });
    }

    it("doesn't make an unverified password sign-up the admin", async () => {
      const o = await org("authtest-claim1", "sm@authtest.invalid");
      const res = await m.auth.api.signUpEmail({
        body: { email: "sm@authtest.invalid", password: PASSWORD, name: "Not Really The SM" },
        headers: new Headers(),
      });
      const memberships = await m.prisma.orgMembership.count({ where: { userId: res.user.id, orgId: o.id } });
      expect(memberships).toBe(0);
    });

    it("grants admin once the email is confirmed", async () => {
      const o = await org("authtest-claim2", "sm2@authtest.invalid");
      const res = await m.auth.api.signUpEmail({
        body: { email: "sm2@authtest.invalid", password: PASSWORD, name: "Scoutmaster" },
        headers: new Headers(),
      });
      const { createEmailVerificationToken } = await import("better-auth/api");
      const ctx = await m.auth.$context;
      const token = await createEmailVerificationToken(ctx.secret, "sm2@authtest.invalid");
      await m.auth.api.verifyEmail({ query: { token }, headers: new Headers() });

      const membership = await m.prisma.orgMembership.findFirst({
        where: { userId: res.user.id, orgId: o.id },
      });
      expect(membership?.role).toBe("admin");
      expect((await m.prisma.org.findUnique({ where: { id: o.id } }))?.ownerId).toBe(res.user.id);
    });
  });

  describe("changing email", () => {
    it("keeps the old address until the link sent to the new one is clicked", async () => {
      const user = await migratedUser("old@authtest.invalid");
      const { headers } = await signIn("old@authtest.invalid");
      const cookie = cookieHeader(headers.getSetCookie());
      await m.auth.api.changeEmail({
        body: { newEmail: "new@authtest.invalid" },
        headers: new Headers({ cookie }),
      });
      expect((await m.prisma.user.findUnique({ where: { id: user.id } }))?.email).toBe(
        "old@authtest.invalid",
      );

      const { createEmailVerificationToken } = await import("better-auth/api");
      const ctx = await m.auth.$context;
      const token = await createEmailVerificationToken(
        ctx.secret,
        "old@authtest.invalid",
        "new@authtest.invalid",
        undefined,
        { requestType: "change-email-verification" },
      );
      await m.auth.api.verifyEmail({ query: { token }, headers: new Headers({ cookie }) });
      const after = await m.prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.email).toBe("new@authtest.invalid");
      expect(after?.emailVerified).toBe(true);
    });

    it("doesn't sign in a browser that clicks the link while signed out", async () => {
      const secret = m.generateSecret();
      await migratedUser("mfa-change@authtest.invalid", { totpSecret: secret });
      const before = await sessionCount();
      const { createEmailVerificationToken } = await import("better-auth/api");
      const ctx = await m.auth.$context;
      const token = await createEmailVerificationToken(
        ctx.secret,
        "mfa-change@authtest.invalid",
        "mfa-new@authtest.invalid",
        undefined,
        { requestType: "change-email-verification" },
      );
      const { headers } = await m.auth.api.verifyEmail({
        query: { token },
        headers: new Headers(),
        returnHeaders: true,
      });
      expect(await sessionCount()).toBe(before);
      expect(
        headers.getSetCookie().some((c) => /^compass_session=[^;]+/.test(c) && !/Max-Age=0/i.test(c)),
      ).toBe(false);
    });
  });
});
