import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/tenancy/resolve";

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

export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  const c = classifyHost(host);
  const url = req.nextUrl;

  let res: NextResponse;

  if (c.kind === "apex" || c.kind === "unknown") {
    res = NextResponse.next();
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
