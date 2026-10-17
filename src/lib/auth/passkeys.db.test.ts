// Passkeys against a real Postgres, with a software authenticator in
// place of a phone or laptop: adding one, signing in with it, and using
// it as the second step. Runs when TEST_DATABASE_URL is set.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SoftAuthenticator } from "./soft-authenticator";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("passkeys (database)", () => {
  type Mods = {
    auth: typeof import("./auth").auth;
    prisma: typeof import("@/lib/db").prisma;
    passkeys: typeof import("./passkeys");
    hashPassword: typeof import("./password").hashPassword;
  };
  let m: Mods;
  const PASSWORD = "correct horse battery staple";
  const HOST = "localhost:3000";
  const ORIGIN = "http://localhost:3000";
  const DOMAIN = "@passkeytest.invalid";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const [{ auth }, { prisma }, passkeys, { hashPassword }] = await Promise.all([
      import("./auth"),
      import("@/lib/db"),
      import("./passkeys"),
      import("./password"),
    ]);
    m = { auth, prisma, passkeys, hashPassword };
  });

  beforeEach(async () => {
    await m.prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await m.prisma.org.deleteMany({ where: { slug: { startsWith: "passkeytest-" } } });
  });

  afterAll(async () => {
    await m?.prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await m?.prisma.org.deleteMany({ where: { slug: { startsWith: "passkeytest-" } } });
    await m?.prisma.$disconnect();
  });

  const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");
  const headersFor = (cookie = "", host = HOST) => new Headers({ host, cookie });

  async function makeUser(label: string, opts: { organizer?: boolean } = {}) {
    const user = await m.prisma.user.create({
      data: { email: `${label}${DOMAIN}`, displayName: label, emailVerified: true, adultAttestedAt: new Date() },
    });
    await m.prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: await m.hashPassword(PASSWORD) },
    });
    if (opts.organizer) {
      const org = await m.prisma.org.create({
        data: {
          slug: `passkeytest-${label}`,
          unitType: "Troop",
          unitNumber: "7",
          displayName: "Troop 7",
          charterOrg: "Test",
          city: "Test",
          state: "MN",
          scoutmasterName: "Test",
          scoutmasterEmail: `sm-${label}${DOMAIN}`,
        },
      });
      await m.prisma.orgMembership.create({ data: { userId: user.id, orgId: org.id, role: "leader" } });
    }
    return user;
  }

  async function addPasskey(user: { id: string; email: string; displayName: string }, host = HOST) {
    const rp = (await m.passkeys.relyingPartyFor(host))!;
    const device = new SoftAuthenticator();
    const options = await m.passkeys.registrationOptions(user, rp);
    const result = await m.passkeys.registerPasskey(
      user.id,
      rp,
      device.register(options, `http://${host}`) as never,
      "Test device",
    );
    expect(result.ok).toBe(true);
    return device;
  }

  async function passkeySignIn(device: SoftAuthenticator, host = HOST) {
    const start = await m.auth.api.compassPasskeySignInOptions({ headers: headersFor("", host), returnHeaders: true });
    const cookie = cookieHeader(start.headers.getSetCookie());
    const response = device.authenticate(start.response.options, `http://${host}`);
    return m.auth.api.signInCompassPasskey({
      body: { response: response as never },
      headers: headersFor(cookie, host),
      returnHeaders: true,
    });
  }

  it("adds a passkey for the site's relying party", async () => {
    const user = await makeUser("adder");
    await addPasskey(user);
    const rows = await m.prisma.passkey.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rpId: "localhost", name: "Test device", deviceType: "singleDevice" });
  });

  it("won't reuse a registration challenge", async () => {
    const user = await makeUser("reuse");
    const rp = (await m.passkeys.relyingPartyFor(HOST))!;
    const device = new SoftAuthenticator();
    const options = await m.passkeys.registrationOptions(user, rp);
    const answer = device.register(options, ORIGIN) as never;
    expect((await m.passkeys.registerPasskey(user.id, rp, answer, "a")).ok).toBe(true);
    expect(await m.passkeys.registerPasskey(user.id, rp, answer, "b")).toEqual({ ok: false, error: "challenge_expired" });
  });

  it("refuses a passkey made without a fingerprint, face or PIN check", async () => {
    const user = await makeUser("nouv");
    const rp = (await m.passkeys.relyingPartyFor(HOST))!;
    const device = new SoftAuthenticator({ userVerified: false });
    const options = await m.passkeys.registrationOptions(user, rp);
    const result = await m.passkeys.registerPasskey(user.id, rp, device.register(options, ORIGIN) as never, "x");
    expect(result).toEqual({ ok: false, error: "not_verified" });
  });

  it("signs in with a passkey and starts a session, once per challenge", async () => {
    const user = await makeUser("signer");
    const device = await addPasskey(user);
    const { response, headers } = await passkeySignIn(device);
    expect(response.userId).toBe(user.id);
    expect(headers.getSetCookie().some((c) => c.startsWith("compass_session="))).toBe(true);
    expect(await m.prisma.session.count({ where: { userId: user.id } })).toBe(1);
    const row = await m.prisma.passkey.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.counter).toBe(BigInt(1));
    expect(row.lastUsedAt).not.toBeNull();

    // The same answer can't be replayed against a fresh challenge.
    const start = await m.auth.api.compassPasskeySignInOptions({ headers: headersFor(), returnHeaders: true });
    const replay = device.authenticate({ challenge: "stale", rpId: "localhost" }, ORIGIN);
    await expect(
      m.auth.api.signInCompassPasskey({
        body: { response: replay as never },
        headers: headersFor(cookieHeader(start.headers.getSetCookie())),
      }),
    ).rejects.toMatchObject({ body: { code: "PASSKEY_FAILED" } });
  });

  it("refuses a passkey on a site it wasn't made for", async () => {
    const user = await makeUser("elsewhere");
    const device = await addPasskey(user);
    process.env.PASSKEY_EXTRA_HOSTS = "jons-mac.tail1234.ts.net";
    try {
      await expect(passkeySignIn(device, "jons-mac.tail1234.ts.net")).rejects.toMatchObject({
        body: { code: "PASSKEY_FAILED" },
      });
    } finally {
      delete process.env.PASSKEY_EXTRA_HOSTS;
    }
  });

  describe("as the second step", () => {
    async function passwordSignIn(email: string) {
      return m.auth.api.signInEmail({ body: { email, password: PASSWORD }, headers: headersFor(), returnHeaders: true });
    }

    it("asks an organizer with a passkey for it after their password", async () => {
      const user = await makeUser("leader", { organizer: true });
      const device = await addPasskey(user);
      const first = await passwordSignIn(user.email);
      expect(first.response).toMatchObject({ mfaRequired: true });
      expect(await m.prisma.session.count({ where: { userId: user.id } })).toBe(0);
      const cookie = cookieHeader(first.headers.getSetCookie());

      const pending = await m.auth.api.compassMfaPending({ headers: headersFor(cookie) });
      expect(pending).toEqual({ pending: true, totp: false, passkey: true });

      const { options } = await m.auth.api.compassMfaPasskeyOptions({ headers: headersFor(cookie) });
      expect(options.allowCredentials?.map((c) => c.id)).toEqual([device.id]);
      const done = await m.auth.api.verifyCompassMfaPasskey({
        body: { response: device.authenticate(options, ORIGIN) as never },
        headers: headersFor(cookie),
        returnHeaders: true,
      });
      expect(done.response.userId).toBe(user.id);
      expect(done.headers.getSetCookie().some((c) => c.startsWith("compass_session="))).toBe(true);
      expect(await m.prisma.session.count({ where: { userId: user.id } })).toBe(1);
    });

    it("won't accept someone else's passkey", async () => {
      const user = await makeUser("leader2", { organizer: true });
      await addPasskey(user);
      const other = await makeUser("other");
      const otherDevice = await addPasskey(other);
      const first = await passwordSignIn(user.email);
      const cookie = cookieHeader(first.headers.getSetCookie());
      const { options } = await m.auth.api.compassMfaPasskeyOptions({ headers: headersFor(cookie) });
      await expect(
        m.auth.api.verifyCompassMfaPasskey({
          body: { response: otherDevice.authenticate(options, ORIGIN) as never },
          headers: headersFor(cookie),
        }),
      ).rejects.toMatchObject({ body: { code: "PASSKEY_FAILED" } });
      expect(await m.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    });

    it("doesn't add a step for a parent who only uses a passkey to sign in", async () => {
      const user = await makeUser("parent");
      await addPasskey(user);
      const first = await passwordSignIn(user.email);
      expect((first.response as { user?: { id: string } }).user?.id).toBe(user.id);
    });
  });
});
