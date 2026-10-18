// Where the freshly minted API token may be sent. The token is a full
// credential for the account, so it may only go back to one of our apps:
// a registered deep-link scheme below, one of our own websites listed in
// WEB_SIGNIN_ORIGINS (and only its /signed-in page), Expo Go loading
// the app from a dev server listed in EXPO_GO_SIGNIN_HOSTS, or Expo Go /
// a localhost dev server outside production. Never any other http(s)
// site: a link to /auth/mobile/begin?redirect=https://attacker.example
// would otherwise hand any signed-in visitor's token to that site in
// one click.
export function allowedMobileRedirect(
  raw: string,
  production: boolean,
  webOrigins: ReadonlySet<string> = webSigninOrigins(),
  expoGoHosts: ReadonlySet<string> = expoGoSigninHosts(),
): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (APP_SCHEMES.has(url.protocol)) return url;
  if (isWebSigninRedirect(url, production, webOrigins)) return url;
  if (url.protocol === "exp:" && expoGoHosts.has(url.host.toLowerCase())) return url;
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

/**
 * EXPO_GO_SIGNIN_HOSTS: comma-separated host:port pairs of dev servers
 * whose Expo Go copy of an app may get a token in production, such as
 * the Mac's Tailscale address running Lantern ("100.101.102.103:8081").
 * Expo Go hands an exp:// link to the app it loaded from that server, so
 * listing only our own servers keeps the token away from anyone else's.
 */
export function expoGoSigninHosts(raw = process.env.EXPO_GO_SIGNIN_HOSTS): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const s = part.trim().toLowerCase();
    if (/^[a-z0-9.-]+:\d{1,5}$/.test(s) || /^\[[0-9a-f:]+\]:\d{1,5}$/.test(s)) out.add(s);
  }
  return out;
}

const WEB_SIGNIN_PATH = "/signed-in";

// Compass (troops), Waypoint (merit badges; its builds still use the
// bluecard scheme) and Lantern (scouts; today Emmett's Journey).
const APP_SCHEMES = new Set(["compass:", "bluecard:", "waypoint:", "emmettjourney:", "lantern:"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const APP_NAMES: Record<string, string> = {
  "compass:": "Compass app",
  "bluecard:": "Waypoint app",
  "waypoint:": "Waypoint app",
  "emmettjourney:": "Lantern app",
  "lantern:": "Lantern app",
};

/**
 * The name a sign-in token gets, from where it was sent: which app or
 * website the person signed in to. Shown on /account/api-tokens and in
 * the owner console's list of who uses which product.
 */
export function signinTokenName(url: URL): string {
  const app = APP_NAMES[url.protocol];
  if (app) return app;
  if (url.protocol === "exp:") return "Expo Go (development)";
  const host = url.hostname.toLowerCase();
  const product = host.startsWith("waypoint") ? "Waypoint" : host.startsWith("lantern") ? "Lantern" : null;
  return product ? `${product} website` : `Website (${host})`.slice(0, 80);
}
