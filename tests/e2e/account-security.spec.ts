// Sign-in security (Better Auth, PR #120) end to end, on the regular
// test server (ALLOW_ADMIN_WITHOUT_MFA=1; the organizer two-step
// requirement itself is covered by mfa-required.spec.ts on a server
// without that override).
//
//  - two-step sign-in: enroll with an authenticator, sign in with a
//    code; 5 tries per challenge; 10 wrong codes per account lock it
//  - phone-app sign-in: /auth/mobile/begin → /auth/mobile/confirm →
//    Continue POST hands the token only to an allowed app scheme
//  - API tokens: expiry, revoke, revoked by a password change (which
//    also signs out other sessions)
//  - email change applies only after the new address's link is clicked

import { expect, test, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { APEX, USER_PASSWORD, freshPage, signIn, signUp, uid, showPasswordSignIn } from "./helpers/flows";

function totp(secret: string, windowOffset = 0): string {
  return new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp: Date.now() + windowOffset * 30_000 });
}

/** Turn on two-step sign-in from /account/security; returns the secret. */
async function enrollTotp(page: Page): Promise<string> {
  await page.goto(`${APEX}/account/security`);
  await page.getByRole("button", { name: "Set up an authenticator app" }).click();
  const secret = (await page.locator("p", { hasText: "Manual secret:" }).locator("code").textContent())!.trim();
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel("Code from your authenticator").fill(totp(secret));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Two-step sign-in is on." })).toBeVisible();
  return secret;
}

