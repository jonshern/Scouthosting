import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/tenancy/resolve";
import { INVITE_COOKIE, readInviteCookie } from "@/lib/invite";

// Skip Next internals and known static extensions, but DO process paths
// like /calendar.ical that should be tenant-rewritten.
export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/internal/|.*\\.(?:js|css|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$).*)",
  ],
};

// Paths that should NOT be rewritten under a tenant subdomain.
// /o/ — already org-scoped (avoid double-rewrite).
// /login, /signup, /logout — apex marketing pages; reuse them for tenant sign-in.
const TENANT_PASSTHROUGH_PREFIXES = ["/o/", "/login", "/logout", "/signup"];
const CSRF_COOKIE = "compass_csrf";

// Pre-launch apex gate. Visitors without a valid `compass_invite`
// cookie are bounced to /coming-soon. Set DISABLE_INVITE_GATE=1 in
// .env to bypass the gate (used in dev + e2e tests).
const APEX_INVITE_ALLOWLIST = new Set<string>([
  "/coming-soon",
  "/health",
  "/robots.txt",
  "/favicon.ico",
]);
const APEX_INVITE_PREFIXES = [
  "/api/",        // server actions / route handlers (the form needs this)
  "/uploads/",    // org-served files (apex-relative when using local storage)
  "/super-admin", // operator surface — independently auth-gated
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
    const slug = c.kind === "tenant" ? c.slug : `__custom__`;
    const alreadyRewritten = TENANT_PASSTHROUGH_PREFIXES.some((p) => url.pathname.startsWith(p));
    if (alreadyRewritten) {
      res = NextResponse.next();
    } else {
      const rewritten = req.nextUrl.clone();
      rewritten.pathname = `/o/${slug}${url.pathname === "/" ? "" : url.pathname}`;
      if (c.kind === "custom") rewritten.searchParams.set("__customDomain", c.customDomain);
      res = NextResponse.rewrite(rewritten);
    }
  } else {
    res = NextResponse.next();
  }

  ensureCsrfCookie(req, res);
  return res;
}
