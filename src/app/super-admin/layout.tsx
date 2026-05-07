// /super-admin — apex-only operator surface. Every route under this
// segment requires a User with isSuperAdmin=true.

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/lucia";
import { classifyHost } from "@/lib/tenancy/resolve";

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

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold">Super-admin</h1>
        <nav className="mt-3 flex gap-4 text-sm">
          <Link href="/super-admin">Orgs</Link>
          <Link href="/super-admin/errors">Errors</Link>
          <Link href="/super-admin/analytics">Analytics</Link>
          <Link href="/super-admin/architecture">Architecture</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
