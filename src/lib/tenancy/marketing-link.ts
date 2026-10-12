import { headers } from "next/headers";
import { apexPublicOrigin } from "./resolve";
import { TENANT_HOST_HEADER } from "./host-header";

/**
 * Main-site pages (/plans, /security, …) exist only on the apex. The
 * marketing header and footer also render on troop hosts (their /login
 * reuses the apex page), where a bare "/plans" would be rewritten into
 * the troop site and 404, so there they link to the apex instead.
 * `tenantSlug` is the middleware's TENANT_HOST_HEADER.
 */
export function marketingHrefFor(tenantSlug: string | null, path: string, origin = apexPublicOrigin()): string {
  return tenantSlug ? `${origin}${path}` : path;
}

export async function marketingHref(): Promise<(path: string) => string> {
  const tenantSlug = (await headers()).get(TENANT_HOST_HEADER);
  return (path) => marketingHrefFor(tenantSlug, path);
}
