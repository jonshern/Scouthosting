// Link crawler. Breadth-first crawl of every same-origin <a href>
// reachable from a set of start pages, asserting each page loads with a
// status < 400, renders no Next "Application error", and throws no
// uncaught page error.
//
// Crawls:
//   - apex marketing site, signed out
//   - troop100 tenant public site, signed out
//   - troop100 tenant, signed in as the seeded admin (public + /admin)
//
// External links (http/https on other hosts) are collected from every
// crawled page. With LINKCHECK_EXTERNAL=1 each distinct one is checked
// with HEAD (falling back to GET); a 404/410 fails the test, anything
// else that isn't 2xx/3xx (bot walls, rate limits, timeouts) is
// reported as a warning. Without the flag they're listed, not fetched.
// mailto:/tel: links are syntax-checked only.

import { expect, request, test, type Page, type TestInfo } from "@playwright/test";
import { APEX, ORG_SLUG, TENANT, signIn } from "./helpers/flows";

const MAX_PAGES = 400;
// Max pages crawled per id-templated route (e.g. /admin/events/:id).
const PER_TEMPLATE = 3;

// Never follow: signs out, mutates on GET, or is a tracking redirect.
const SKIP_PATTERNS: RegExp[] = [
  /\/logout\b/i,
  /\/sign-?out\b/i,
  /\/(delete|remove|destroy|revoke|archive|cancel|unsubscribe)\b/i,
  /^\/rsvp\//, // one-click email RSVP writes an RSVP on GET
  /^\/unsubscribe\//, // writes an opt-out on GET
  /^\/t\/[co]\//, // email click/open tracking
  /^\/api\/auth\/(google|apple)\//, // OAuth hand-off to a third party
  /^\/auth\/mobile\//, // mobile app hand-off
];

// Fetched for status only (not rendered): files and exports.
const DOWNLOAD_PATTERNS: RegExp[] = [
  /\.(csv|ics|ical|pdf|zip|xlsx?|png|jpe?g|gif|webp|svg|txt|json|xml)$/i,
  /\/(csv|export|download)(\/|$)/i,
  /^\/uploads\//,
];

/**
 * Links that are known to be broken in the app today. Each one is a
 * filed bug; the crawl reports them (annotation "known-broken") instead
 * of failing. Remove the entry when the bug is fixed — the crawl will
 * then cover the page normally.
 */
const KNOWN_BROKEN: Array<{ pattern: RegExp; host?: string; bug: string }> = [];

type Failure = { url: string; from: string; problem: string };
type CrawlResult = {
  visited: number;
  failures: Failure[];
  knownBroken: Failure[];
  external: Map<string, string>; // url -> first page that linked it
  mailto: Map<string, string>;
};

function pathKey(u: URL, host: string): string {
  // On a tenant host /o/<slug>/x and /x are the same page.
  let p = u.pathname.replace(/\/+$/, "") || "/";
  if (host === TENANT) p = p.replace(new RegExp(`^/o/${ORG_SLUG}(?=/|$)`), "") || "/";
  const keys = [...new Set([...u.searchParams.keys()].filter((k) => k !== "_rsc"))].sort();
  return keys.length ? `${p}?${keys.join("&")}` : p;
}

function normalizedPath(u: URL, host: string): string {
  return pathKey(new URL(u.pathname, u.origin), host);
}

async function checkDownload(page: Page, url: string): Promise<number> {
  return page.evaluate(async (target) => {
    try {
      const r = await fetch(target, { method: "GET", redirect: "follow", credentials: "include" });
      return r.status;
    } catch {
      return 0;
    }
  }, url);
}

