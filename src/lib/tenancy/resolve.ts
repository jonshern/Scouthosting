import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export type ResolvedHost =
  | { kind: "apex" }
  | { kind: "tenant"; slug: string }
  | { kind: "custom"; customDomain: string }
  | { kind: "unknown" };

const APEX_HOST_PARTS = env.APEX_HOST.split(":")[0].toLowerCase();

export function classifyHost(rawHost: string | null | undefined): ResolvedHost {
  if (!rawHost) return { kind: "unknown" };
  const host = rawHost.split(":")[0].toLowerCase();
  if (host === APEX_HOST_PARTS || host === `www.${APEX_HOST_PARTS}`) return { kind: "apex" };
  if (host.endsWith(`.${APEX_HOST_PARTS}`)) {
    const slug = host.slice(0, -1 - APEX_HOST_PARTS.length);
    if (!slug || slug === "www") return { kind: "apex" };
    return { kind: "tenant", slug };
  }
  return { kind: "custom", customDomain: host };
}

export async function resolveOrgFromHost(rawHost: string | null | undefined) {
  const c = classifyHost(rawHost);
  if (c.kind === "apex") return null;
  if (c.kind === "tenant") {
    return prisma.org.findUnique({ where: { slug: c.slug } });
  }
  if (c.kind === "custom") {
    return prisma.org.findUnique({ where: { customDomain: c.customDomain } });
  }
  return null;
}

/**
 * The org's canonical public origin, for links in emails: its custom
 * domain when set, else `<slug>.<APEX_HOST>`. Built from the org row
 * and env only, never from a request's Host header (which the client
 * controls).
 */
export function orgPublicOrigin(
  org: { slug: string; customDomain?: string | null },
  opts: { apexHost?: string; production?: boolean; port?: string | undefined } = {},
): string {
  const production = opts.production ?? process.env.NODE_ENV === "production";
  const scheme = production ? "https" : "http";
  if (org.customDomain) return `${scheme}://${org.customDomain}`;
  const apex = (opts.apexHost ?? env.APEX_HOST).replace(/\/+$/, "");
  // APEX_HOST may carry a port in dev ("localhost:3000"); otherwise
  // dev servers listen on PORT (default 3000).
  const hasPort = /:\d+$/.test(apex);
  const port = production || hasPort ? "" : `:${opts.port ?? process.env.PORT ?? "3000"}`;
  return `${scheme}://${org.slug}.${apex}${port}`;
}
