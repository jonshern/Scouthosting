import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/tenancy/resolve";
import { prisma } from "@/lib/db";
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

async function resolveCustomDomainSlug(domain: string): Promise<string | null> {
  const cached = customDomainCache.get(domain);
  const now = Date.now();
  if (cached && now - cached.at < CUSTOM_DOMAIN_TTL_MS) return cached.slug;
  const org = await prisma.org.findUnique({
    where: { customDomain: domain },
    select: { slug: true },
  });
  customDomainCache.set(domain, { slug: org?.slug ?? null, at: now });
  return org?.slug ?? null;
}

// Paths that should NOT be rewritten under a tenant subdomain.
// /o/ — already org-scoped (avoid double-rewrite).
// /login, /signup, /logout — apex marketing pages; reuse them for tenant sign-in.
// /api/events/ — public event sign-ups (addressed by a global slug) and
//   the event staff invite answer (POST /api/events/staff-rsvp).
// /staff-rsvp — the staff invite page; the link may be built on whichever
//   host the leader sent it from.
const TENANT_PASSTHROUGH_PREFIXES = ["/o/", "/login", "/logout", "/signup", "/api/events/", "/staff-rsvp"];
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
      res = NextResponse.next();
    }
  } else if (c.kind === "tenant" || c.kind === "custom") {
    const slug =
      c.kind === "tenant"
        ? c.slug
        : await resolveCustomDomainSlug(c.customDomain);
    // Unknown custom domain — fall through with no rewrite so Next
    // renders the not-found page ("That subdomain isn't a Compass site
    // yet"). We still set the CSRF cookie at the bottom.
    if (!slug) {
      res = NextResponse.next();
    } else {
      const alreadyRewritten = TENANT_PASSTHROUGH_PREFIXES.some((p) =>
        url.pathname.startsWith(p),
      );
      if (alreadyRewritten) {
        res = NextResponse.next();
      } else {
        const rewritten = req.nextUrl.clone();
        rewritten.pathname = `/o/${slug}${url.pathname === "/" ? "" : url.pathname}`;
        res = NextResponse.rewrite(rewritten);
      }
    }
  } else {
    res = NextResponse.next();
  }

  ensureCsrfCookie(req, res);
  return res;
}
