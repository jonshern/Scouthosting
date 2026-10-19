// Usage tracking: the pure parts (no database), so the rules are unit
// tested. What a page or screen view and a key action look like, how a
// path is cleaned before it's stored, and what we keep from a user
// agent and a referrer. See collect.ts for the write path and
// report.ts for the owner console's reads.
//
// Privacy rules every caller relies on:
// - no cookies, no local storage, no IP address stored (collect.ts
//   keeps only a hash with a salt that's deleted the next day);
// - paths lose their query string and anything that looks like an id
//   or a token, so a reset link or a scout's id never lands here;
// - the referrer is a host name only;
// - a scout's events carry no visitor hash.

export const USAGE_PRODUCTS = ["landing", "compass", "waypoint", "lantern"] as const;
export type UsageProduct = (typeof USAGE_PRODUCTS)[number];

export const USAGE_PLATFORMS = ["web", "ios", "android"] as const;
export type UsagePlatform = (typeof USAGE_PLATFORMS)[number];

export type UsageRole = "visitor" | "adult" | "scout";

/** A page or screen view. Every other name is a key action. */
export const VIEW = "view";

/**
 * Key actions, with the words the owner console shows. Clients may send
 * other snake_case names; they're kept and shown as written.
 */
export const ACTIONS: Record<string, string> = {
  signup_started: "Opened sign-up",
  account_created: "Created an account",
  unit_created: "Started a unit trial",
  checkout_started: "Went to checkout",
  signed_in: "Signed in",
  badge_day_signup: "Signed up for a badge day",
  step_checked: "Checked off a requirement",
  scout_paired: "Paired a scout's device",
  trail_added: "Added a scout trail",
  feedback_sent: "Sent feedback",
  cta_clicked: "Clicked a button on the landing page",
};

export const NAME_RE = /^[a-z][a-z0-9_]{0,47}$/;

const MAX_PATH = 200;

// A path segment that is an id or a secret rather than a page name:
// cuids, uuids, long numbers, hex or base64url tokens, emails.
function isIdLike(seg: string): boolean {
  if (!seg) return false;
  if (/^\d{3,}$/.test(seg)) return true;
  if (/^c[a-z0-9]{20,}$/.test(seg)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true;
  if (seg.includes("@")) return true;
  // Long mixed letters and digits (tokens, slugs with ids baked in).
  if (seg.length >= 16 && /\d/.test(seg) && /[a-z]/i.test(seg) && !/^[a-z]+(-[a-z]+)*-?\d{1,4}$/i.test(seg)) return true;
  return false;
}

/**
 * The path as stored: no origin, query or fragment, ids as ":id", and a
 * unit's own /o/<slug> prefix dropped (the unit is kept in orgId), so
 * "/o/troop100/admin/roster/ckx…" becomes "/admin/roster/:id".
 * Returns { path, slug } where slug is the /o/<slug> it removed.
 */
export function cleanPath(raw: string | null | undefined): { path: string | null; slug: string | null } {
  if (!raw) return { path: null, slug: null };
  let p = String(raw).trim();
  if (!p) return { path: null, slug: null };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return { path: null, slug: null };
    }
  }
  p = p.split(/[?#]/)[0];
  // Screen names from the phone apps ("trail", "step/[key]") get a slash.
  if (!p.startsWith("/")) p = `/${p}`;
  let segs = p.split("/").filter(Boolean);
  let slug: string | null = null;
  if (segs[0] === "o" && segs[1]) {
    slug = segs[1].toLowerCase();
    segs = segs.slice(2);
  }
  segs = segs.map((s) => {
    let seg = s;
    try {
      seg = decodeURIComponent(s);
    } catch {
      // keep as sent
    }
    return isIdLike(seg) ? ":id" : seg.slice(0, 60);
  });
  const out = `/${segs.join("/")}`.slice(0, MAX_PATH);
  return { path: out, slug };
}

/** Host of a referrer URL, or null for none, a bad URL, or our own site. */
export function referrerHost(raw: string | null | undefined, ownHost?: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host) return null;
    const own = ownHost?.toLowerCase().split(":")[0].replace(/^www\./, "");
    if (own && host === own) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

/** A campaign tag (utm_source / ref): short, lowercase, letters and a few marks. */
export function cleanSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  return s || null;
}

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python-|httpclient|node-fetch|axios|go-http|java\/|monitor|uptime|playwright|puppeteer/i;

/** Crawlers, link previews, uptime checks and test browsers aren't visitors. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_RE.test(ua);
}

export type DeviceInfo = { device: "phone" | "tablet" | "desktop" | null; browser: string | null };

/** Coarse device class and browser family from a user agent. Nothing finer is kept. */
export function deviceInfo(ua: string | null | undefined, platform: UsagePlatform): DeviceInfo {
  const s = ua ?? "";
  let device: DeviceInfo["device"] = null;
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(s)) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android/i.test(s)) device = "phone";
  else if (platform === "ios" || platform === "android") device = "phone";
  else if (s) device = "desktop";

  let browser: string | null = null;
  if (platform !== "web") browser = null;
  else if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";
  else if (s) browser = "Other";
  return { device, browser };
}

/** Props on an event: at most 10 keys, short strings, numbers and booleans only. */
export function cleanProps(raw: unknown): Record<string, string | number | boolean> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 10)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 100);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** "step_checked" → "Checked off a requirement"; unknown names as written. */
export function actionLabel(name: string): string {
  return ACTIONS[name] ?? name.replace(/_/g, " ");
}
