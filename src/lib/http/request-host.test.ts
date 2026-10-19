// Static checks: nothing builds a link or redirect from the request's
// own idea of where it is.
//
//   - `new URL(path, req.url)`: behind the blue-green switch or any
//     proxy, req.url is the address `next start` listens on
//     (http://127.0.0.1:3001), not the one in the visitor's address
//     bar. Use redirectTo() from @/lib/http/redirect.
//   - the Host header: the client controls it, so a link built from it
//     and emailed to families can point anywhere. Use orgPublicOrigin()
//     or apexPublicOrigin() from @/lib/tenancy/resolve.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const files = sourceFiles(SRC).map((p) => ({ rel: path.relative(process.cwd(), p), text: readFileSync(p, "utf8") }));

// Reading Host to classify or compare it, never to build a link.
const HOST_READERS = new Set([
  "src/middleware.ts", // tenant routing
  "src/lib/security/csrf.ts", // Origin must match Host
  "src/lib/security/same-origin.ts", // same
  "src/lib/auth/passkeys.ts", // which site's passkeys apply; the signed origin must match
  "src/lib/owner/guard.ts", // apex-only console
  "src/app/super-admin/billing/payments.csv/route.ts", // same, for the console's CSV export
  "src/lib/ops/request-owner.ts", // which unit an error happened in, for the owner console
  "src/app/o/[slug]/admin/site/page.tsx", // preview iframe on the admin's own host
]);

// Absolute redirects to a URL that was checked first.
const ABSOLUTE_REDIRECTS = new Set([
  "src/lib/auth/social-routes.ts", // the provider's sign-in page, from Better Auth
  "src/app/auth/mobile/begin/route.ts", // app deep link checked by allowedMobileRedirect
]);

describe("links and redirects", () => {
  it("never resolve against req.url", () => {
    const bad = files.filter((f) => /new URL\([^;]*,\s*(req|request)\.url\s*\)/.test(f.text)).map((f) => f.rel);
    expect(bad, "use redirectTo() from @/lib/http/redirect").toEqual([]);
  });

  it("read the Host header only to route or compare", () => {
    const bad = files
      .filter((f) => /\.get\(\s*["'](host|x-forwarded-host)["']\s*\)/.test(f.text) && !HOST_READERS.has(f.rel))
      .map((f) => f.rel);
    expect(bad, "build links with orgPublicOrigin() or apexPublicOrigin()").toEqual([]);
  });

  it("redirect absolutely only to checked destinations", () => {
    const bad = files
      .filter((f) => /\bNextResponse\.redirect\(/.test(f.text) && !ABSOLUTE_REDIRECTS.has(f.rel))
      .map((f) => f.rel);
    expect(bad, "use redirectTo() for paths on this site").toEqual([]);
  });
});
