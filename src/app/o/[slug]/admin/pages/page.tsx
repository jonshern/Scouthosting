import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

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
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Pages</h1>
        <Link href={`/o/${slug}/admin/pages/new`} className="btn-primary">New page</Link>
      </div>
      {org.customPages.length === 0 && (
        <p className="text-ink-muted">No custom pages yet. Use these for FAQ, About, Volunteer, etc.</p>
      )}
      <ul className="space-y-3">
        {org.customPages.map((p) => (
          <li key={p.id} className="card flex items-start justify-between gap-4">
            <div>
              <Link href={`/o/${slug}/admin/pages/${p.id}`} className="font-medium">{p.title}</Link>
              <div className="mt-1 text-sm text-ink-muted">
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