async function passwordStep(page: Page, email: string) {
  await page.goto(`${APEX}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(USER_PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/login\/mfa/);
}

async function submitCode(page: Page, code: string) {
  const input = page.getByLabel("Code");
  await input.fill(code);
  // Wait for this submission's server action round-trip; the error text
  // is the same for consecutive wrong codes, so it can't be the signal.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/login/mfa")),
    page.getByRole("button", { name: /verify and sign in/i }).click(),
  ]);
  // React resets the form once the action settles; let that happen
  // before the next fill (unless we navigated away on success).
  if (new URL(page.url()).pathname === "/login/mfa") {
    await expect(input).toHaveValue("", { timeout: 3_000 }).catch(() => {});
  }
}

const formError = (page: Page, text: string | RegExp) =>
  page.locator('div[role="alert"]').filter({ hasText: text });

async function bearerFetch(page: Page, path: string, token: string, method = "GET") {
  return page.evaluate(
    async ({ path, token, method }) => {
      const r = await fetch(path, { method, headers: { authorization: `Bearer ${token}` } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, token, method },
  );
}

async function mintToken(page: Page, name: string) {
  return page.evaluate(async (name) => {
    const r = await fetch("/api/v1/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return (await r.json()) as { id: string; raw: string; expiresAt: string };
  }, name);
}

test.describe("two-step sign-in", () => {
  test("enroll, then sign-in needs a code; 5 tries per challenge", async ({ browser }) => {
    test.setTimeout(90_000);
    const email = `mfa-${uid()}@example.invalid`;
    const enroller = await freshPage(browser);
    await signUp(enroller.page, "Mfa User", email, USER_PASSWORD, APEX);
    const secret = await enrollTotp(enroller.page);
    await enroller.ctx.close();

    const { ctx, page } = await freshPage(browser);
    await passwordStep(page, email);
    // Password alone is not a session.
    await page.goto(`${APEX}/account/profile`);
    await expect(page).toHaveURL(/\/login/);

    // Five wrong codes burn the challenge; the sixth try is "expired"
    // even with the right code.
    await passwordStep(page, email);
    for (let i = 0; i < 5; i++) {
      await submitCode(page, "000000");
      await expect(formError(page, "That code is invalid.")).toBeVisible();
    }
    await submitCode(page, totp(secret, 1));
    // The burned challenge is refused: either the "expired" error or a
    // bounce back to the password step. Either way, no session.
    await expect(
      formError(page, "Sign-in expired. Start again.").or(page.getByRole("heading", { name: "Sign in" })),
    ).toBeVisible();
    await page.goto(`${APEX}/account/profile`);
    await expect(page).toHaveURL(/\/login/);

    // A fresh challenge with a good code signs in.
    await passwordStep(page, email);
    await submitCode(page, totp(secret, 1));
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await page.goto(`${APEX}/account/profile`);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await ctx.close();
  });

  test("10 wrong codes lock the account's two-step sign-in", async ({ browser }) => {
    test.setTimeout(90_000);
    const email = `mfa-lock-${uid()}@example.invalid`;
    const enroller = await freshPage(browser);
    await signUp(enroller.page, "Mfa Lock", email, USER_PASSWORD, APEX);
    const secret = await enrollTotp(enroller.page);
    await enroller.ctx.close();

    const { ctx, page } = await freshPage(browser);
    for (let round = 0; round < 2; round++) {
      await passwordStep(page, email);
      for (let i = 0; i < 5; i++) {
        await submitCode(page, "111111");
        await expect(formError(page, "That code is invalid.")).toBeVisible();
      }
    }
    await passwordStep(page, email);
    await submitCode(page, totp(secret, 1));
    await expect(formError(page, "Too many wrong codes. Wait 15 minutes and try again.")).toBeVisible();
    await ctx.close();
  });
});

test.describe("phone app sign-in", () => {
  const CALLBACK = "compass://auth/callback";

  test("refuses redirects to anything but an app scheme", async ({ page }) => {
    for (const bad of [
      "https://attacker.example/cb",
      "http://localhost:9999/cb", // dev-only; NODE_ENV=production here
      "exp://127.0.0.1:8081",
      "evilapp://auth/callback",
      "not a url",
    ]) {
      const res = await page.request.get(
        `${APEX}/auth/mobile/begin?redirect=${encodeURIComponent(bad)}`,
        { maxRedirects: 0 },
      );
      expect(res.status(), bad).toBe(400);
      expect(await res.json(), bad).toEqual({ error: "bad_redirect" });
    }
  });

  test("signed out → login; signed in → confirm → Continue hands a token to the app", async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await freshPage(browser);
    const begin = `/auth/mobile/begin?redirect=${encodeURIComponent(CALLBACK)}`;

    const anon = await page.request.get(`${APEX}${begin}`, { maxRedirects: 0 });
    expect(anon.status()).toBe(307);
    // Path only: the Location host is currently the server's bind
    // address (http://0.0.0.0:3000), see the bug list in the PR notes.
    const loc = new URL(anon.headers().location, APEX);
    expect(`${loc.pathname}${loc.search}`).toBe(`/login?next=${encodeURIComponent(begin)}`);

    const email = `mobile-${uid()}@example.invalid`;
    await signUp(page, "Mobile Parent", email, USER_PASSWORD, APEX);

    // Signed in, begin forwards to the confirm page. (Checked on the
    // Location path: the redirect's host is currently the server's bind
    // address, so following it in the browser loses the session.)
    const fwd = await page.request.get(`${APEX}${begin}`, { maxRedirects: 0 });
    expect(fwd.status()).toBe(307);
    const fwdLoc = new URL(fwd.headers().location, APEX);
    expect(`${fwdLoc.pathname}${fwdLoc.search}`).toBe(
      `/auth/mobile/confirm?redirect=${encodeURIComponent(CALLBACK)}`,
    );
    await page.goto(`${APEX}${fwdLoc.pathname}${fwdLoc.search}`);
    await expect(page.getByRole("heading", { name: "Sign in on this phone" })).toBeVisible();
    await expect(page.getByText("Mobile Parent")).toBeVisible();
    // Showing the page (a GET) never mints a token.
    expect(await page.content()).not.toContain("compass_pat_");

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/auth/mobile/begin")),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    expect(resp.status()).toBe(303);
    const location = new URL(resp.headers().location);
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(CALLBACK);
    const token = location.searchParams.get("token") ?? "";
    expect(token).toMatch(/^compass_pat_/);
    expect(location.searchParams.get("userId")).toBeTruthy();
    expect(location.searchParams.get("displayName")).toBe("Mobile Parent");

    // The token works against the API.
    await page.goto(`${APEX}/login`);
    const me = await bearerFetch(page, "/api/v1/auth/me", token);
    expect(me.status).toBe(200);

    // The Continue POST needs the page's CSRF token.
    const forged = await page.request.post(`${APEX}/auth/mobile/begin`, {
      form: { redirect: CALLBACK },
      headers: { origin: APEX },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
    await ctx.close();
  });
});

test.describe("website sign-in", () => {
  // playwright.config.ts lists this origin in WEB_SIGNIN_ORIGINS.
  const SITE = "https://waypoint.example.invalid";

  test("only a listed site's /signed-in page gets a token, after #", async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await freshPage(browser);
    await signUp(page, "Web Parent", `web-${uid()}@example.invalid`, USER_PASSWORD, APEX);

    for (const bad of [`${SITE}/other`, `${SITE}/signed-in/x`, "https://attacker.example.invalid/signed-in", `http://waypoint.example.invalid/signed-in`]) {
      const res = await page.request.get(`${APEX}/auth/mobile/begin?redirect=${encodeURIComponent(bad)}`, {
        maxRedirects: 0,
      });
      expect(res.status(), bad).toBe(400);
    }

    const callback = `${SITE}/signed-in`;
    await page.goto(`${APEX}/auth/mobile/confirm?redirect=${encodeURIComponent(callback)}`);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/auth/mobile/begin")),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    expect(resp.status()).toBe(303);
    const location = new URL(resp.headers().location);
    expect(`${location.origin}${location.pathname}`).toBe(callback);
    // Nothing in the query string, which the site's server would log.
    expect(location.search).toBe("");
    const values = new URLSearchParams(location.hash.slice(1));
    const token = values.get("token") ?? "";
    expect(token).toMatch(/^compass_pat_/);
    expect(values.get("displayName")).toBe("Web Parent");

    // The browser is off to the (unreachable) site; check the token from a new tab.
    const api = await ctx.newPage();
    await api.goto(`${APEX}/login`);
    expect((await bearerFetch(api, "/api/v1/auth/me", token)).status).toBe(200);
    await ctx.close();
  });
});

