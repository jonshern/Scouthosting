import { headers } from "next/headers";
import { apexPublicOrigin, classifyHost } from "./resolve";

/**
 * Main-site pages (/plans, /security, …) exist only on the apex. The
 * marketing header and footer also render on troop hosts (their /login
 * reuses the apex page), where a bare "/plans" would be rewritten into
 * the troop site and 404, so there they link to the apex instead.
 */
export function marketingHrefFor(host: string | null, path: string, origin = apexPublicOrigin()): string {
  const kind = classifyHost(host).kind;
  return kind === "apex" || kind === "unknown" ? path : `${origin}${path}`;
}

export async function marketingHref(): Promise<(path: string) => string> {
  const host = (await headers()).get("host");
  return (path) => marketingHrefFor(host, path);
}