async function crawl(page: Page, host: string, starts: string[]): Promise<CrawlResult> {
  const origin = new URL(host).origin;
  const seen = new Set<string>();
  const perTemplate = new Map<string, number>();
  const queue: Array<{ url: string; from: string }> = [];
  const result: CrawlResult = {
    visited: 0,
    failures: [],
    knownBroken: [],
    external: new Map(),
    mailto: new Map(),
  };

  const enqueue = (raw: string, from: string) => {
    let u: URL;
    try {
      u = new URL(raw, from);
    } catch {
      result.failures.push({ url: raw, from, problem: "unparseable href" });
      return;
    }
    if (u.protocol === "mailto:" || u.protocol === "tel:") {
      if (!result.mailto.has(u.href)) result.mailto.set(u.href, from);
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return; // javascript:, data:, sms:, …
    u.hash = "";
    if (u.origin !== origin) {
      const h = u.hostname;
      // Other local hosts (apex <-> tenant) aren't "external".
      if (h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1") return;
      if (!result.external.has(u.href)) result.external.set(u.href, from);
      return;
    }
    const norm = normalizedPath(u, host);
    if (SKIP_PATTERNS.some((re) => re.test(norm))) return;
    const key = pathKey(u, host);
    if (seen.has(key)) return;
    seen.add(key);
    // Per-record pages (/admin/events/<id>, …) all share one template;
    // visit a few of each rather than every row in the database.
    const template = key.replace(/\/c[a-z0-9]{20,30}(?=\/|\?|$)/g, "/:id");
    if (template !== key) {
      const n = (perTemplate.get(template) ?? 0) + 1;
      perTemplate.set(template, n);
      if (n > PER_TEMPLATE) return;
    }
    queue.push({ url: u.href, from });
  };

  for (const s of starts) enqueue(new URL(s, origin).href, `${origin}/`);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  while (queue.length > 0 && result.visited < MAX_PAGES) {
    const { url, from } = queue.shift()!;
    const u = new URL(url);
    const norm = normalizedPath(u, host);
    const known = KNOWN_BROKEN.find((k) => (!k.host || k.host === host) && k.pattern.test(norm));

    if (DOWNLOAD_PATTERNS.some((re) => re.test(norm))) {
      const status = await checkDownload(page, url);
      result.visited += 1;
      if (status === 0 || status >= 400) {
        (known ? result.knownBroken : result.failures).push({
          url,
          from,
          problem: known ? `${known.bug} (status ${status})` : `download status ${status}`,
        });
      }
      continue;
    }

    pageErrors.length = 0;
    let status = 0;
    let problem: string | null = null;
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      status = res?.status() ?? 0;
      // Let hydration finish so client-side errors surface.
      await page.waitForLoadState("networkidle", { timeout: 750 }).catch(() => {});
    } catch (e) {
      problem = `navigation failed: ${(e as Error).message.split("\n")[0]}`;
    }
    result.visited += 1;

    if (!problem && (status === 0 || status >= 400)) problem = `HTTP ${status}`;
    if (!problem) {
      const appError = await page
        .getByText(/Application error: a (client|server)-side exception has occurred/i)
        .count();
      if (appError) problem = "rendered Next.js Application error";
    }
    if (!problem && pageErrors.length) problem = `uncaught page error: ${pageErrors[0]}`;

    if (problem) {
      (known ? result.knownBroken : result.failures).push({
        url,
        from,
        problem: known ? `${known.bug} (${problem})` : problem,
      });
      if (status >= 400 || status === 0) continue; // don't harvest links from an error page
    } else if (known) {
      result.failures.push({
        url,
        from,
        problem: `listed in KNOWN_BROKEN but now loads fine — remove the entry (${known.bug})`,
      });
    }

    // Only harvest links from pages that stayed on our origin.
    if (new URL(page.url()).origin !== origin) continue;
    const hrefs = await page.$$eval("a[href]", (as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    const base = page.url();
    for (const h of hrefs) if (h && !h.startsWith("#")) enqueue(h, base);
  }

  if (queue.length > 0) {
    // Hitting the cap isn't a failure, but say so.
    test.info().annotations.push({
      type: "crawl-cap",
      description: `${host}: stopped at ${MAX_PAGES} pages with ${queue.length} still queued`,
    });
  }
  return result;
}

const MAILTO_RE = /^mailto:([^@\s?]+@[^@\s?]+\.[A-Za-z]{2,})(,[^@\s?]+@[^@\s?]+\.[A-Za-z]{2,})*(\?.*)?$/;
const TEL_RE = /^tel:\+?[0-9][0-9().\-\s]{2,}$/;

function checkMailtoTel(result: CrawlResult): Failure[] {
  const bad: Failure[] = [];
  for (const [href, from] of result.mailto) {
    const decoded = decodeURIComponent(href);
    const ok = href.startsWith("mailto:") ? MAILTO_RE.test(decoded) : TEL_RE.test(decoded);
    if (!ok) bad.push({ url: href, from, problem: "malformed mailto:/tel: link" });
  }
  return bad;
}

type ExternalResult = { url: string; from: string; status: number; note?: string };

async function checkExternal(links: Map<string, string>): Promise<ExternalResult[]> {
  // One representative URL per origin+path (event cards generate a
  // unique Google Calendar / Maps query string per event).
  const reps = new Map<string, { url: string; from: string }>();
  for (const [url, from] of links) {
    const u = new URL(url);
    const k = `${u.origin}${u.pathname}`;
    if (!reps.has(k)) reps.set(k, { url, from });
  }
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const ctx = await request.newContext({
    ...(proxy ? { proxy: { server: proxy } } : {}),
    extraHTTPHeaders: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 CompassLinkCheck",
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    },
  });
  const out: ExternalResult[] = [];
  try {
    for (const { url, from } of reps.values()) {
      let status = 0;
      let note: string | undefined;
      try {
        const head = await ctx.head(url, { timeout: 15_000, maxRedirects: 10 });
        status = head.status();
      } catch (e) {
        note = (e as Error).message.split("\n")[0];
      }
      if (status === 0 || status >= 400) {
        // Plenty of servers reject HEAD (405/403/404 on HEAD only).
        try {
          const get = await ctx.get(url, { timeout: 20_000, maxRedirects: 10 });
          status = get.status();
          note = undefined;
        } catch (e) {
          note = (e as Error).message.split("\n")[0];
        }
      }
      out.push({ url, from, status, note });
    }
  } finally {
    await ctx.dispose();
  }
  return out;
}

async function report(
  testInfo: TestInfo,
  label: string,
  result: CrawlResult,
): Promise<void> {
  const failures = [...result.failures, ...checkMailtoTel(result)];
  for (const k of result.knownBroken) {
    testInfo.annotations.push({ type: "known-broken", description: `${k.url} (from ${k.from}): ${k.problem}` });
  }

  let external: ExternalResult[] = [];
  const checkExternalLinks = process.env.LINKCHECK_EXTERNAL === "1";
  if (checkExternalLinks && result.external.size > 0) {
    external = await checkExternal(result.external);
    for (const e of external) {
      if (e.status === 404 || e.status === 410) {
        failures.push({ url: e.url, from: e.from, problem: `external link returns ${e.status}` });
      } else if (e.status === 0 || e.status >= 400) {
        testInfo.annotations.push({
          type: "external-warning",
          description: `${e.url} (from ${e.from}): ${e.status || e.note || "no response"}`,
        });
      }
    }
  } else if (result.external.size > 0) {
    testInfo.annotations.push({
      type: "external-unchecked",
      description: `${result.external.size} external link(s) found; set LINKCHECK_EXTERNAL=1 to check them`,
    });
  }

  const summary = {
    label,
    visited: result.visited,
    failures,
    knownBroken: result.knownBroken,
    external: checkExternalLinks
      ? external
      : [...result.external].map(([url, from]) => ({ url, from, status: null })),
    mailtoTel: [...result.mailto.keys()],
  };
  await testInfo.attach(`links-${label}.json`, {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  console.log(
    `[links:${label}] visited=${result.visited} failures=${failures.length} ` +
      `knownBroken=${result.knownBroken.length} external=${result.external.size}` +
      (checkExternalLinks ? ` (checked ${external.length})` : " (unchecked)"),
  );
  for (const e of external) console.log(`  EXT ${e.status || e.note || "no response"} ${e.url}`);
  for (const f of failures) console.log(`  FAIL ${f.url}  <- ${f.from}\n       ${f.problem}`);

  expect(result.visited, `${label}: crawl found nothing`).toBeGreaterThan(1);
  expect(
    failures,
    `${label}: broken links\n` + failures.map((f) => `  ${f.url} (from ${f.from}): ${f.problem}`).join("\n"),
  ).toEqual([]);
}

test.describe("link crawl", () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test("apex marketing site, signed out", async ({ page }, testInfo) => {
    const result = await crawl(page, APEX, [
      "/",
      "/plans",
      "/security",
      "/positioning",
      "/pitch",
      "/login",
      "/signup",
    ]);
    await report(testInfo, "apex", result);
  });

  test("troop100 public site, signed out", async ({ page }, testInfo) => {
    const result = await crawl(page, TENANT, ["/", "/calendar", "/calendar?view=month", "/photos", "/posts"]);
    await report(testInfo, "tenant-public", result);
  });

  test("troop100 tenant, signed in as admin", async ({ page }, testInfo) => {
    await signIn(page);
    const result = await crawl(page, TENANT, [
      "/",
      "/admin",
      "/calendar",
      "/calendar?view=month",
      "/chat",
      "/photos",
      "/posts",
      "/feedback",
    ]);
    // The crawl must not have signed us out.
    await page.goto(`${TENANT}/admin`);
    await expect(page.getByRole("heading", { name: /coming up/i })).toBeVisible();
    await report(testInfo, "tenant-admin", result);
  });
});
