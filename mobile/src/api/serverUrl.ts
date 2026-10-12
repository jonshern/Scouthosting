// Server addresses, with no React Native imports so the rules are
// unit-tested. Same rules as Waypoint's and Lantern's serverUrl.ts.
//
// A "server address" is the origin Compass answers on, like
// https://jons-mac.tail1234.ts.net. The API lives under
// <address>/api/v1 and sign-in under <address>/auth/mobile/begin.

/**
 * Turns what someone typed or a link carried into a server address, or
 * null if it isn't one. A bare host gets https:// (Tailscale serve and
 * every hosted environment use https), and a trailing /api or /api/v1 is
 * dropped so pasting the API base works too.
 */
export function normalizeServerUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api(\/v1)?$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

/** Phones can't use plain http to anything but a local address; iOS blocks it (App Transport Security). */
export function needsHttps(address: string): boolean {
  if (!address.startsWith("http://")) return false;
  const host = new URL(address).hostname;
  return !(host === "localhost" || host === "127.0.0.1" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host));
}

/** Pulls the address out of a compass://connect?url=… link, or null. */
export function connectLinkAddress(link: string): string | null {
  const q = link.indexOf("?");
  if (q < 0) return null;
  const params = new URLSearchParams(link.slice(q + 1).split("#")[0]);
  return normalizeServerUrl(params.get("url"));
}
