// Redirects from route handlers that stay on the host the visitor used.
//
// Resolving a path against req.url looks right but isn't: `next start -H <host>
// -p <port>` builds req.url from the address the server listens on, so
// behind the Mac's blue-green switch (or any proxy) the redirect sends
// the browser to http://127.0.0.1:3001/... A relative Location header
// is valid HTTP and the browser resolves it against the address bar.

import { NextResponse } from "next/server";

/** Only same-site paths; anything else ("//evil", "https://...") goes home. */
export function sameSitePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return "/";
  return path;
}

export function redirectTo(path: string, status: 302 | 303 | 307 = 307): NextResponse {
  return new NextResponse(null, { status, headers: { location: sameSitePath(path) } });
}
