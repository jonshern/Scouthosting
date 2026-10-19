import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/tenancy/resolve";
import { TENANT_HOST_HEADER, TENANT_PASSTHROUGH_PREFIXES } from "@/lib/tenancy/host-header";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { INVITE_COOKIE, readInviteCookie } from "@/lib/invite";

// Skip Next internals and known static extensions, but DO process paths
// like /calendar.ical that should be tenant-rewritten.
export const config = {
  // Node runtime: we need Prisma here to translate custom-domain hits
  // into the real org slug. Edge can't run our Prisma client.
  runtime: "nodejs",
  matcher: [
    "/((?!_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/internal/|.*\\.(?:js|css|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$).*)",
  ],
};

// Tiny in-process cache so we don't hit the DB on every custom-domain
// request. Custom domains change rarely; a 60s TTL is plenty.
const CUSTOM_DOMAIN_TTL_MS = 60_000;
const customDomainCache = new Map<string, { slug: string | null; at: number }>();

// "unavailable" when the database can't answer and nothing is cached:
// the caller shows a try-again page rather than a 500, and a stale
// cached answer is used over an error.
async function resolveCustomDomainSlug(domain: string): Promise<string | null | "unavailable"> {
  const cached = customDomainCache.get(domain);
  const now = Date.now();
  if (cached && now - cached.at < CUSTOM_DOMAIN_TTL_MS) return cached.slug;
  try {
    const org = await prisma.org.findUnique({
      where: { customDomain: domain },
      select: { slug: true },
    });
    customDomainCache.set(domain, { slug: org?.slug ?? null, at: now });
    return org?.slug ?? null;
  } catch (err) {
    logger.child("middleware").error("custom domain lookup failed", {
      domain,
      err: err instanceof Error ? err.message : String(err),
    });
    return cached ? cached.slug : "unavailable";
  }
}

const CSRF_COOKIE = "compass_csrf";

// Pre-launch apex gate. Visitors without a valid `compass_invite`
// cookie are bounced to /coming-soon. Set DISABLE_INVITE_GATE=1 in
// .env to bypass the gate (used in dev + e2e tests).
//
// Auth surfaces (/login, /logout, /signup, /auth/*) and the
// /super-admin console stay reachable even without an invite — they
// have their own auth gates and existing users (or operators) need
// to be able to sign in regardless of the marketing-site lock.
const APEX_INVITE_ALLOWLIST = new Set<string>([
  "/coming-soon",
  "/health",
  "/robots.txt",
  "/favicon.ico",
  "/login",
  "/logout",
  "/signup",
  "/start",       // self-serve sign-up; the unit form needs a signed-in adult
  "/contact",     // questions from people deciding whether to sign up
]);
const APEX_INVITE_PREFIXES = [
  "/api/",        // server actions / route handlers (the form needs this)
  "/auth/",       // SSO / magic-link callbacks
  "/uploads/",    // org-served files (apex-relative when using local storage)
  "/super-admin", // operator surface — independently auth-gated
  "/account",     // signed-in user account pages
  "/select-org",  // post-login org picker for multi-org users
  "/o/",          // tenant pages reachable via apex host (post-login lands here);
                  // the org/admin layouts have their own auth + role gates.
  "/sell/",       // public fundraising / sales landing pages
  "/permission-slip/", // public e-signature flow
  "/staff-rsvp",  // event staff answer their emailed invite here
  "/mcp",         // Claude connector: bearer-auth API + OAuth consent (own auth)
  "/.well-known/", // OAuth discovery for the connector
  "/_next/",
];

function inviteGateEnabled(): boolean {
  if (process.env.DISABLE_INVITE_GATE === "1") return false;
  return true;
}

function pathBypassesInviteGate(pathname: string): boolean {
  if (APEX_INVITE_ALLOWLIST.has(pathname)) return true;
  return APEX_INVITE_PREFIXES.some((p) => pathname.startsWith(p));
}

function ensureCsrfCookie(req: NextRequest, res: NextResponse): void {
  const existing = req.cookies.get(CSRF_COOKIE)?.value;
  if (existing && existing.length >= 32) return;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Buffer.from(bytes).toString("base64url");
  res.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  // Only middleware sets TENANT_HOST_HEADER; drop any copy a client sent.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(TENANT_HOST_HEADER);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const c = classifyHost(host);
  const url = req.nextUrl;

  let res: NextResponse;

  if (c.kind === "apex" || c.kind === "unknown") {
    const inviteOk =
      !inviteGateEnabled() ||
      pathBypassesInviteGate(url.pathname) ||
      !!(await readInviteCookie(req.cookies.get(INVITE_COOKIE)?.value));
    if (!inviteOk) {
      const dest = req.nextUrl.clone();
      dest.pathname = "/coming-soon";
      dest.search = "";
      res = NextResponse.rewrite(dest);
    } else {
      res = next();
    }
  } else if (c.kind === "tenant" || c.kind === "custom") {
    const slug =
      c.kind === "tenant"
        ? c.slug
        : await resolveCustomDomainSlug(c.customDomain);
    if (slug === "unavailable") {
      return new NextResponse("This site is having trouble right now. Try again in a minute.\n", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "30", "cache-control": "no-store" },
      });
    }
    // Unknown custom domain — fall through with no rewrite so Next
    // renders the not-found page ("That subdomain isn't a Compass site
    // yet"). We still set the CSRF cookie at the bottom.
    if (!slug) {
      res = next();
    } else {
      const alreadyRewritten = TENANT_PASSTHROUGH_PREFIXES.some((p) =>
        url.pathname.startsWith(p),
      );
      // Tells pages they're on this troop's own host, so troop links can
      // be bare and main-site links must name the apex
      // (lib/tenancy/base-path.ts, lib/tenancy/marketing-link.ts).
      requestHeaders.set(TENANT_HOST_HEADER, slug);
      if (alreadyRewritten) {
        res = next();
      } else {
        const rewritten = req.nextUrl.clone();
        rewritten.pathname = `/o/${slug}${url.pathname === "/" ? "" : url.pathname}`;
        res = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
      }
    }
  } else {
    res = next();
  }

  ensureCsrfCookie(req, res);
  return res;
}
