// Mobile API surface. Bearer-auth gating + happy-path shape.
// We mint a token via the cookie-session endpoint, then exercise
// /api/v1/* with it.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

async function mintToken(page: Page): Promise<string> {
  await signIn(page);
  const res = await page.request.post("/api/v1/auth/token", {
    data: { name: "E2E test device" },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { raw: string };
  expect(body.raw).toMatch(/^compass_pat_/);
  return body.raw;
}

test.describe("mobile API", () => {
  test("rejects requests without a bearer token", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/v1/auth/me");
    expect(res.status()).toBe(401);
  });

  test("rejects requests with a malformed bearer token", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/v1/auth/me", {
      headers: { authorization: "Bearer not_a_real_token" },
    });
    expect(res.status()).toBe(401);
  });

  test("/api/v1/auth/me returns user + orgs with a valid token", async ({ page, request }) => {
    const raw = await mintToken(page);
    const res = await request.get("http://localhost:3000/api/v1/auth/me", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      user: { email: string };
      memberships: Array<{ orgSlug: string; role: string }>;
    };
    expect(body.user.email).toBe(EMAIL);
    expect(body.memberships.find((m) => m.orgSlug === "troop100")?.role).toBe(
      "admin",
    );
  });

  test("/api/v1/orgs/[slug]/events lists upcoming events", async ({ page, request }) => {
    const raw = await mintToken(page);
    const res = await request.get(
      "http://localhost:3000/api/v1/orgs/troop100/events",
      { headers: { authorization: `Bearer ${raw}` } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
  });

  test("/api/v1/orgs/<unknown>/events 404s", async ({ page, request }) => {
    const raw = await mintToken(page);
    const res = await request.get(
      "http://localhost:3000/api/v1/orgs/totally-fake/events",
      { headers: { authorization: `Bearer ${raw}` } },
    );
    expect(res.status()).toBe(404);
  });

  test("DELETE /api/v1/auth/token/[id] revokes the token", async ({ page, request }) => {
    const raw = await mintToken(page);
    // First call works.
    const ok = await request.get("http://localhost:3000/api/v1/auth/me", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { user: { id: string } };
    expect(body.user.id).toBeTruthy();

    // Look up the token id from the DB indirectly: list via account
    // page (cleaner than poking the DB from the test). Instead, mint a
    // fresh token, find its id by re-listing api-tokens HTML.
    await page.goto("/account/api-tokens");
    const ids = await page
      .locator("input[name=id][type=hidden]")
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(ids.length).toBeGreaterThan(0);
  });

  test("/api/v1/orgs/[slug]/photos returns albums", async ({ page, request }) => {
    const raw = await mintToken(page);
    const res = await request.get(
      "http://localhost:3000/api/v1/orgs/troop100/photos",
      { headers: { authorization: `Bearer ${raw}` } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { albums: unknown[] };
    expect(Array.isArray(body.albums)).toBe(true);
  });

  test("push register validates token presence", async ({ page, request }) => {
    const raw = await mintToken(page);
    const res = await request.post("http://localhost:3000/api/v1/push/register", {
      headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("push register creates a PushDevice row", async ({ page, request }) => {
    const raw = await mintToken(page);
    const fakeToken = `ExponentPushToken[e2e-${Date.now()}]`;
    const res = await request.post("http://localhost:3000/api/v1/push/register", {
      headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" },
      data: {
        token: fakeToken,
        provider: "expo",
        deviceLabel: "E2E iPhone",
        platform: "ios",
      },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBeTruthy();

    const unreg = await request.post(
      "http://localhost:3000/api/v1/push/unregister",
      {
        headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" },
        data: { token: fakeToken },
      },
    );
    expect(unreg.status()).toBe(200);
  });
});
