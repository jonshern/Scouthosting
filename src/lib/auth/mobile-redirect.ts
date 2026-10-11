// Where the freshly minted API token may be sent. The token is a full
// credential for the account, so it may only go back to one of our apps:
// a registered deep-link scheme below, or Expo Go / a localhost dev
// server outside production. Never an http(s) site: a link to
// /auth/mobile/begin?redirect=https://attacker.example would otherwise
// hand any signed-in visitor's token to that site in one click.
export function allowedMobileRedirect(raw: string, production: boolean): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (APP_SCHEMES.has(url.protocol)) return url;
  if (production) return null;
  if (url.protocol === "exp:") return url;
  if ((url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTS.has(url.hostname)) return url;
  return null;
}

// Compass (troops), Waypoint (merit badges; its builds still use the
// bluecard scheme) and Summit (scouts; today Emmett's Journey).
const APP_SCHEMES = new Set(["compass:", "bluecard:", "waypoint:", "emmettjourney:", "summit:"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
