// Demo-data smoke tests. Run after `make bootstrap` against the live
// dev server (port from $PORT, default 3000). Pure HTTP probes — no
// DB access, no test DB swap. Verifies the seed produced the orgs and
// content the rest of the app expects.
//
//   make e2e
//   PORT=5050 node --test scripts/e2e-demo.test.mjs
//
// Why node:http instead of fetch: undici (Node's built-in fetch) treats
// `Host` as a forbidden header and silently overwrites it. We need to
// hit `troop100.localhost` etc. via the Host header on a real localhost
// TCP connection, which only works through node:http.

import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";

const PORT = Number(process.env.PORT || 3000);

const DEMO_ORGS = [
  { slug: "troop100",   displayName: "Sample Troop 100" },
  { slug: "pack100",    displayName: "Sample Pack 100" },
  { slug: "gstroop100", displayName: "Sample Girl Scout Troop 100" },
];

// Per-org admins use the form-post /login flow on their subdomain.
// The apex login (super admin) is a JS-driven email gate: it fetches a
// CSRF token from /api/csrf and POSTs JSON to /api/auth/login. We test
// both shapes so the smoke covers what users actually hit.
const DEMO_LOGINS = [
  { email: "scoutmaster@example.invalid",  host: "troop100.localhost",   label: "troop admin" },
  { email: "cubmaster@example.invalid",    host: "pack100.localhost",    label: "pack admin" },
  { email: "troop-leader@example.invalid", host: "gstroop100.localhost", label: "gs troop admin" },
];

const DEMO_PASSWORD = "compassdemo123";

