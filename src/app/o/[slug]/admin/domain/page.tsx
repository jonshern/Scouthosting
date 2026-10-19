// /o/[slug]/admin/domain — set / clear Org.customDomain. The
// middleware already routes by customDomain when set; this is just
// the leader-facing settings + DNS-pointing instructions.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { setCustomDomain, clearCustomDomain } from "@/server-actions/domain";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Custom domain" };

export default async function CustomDomainPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/domain`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const apex = process.env.APEX_DOMAIN || "compass.app";
  const subdomainHost = `${slug}.${apex}`;

  return (
    <section>
      <AdminPageHeader
        kicker="Settings"
        title="Custom domain"
        description={
          <>
            Point your own domain at this site instead of (or in addition to){" "}
            <span className="font-mono">{subdomainHost}</span>.
          </>
        }
      />

      {org.customDomain ? (
        <section className="card mb-6">
          <h2 className="font-medium">
            Current: <span className="font-mono">{org.customDomain}</span>
          </h2>
          <p className="text-xs text-slate-muted mt-1">
            DNS check: visit{" "}
            <a
              href={`https://${org.customDomain}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              https://{org.customDomain}
            </a>{" "}
            and confirm it loads this site.
          </p>
          <form action={clearCustomDomain} className="mt-3">
            <CsrfTokenInput />
            <input type="hidden" name="orgSlug" value={slug} />
            <button type="submit" className="btn-secondary text-sm">
              Disconnect domain
            </button>
          </form>
        </section>
      ) : (
        <p className="text-sm mb-6">No custom domain attached.</p>
      )}

      <section className="card">
        <h2 className="font-medium mb-3">Connect a domain</h2>
        <ol className="list-decimal list-inside text-sm space-y-2 mb-4">
          <li>
            Buy or use an existing domain (e.g. <code>www.troop100.org</code>).
          </li>
          <li>
            Add a CNAME record at your DNS host pointing the domain at{" "}
            <code className="font-mono">{subdomainHost}</code>.
          </li>
          <li>
            Save it here. We'll request a TLS cert and the site will be
            reachable at the new domain within ~5 minutes.
          </li>
        </ol>
        <form action={setCustomDomain} className="space-y-3">
          <CsrfTokenInput />
          <input type="hidden" name="orgSlug" value={slug} />
          <label className="block">
            <span className="block text-sm">Domain (no scheme)</span>
            <input
              name="domain"
              type="text"
              placeholder="www.troop100.org"
              defaultValue={org.customDomain ?? ""}
              required
              className="input mt-1"
            />
          </label>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
      </section>
    </section>
  );
}