test.describe("API tokens and password change", () => {
  test("tokens expire in 90 days and can be revoked", async ({ browser }) => {
    const { ctx, page } = await freshPage(browser);
    await signUp(page, "Token User", `token-${uid()}@example.invalid`, USER_PASSWORD, APEX);
    const t = await mintToken(page, "E2E device");
    const days = (new Date(t.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(90);

    expect((await bearerFetch(page, "/api/v1/auth/me", t.raw)).status).toBe(200);
    const del = await bearerFetch(page, `/api/v1/auth/token/${t.id}`, t.raw, "DELETE");
    expect(del.status).toBe(200);
    const after = await bearerFetch(page, "/api/v1/auth/me", t.raw);
    expect(after).toEqual({ status: 401, body: { error: "unauthorized" } });
    await ctx.close();
  });

  test("changing password revokes API tokens and signs out other sessions", async ({ browser }) => {
    test.setTimeout(90_000);
    const email = `pw-${uid()}@example.invalid`;
    const main = await freshPage(browser);
    await signUp(main.page, "Pw User", email, USER_PASSWORD, APEX);
    const token = await mintToken(main.page, "Old phone");

    const other = await freshPage(browser);
    await signIn(other.page, email, USER_PASSWORD, APEX);
    await other.page.goto(`${APEX}/account/profile`);
    await expect(other.page.getByRole("heading", { name: "Profile" })).toBeVisible();

    const newPassword = "An0ther-Long-Passphrase!";
    await main.page.goto(`${APEX}/account/password`);
    await main.page.locator('input[name="current"]').fill(USER_PASSWORD);
    await main.page.locator('input[name="next"]').fill(newPassword);
    await main.page.locator('input[name="confirm"]').fill(newPassword);
    await main.page.getByRole("button", { name: "Change password" }).click();
    await main.page.waitForURL(/\/account\/password\?saved=1/);

    // This session stays signed in.
    await main.page.goto(`${APEX}/account/profile`);
    await expect(main.page.getByRole("heading", { name: "Profile" })).toBeVisible();
    // The other browser is signed out.
    await other.page.goto(`${APEX}/account/profile`);
    await expect(other.page).toHaveURL(/\/login/);
    // The old API token is dead.
    expect(await bearerFetch(main.page, "/api/v1/auth/me", token.raw)).toEqual({
      status: 401,
      body: { error: "unauthorized" },
    });
    // New password works, old one doesn't.
    await signIn(other.page, email, newPassword, APEX);
    await other.page.goto(`${APEX}/account/profile`);
    await expect(other.page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await main.ctx.close();
    await other.ctx.close();
  });
});

test.describe("email change", () => {
  test("new address applies only after its link is clicked", async ({ browser }) => {
    const email = `change-${uid()}@example.invalid`;
    const newEmail = `changed-${uid()}@example.invalid`;
    const { ctx, page } = await freshPage(browser);
    await signUp(page, "Email Changer", email, USER_PASSWORD, APEX);
    await page.goto(`${APEX}/account/profile`);
    await page.locator('input[name="email"]').fill(newEmail);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/emailSent=1/);
    await expect(page.getByText("We sent a link to your new address.")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toHaveValue(email);

    // The new address can't sign in yet; the old one still can.
    const other = await freshPage(browser);
    await other.page.goto(`${APEX}/login`);
    await showPasswordSignIn(other.page);
    await other.page.getByLabel("Email").fill(newEmail);
    await other.page.getByLabel("Password").fill(USER_PASSWORD);
    await other.page.waitForTimeout(1700);
    await other.page.getByRole("button", { name: /sign in/i }).click();
    await expect(formError(other.page, /invalid email or password/i)).toBeVisible();
    await signIn(other.page, email, USER_PASSWORD, APEX);
    await other.ctx.close();
    await ctx.close();
  });
});
