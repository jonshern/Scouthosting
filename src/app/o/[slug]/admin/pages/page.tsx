import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function AdminPagesIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      customPages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!org) notFound();
  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Site"
        title="Custom pages"
        actions={
          <Link href={`/o/${slug}/admin/pages/new`} className="btn-primary">New page</Link>
        }
      />
      {org.customPages.length === 0 && (
        <p className="text-slate-soft">No custom pages yet. Use these for FAQ, About, Volunteer, etc.</p>
      )}
      <ul className="space-y-3">
        {org.customPages.map((p) => (
          <li key={p.id} className="card flex items-start justify-between gap-4">
            <div>
              <Link href={`/o/${slug}/admin/pages/${p.id}`} className="font-medium">{p.title}</Link>
              <div className="mt-1 text-sm text-slate-soft">
                /p/{p.slug} · {p.visibility === "members" ? "members only" : "public"}
                {p.showInNav ? "" : " · hidden from nav"}
              </div>
            </div>
            <Link href={`/o/${slug}/p/${p.slug}`} className="text-sm">View public →</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
