// Cross-site guard for public (no sign-in) JSON POSTs that a browser
// page on our own origin calls. Browsers send Sec-Fetch-Site and/or
// Origin on a fetch POST; anything they mark as coming from another
// site is refused. Requests with neither header (native apps, curl)
// carry no ambient credentials, so they pass: the body's token is the
// credential.

export function isCrossSiteRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return !host || new URL(origin).host.toLowerCase() !== host.toLowerCase();
  } catch {
    return true;
  }
}
