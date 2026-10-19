// Which hosts a unit may not claim as its custom domain: our own apex and
// its subdomains, the hosts this deployment serves on (Tailscale names,
// sign-in websites) and shared platform hosts where anyone can get a name
// (Cloud Run, Firebase, Tailscale). A claimed domain decides where the
// middleware routes that host, which passkeys work there and the base of
// emailed links, so one of these would hand a unit someone else's traffic.

import { env } from "@/lib/env";
import { webSigninOrigins } from "@/lib/auth/mobile-redirect";

const PLATFORM_SUFFIXES = [".run.app", ".web.app", ".firebaseapp.com", ".ts.net", ".localhost"];

export function reservedDomain(
  domain: string,
  opts: { apexHost?: string; extraHosts?: string; webOrigins?: ReadonlySet<string> } = {},
): boolean {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  const apex = (opts.apexHost ?? env.APEX_HOST).split(":")[0]!.toLowerCase();
  if (d === apex || d.endsWith(`.${apex}`)) return true;
  if (d === "localhost" || PLATFORM_SUFFIXES.some((s) => d.endsWith(s))) return true;
  const extra = (opts.extraHosts ?? process.env.PASSKEY_EXTRA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().split(":")[0])
    .filter(Boolean);
  if (extra.includes(d)) return true;
  for (const origin of opts.webOrigins ?? webSigninOrigins()) {
    if (new URL(origin).hostname.toLowerCase() === d) return true;
  }
  return false;
}
