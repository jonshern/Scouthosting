// Where the freshly minted API token may be sent. The token is a full
// credential for the account, so it may only go back to one of our apps:
// a registered deep-link scheme below, one of our own websites listed in
// WEB_SIGNIN_ORIGINS (and only its /signed-in page), or Expo Go / a
// localhost dev server outside production. Never any other http(s)
// site: a link to /auth/mobile/begin?redirect=https://attacker.example
// would otherwise hand any signed-in visitor's token to that site in
// one click.
export function allowedMobileRedirect(
  raw: string,
  production: boolean,
  webOrigins: ReadonlySet<string> = webSigninOrigins(),
): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (APP_SCHEMES.has(url.protocol)) return url;
  if (isWebSigninRedirect(url, production, webOrigins)) return url;
  if (production) return null;
  if (url.protocol === "exp:") return url;
  if ((url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTS.has(url.hostname)) return url;
  return null;
}

/**
 * True for `<listed origin>/signed-in` exactly: no other path, no
 * credentials in the URL, and https only in production. The begin route
 * hands these the token after a `#` so it never reaches the site's
 * server logs or a Referer header.
 */
export function isWebSigninRedirect(
  url: URL,
  production: boolean,
  webOrigins: ReadonlySet<string> = webSigninOrigins(),
): boolean {
  if (url.protocol !== "https:" && (production || url.protocol !== "http:")) return false;
  if (url.username || url.password) return false;
  if (url.pathname !== WEB_SIGNIN_PATH) return false;
  return webOrigins.has(url.origin);
}

/**
 * WEB_SIGNIN_ORIGINS: comma-separated exact origins
 * ("https://waypoint.example.org,https://jons-mac.tail1234.ts.net").
 * Entries that aren't a bare origin are ignored.
 */
export function webSigninOrigins(raw = process.env.WEB_SIGNIN_ORIGINS): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const s = part.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.origin !== "null" && u.origin === s.replace(/\/+$/, "")) out.add(u.origin);
    } catch {
      // not a URL; ignore
    }
  }
  return out;
}

const WEB_SIGNIN_PATH = "/signed-in";

// Compass (troops), Waypoint (merit badges; its builds still use the
// bluecard scheme) and Lantern (scouts; today Emmett's Journey).
const APP_SCHEMES = new Set(["compass:", "bluecard:", "waypoint:", "emmettjourney:", "lantern:"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
