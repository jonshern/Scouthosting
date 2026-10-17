// Signed-out partial (RSC) requests to admin pages must not render them.
// Next skips the admin layout on a client-side navigation when the
// router state (sent by the client) says it's mounted, so each page
// checks access itself (src/lib/admin/guard.ts). This sends the same
// headers a navigation inside /admin would, with no session, to every
// admin page that has no dynamic segment.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_PORT } from "./helpers/ports";

const ADMIN_DIR = path.resolve(__dirname, "../../src/app/o/[slug]/admin");

function staticRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (!statSync(p).isDirectory()) {
      if (name === "page.tsx") out.push(prefix);
      continue;
    }
    if (name.startsWith("[") || name.startsWith("(") || name.startsWith("_")) continue;
    out.push(...staticRoutes(p, `${prefix}/${name}`));
  }
  return out;
}

// Router state for "already inside /o/troop100/admin" (and inside
// admin/treasury for treasury pages): those layout segments are
// present, so Next renders only the page below them.
function routerState(route: string): string {
  const page: unknown[] = ["__PAGE__", {}];
  const below = route.startsWith("/treasury") ? ["treasury", { children: page }] : page;
  return encodeURIComponent(
    JSON.stringify([
      "",
      {
        children: [
          "o",
          {
            children: [
              ["slug", "troop100", "d", null],
              { children: ["admin", { children: below }] },
            ],
          },
        ],
      },
    ]),
  );
}

function rscHeaders(route: string) {
  return {
    host: `troop100.localhost:${E2E_PORT}`,
    rsc: "1",
    "next-url": route.startsWith("/treasury") ? "/o/troop100/admin/treasury" : "/o/troop100/admin",
    "next-router-state-tree": routerState(route),
  };
}

const routes = staticRoutes(ADMIN_DIR);

test("finds the admin pages", () => {
  expect(routes.length).toBeGreaterThan(30);
});

for (const route of routes) {
  test(`signed-out RSC request can't render /admin${route || "/"}`, async ({ request }) => {
    const res = await request.get(`http://localhost:${E2E_PORT}/o/troop100/admin${route}?tab=adults`, {
      headers: rscHeaders(route),
    });
    const body = await res.text();
    // Next answers an RSC request without its _rsc cache key with a
    // redirect that adds it; that's followed. The seeded roster's
    // addresses all end in example.invalid, so a rendered roster leaks
    // some.
    expect(body, `admin data leaked from /admin${route}`).not.toContain("@example.invalid");
    // A guarded page answers a signed-out request with a redirect to
    // sign-in inside the RSC payload.
    expect(body, `/admin${route} rendered without a session`).toContain("NEXT_REDIRECT");
    expect(body).toContain("/login?next=");
  });
}