function req(host, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = httpRequest(
      {
        hostname: "localhost",
        port: PORT,
        path,
        method,
        headers: { Host: host, ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            setCookies: res.headers["set-cookie"] || [],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1] : null;
}

function cookieJar(setCookies) {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

test("server is reachable: /healthz", async () => {
  const r = await req("localhost", "/healthz");
  assert.equal(r.status, 200);
  assert.equal(r.body.trim(), "ok");
});

test("/readyz reports ready (db reachable)", async () => {
  const r = await req("localhost", "/readyz");
  assert.equal(r.status, 200);
});

test("apex marketing site renders", async () => {
  const r = await req("localhost", "/");
  assert.equal(r.status, 200);
  assert.match(r.body, /Compass/i);
});

test("/api/orgs lists all three demo orgs as isDemo", async () => {
  const r = await req("localhost", "/api/orgs");
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.ok(body.ok, "ok flag");
  const slugs = body.orgs.map((o) => o.slug).sort();
  assert.deepEqual(slugs, ["gstroop100", "pack100", "troop100"]);
  for (const o of body.orgs) {
    assert.equal(o.isDemo, true, `${o.slug} should be flagged isDemo`);
  }
});

test("unknown subdomain returns 404", async () => {
  const r = await req("doesnotexist.localhost", "/");
  assert.equal(r.status, 404);
});

for (const org of DEMO_ORGS) {
  test(`${org.slug}: home page contains seeded display name`, async () => {
    const r = await req(`${org.slug}.localhost`, "/");
    assert.equal(r.status, 200);
    assert.ok(
      r.body.includes(org.displayName),
      `expected "${org.displayName}" in ${org.slug} home page`,
    );
  });

  test(`${org.slug}: /login renders a CSRF token`, async () => {
    const r = await req(`${org.slug}.localhost`, "/login");
    assert.equal(r.status, 200);
    const csrf = extract(r.body, /name="csrf"\s+value="([^"]+)"/);
    assert.ok(csrf, `${org.slug} login page should embed a csrf token`);
  });

  test(`${org.slug}: /admin redirects anonymous visitors to login`, async () => {
    const r = await req(`${org.slug}.localhost`, "/admin");
    // Express may emit 301 (trailing-slash normalize) or 302 (auth gate).
    assert.ok(
      [301, 302, 303, 307, 308].includes(r.status),
      `expected a redirect, got ${r.status}`,
    );
    const loc = r.headers.location || "";
    assert.match(
      loc,
      /(login|admin\/?$)/i,
      `redirect should target login or normalized /admin/, got "${loc}"`,
    );
  });
}

test("apex /auth/mobile/begin: full mobile sign-in round-trip", async () => {
  // Mobile-app flow: user signs in at the apex (no org context),
  // /auth/mobile/begin issues a token + redirects to compass://...,
  // app then calls /api/v1/auth/me to discover memberships.

  // 1. CSRF + cookie
  const csrf = await req("localhost", "/api/csrf");
  assert.equal(csrf.status, 200);
  const csrfTok = JSON.parse(csrf.body).token;
  let cookies = cookieJar(csrf.setCookies);

  // 2. Apex email/password login (single-org user — troop admin)
  const loginBody = JSON.stringify({
    email: "scoutmaster@example.invalid",
    password: DEMO_PASSWORD,
  });
  const login = await req("localhost", "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(loginBody),
      "X-CSRF-Token": csrfTok,
      Cookie: cookies,
    },
    body: loginBody,
  });
  assert.equal(login.status, 200, `login: ${login.body.slice(0, 200)}`);
  cookies = [cookieJar(login.setCookies), cookies].filter(Boolean).join("; ");

  // 3. /auth/mobile/begin at apex (no req.org) with valid Lucia cookie.
  const begin = await req(
    "localhost",
    "/auth/mobile/begin?redirect=compass%3A%2F%2Fcallback",
    { headers: { Cookie: cookies } },
  );
  assert.equal(begin.status, 302);
  const loc = begin.headers.location || "";
  assert.match(loc, /^compass:\/\/callback\?/, `expected deep-link, got ${loc}`);
  const url = new URL(loc);
  const token = url.searchParams.get("token");
  assert.ok(token && token.length > 16, "token in deep-link");

  // 4. Bad redirect scheme → 400
  const bad = await req(
    "localhost",
    "/auth/mobile/begin?redirect=https%3A%2F%2Fevil.com",
    { headers: { Cookie: cookies } },
  );
  assert.equal(bad.status, 400);

  // 5. /api/v1/auth/me with bearer returns the membership list.
  const me = await req("localhost", "/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(me.status, 200);
  const meBody = JSON.parse(me.body);
  assert.ok(Array.isArray(meBody.memberships) && meBody.memberships.length > 0);
  const slugs = meBody.memberships.map((m) => m.orgSlug);
  assert.ok(
    slugs.includes("troop100"),
    `expected troop100 in memberships, got ${slugs.join(",")}`,
  );
});

test("apex super-admin login via JSON API (super@compass.example)", async () => {
  // Apex login is a single-page JS gate: GET /api/csrf, POST /api/auth/login.
  const csrfRes = await req("localhost", "/api/csrf");
  assert.equal(csrfRes.status, 200);
  const { token } = JSON.parse(csrfRes.body);
  assert.ok(token, "csrf token from /api/csrf");
  const cookies = cookieJar(csrfRes.setCookies);

  const body = JSON.stringify({
    email: "super@compass.example",
    password: DEMO_PASSWORD,
  });
  const post = await req("localhost", "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "x-csrf-token": token,
      Cookie: cookies,
    },
    body,
  });
  assert.equal(
    post.status,
    200,
    `super-admin login should return 200, got ${post.status}: ${post.body.slice(0, 200)}`,
  );
  const sessionSet = post.setCookies.find((c) =>
    /scouthosting|compass[_-]?session|auth_session/i.test(c),
  );
  assert.ok(
    sessionSet,
    `expected a session cookie on super-admin login, got: ${post.setCookies.join(" | ")}`,
  );
});

for (const login of DEMO_LOGINS) {
  test(`demo login (form post): ${login.label} (${login.email})`, async () => {
    const get = await req(login.host, "/login");
    assert.equal(get.status, 200);
    const csrf = extract(get.body, /name="csrf"\s+value="([^"]+)"/);
    assert.ok(csrf, `csrf token on /login for ${login.host}`);
    const formStartedAt = extract(
      get.body,
      /name="form_started_at"\s+value="([^"]+)"/,
    );
    const cookies = cookieJar(get.setCookies);

    const params = new URLSearchParams();
    params.set("email", login.email);
    params.set("password", DEMO_PASSWORD);
    params.set("csrf", csrf);
    if (formStartedAt) params.set("form_started_at", formStartedAt);
    const body = params.toString();

    const post = await req(login.host, "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        Cookie: cookies,
      },
      body,
    });

    assert.ok(
      [200, 302, 303].includes(post.status),
      `login POST status ${post.status}; body head: ${post.body.slice(0, 200)}`,
    );
    const sessionSet = post.setCookies.find((c) =>
      /scouthosting|compass[_-]?session|auth_session/i.test(c),
    );
    assert.ok(
      sessionSet,
      `expected a session cookie on ${login.label} login, got: ${post.setCookies.join(" | ")}`,
    );
    // The session cookie must not be empty (logout sets it to "").
    const v = sessionSet.split("=")[1].split(";")[0];
    assert.ok(v && v.length > 4, `session cookie should be non-empty: ${sessionSet}`);
  });
}
