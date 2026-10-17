// Prefix for a unit's own links. On the unit's host (troop100.compass.app
// or its custom domain) middleware rewrites "/calendar" to
// "/o/troop100/calendar" and marks the request, so links are bare. On
// any other host (the main site, a raw IP, a tunnel) the same pages are
// served at /o/troop100/..., where a bare "/calendar" is the main site's
// and 404s, so links need the prefix.

import { headers } from "next/headers";
import { TENANT_HOST_HEADER } from "./host-header";

export function basePathFor(tenantHeader: string | null | undefined, slug: string): string {
  return tenantHeader === slug ? "" : `/o/${slug}`;
}

export async function orgBasePath(slug: string): Promise<string> {
  return basePathFor((await headers()).get(TENANT_HOST_HEADER), slug);
}
