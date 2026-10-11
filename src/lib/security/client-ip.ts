// Client IP for rate limiting and audit, trusting only the header our
// hosting platform sets.
//
// The leftmost X-Forwarded-For entry is whatever the client typed, so
// keying a limiter on it lets anyone pick a fresh bucket per request.
// Instead we read exactly one source, chosen by deployment:
//
//   CLIENT_IP_HEADER=x-forwarded-for   Cloud Run / any proxy that appends
//                                      (default when K_SERVICE is set). The
//                                      address is taken CLIENT_IP_XFF_HOPS
//                                      entries from the right (default 1:
//                                      the hop our own proxy appended).
//   CLIENT_IP_HEADER=<other header>    e.g. cf-connecting-ip, x-real-ip,
//                                      when a trusted proxy overwrites it.
//
// TRUSTED_IP_HEADER / TRUSTED_PROXY_HOPS are accepted as aliases.
//
// Outside production with no platform detected (local dev, tests) the
// rightmost X-Forwarded-For hop is used. In production with nothing
// configured, nothing is trusted and the result is null, so callers fall
// back to a shared bucket rather than a spoofable one.

import { isIP } from "node:net";

type HeaderSource = { get(name: string): string | null };

export type ClientIpConfig = {
  header: string | null;
  xffHops: number;
};

export function clientIpConfig(env: Record<string, string | undefined> = process.env): ClientIpConfig {
  const rawHops = env.CLIENT_IP_XFF_HOPS ?? env.TRUSTED_PROXY_HOPS ?? "1";
  const hops = Math.max(1, Number.parseInt(rawHops, 10) || 1);
  const explicit = (env.CLIENT_IP_HEADER || env.TRUSTED_IP_HEADER)?.trim().toLowerCase();
  if (explicit) return { header: explicit, xffHops: hops };
  if (env.K_SERVICE) return { header: "x-forwarded-for", xffHops: hops };
  if (env.NODE_ENV !== "production") return { header: "x-forwarded-for", xffHops: hops };
  return { header: null, xffHops: hops };
}

function normalise(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let v = raw.trim();
  // "[2001:db8::1]:443" and "203.0.113.7:51234" forms.
  const bracketed = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) v = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  return isIP(v) ? v.toLowerCase() : null;
}

export function clientIp(
  headers: HeaderSource,
  config: ClientIpConfig = clientIpConfig(),
): string | null {
  if (!config.header) return null;
  const value = headers.get(config.header);
  if (!value) return null;
  if (config.header !== "x-forwarded-for") return normalise(value);
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  return normalise(parts[parts.length - config.xffHops]);
}

/** clientIp() for callers that want a bucket key: "anon" when unknown. */
export function clientIpFromHeaders(headers: HeaderSource): string {
  return clientIp(headers) ?? "anon";
}

/** Header list for Better Auth's own IP tracking. */
export function clientIpHeaders(config: ClientIpConfig = clientIpConfig()): string[] {
  return config.header ? [config.header] : [];
}
