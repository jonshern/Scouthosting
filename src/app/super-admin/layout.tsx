// /super-admin — the owner console: the apex-only surface where the
// platform owner manages every unit and account across Compass,
// Waypoint and Lantern. Every route under this segment requires a User
// with isSuperAdmin=true, which only `npm run owner:grant` sets.

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { classifyHost } from "@/lib/tenancy/resolve";
import { accountStanding, requirementRedirect, withNext } from "@/lib/auth/requirements";

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = h.get("host");
  const cls = classifyHost(host);
  if (cls.kind !== "apex") {
    redirect("/");
  }

  const { user } = await getSession();
  if (!user || !user.isSuperAdmin) {
    redirect("/login?next=/super-admin");
  }
  const gate = requirementRedirect(await accountStanding(user.id), { organizerSurface: true });
  if (gate) redirect(withNext(gate, "/super-admin"));

  return (
    <div className="mx-auto max-w-content px-6 py-10">
      <header className="mb-8 border-b border-line pb-4">
        <div className="font-display text-xs italic text-sky">§ Compass · Waypoint · Lantern</div>
        <h1 className="font-display text-3xl font-semibold">Owner console</h1>
        <nav aria-label="Owner console" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/super-admin">Overview</Link>
          <Link href="/super-admin/orgs">Units</Link>
          <Link href="/super-admin/people">People</Link>
          <Link href="/super-admin/billing">Billing</Link>
          <Link href="/super-admin/inbox">Inbox</Link>
          <Link href="/super-admin/signups">Sign-ups</Link>
          <Link href="/super-admin/errors">Errors</Link>
          <Link href="/super-admin/audit">Audit log</Link>
          <Link href="/super-admin/analytics">Analytics</Link>
          <Link href="/super-admin/architecture">Architecture</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
