import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DeleteAnnouncementButton } from "@/components/admin/DeleteContentButtons";

export default async function AdminAnnouncements({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { announcements: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!org) notFound();
  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Messages"
        title="Announcements"
        description="Post a short note that shows on the public site."
      />
      <AnnouncementForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      <div className="space-y-4">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">
          Recent
        </h2>
        {org.announcements.length === 0 ? (
          <p className="text-sm text-slate-muted">Nothing posted yet.</p>
        ) : null}
        <ul className="space-y-3">
          {org.announcements.map((a) => (
            <li key={a.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-slate-ink">{a.title}</div>
                  <div className="mt-1 text-xs text-slate-muted">
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-soft">
                    {a.body}
                  </p>
                </div>
                <DeleteAnnouncementButton
                  orgSlug={slug}
                  id={a.id}
                  csrf={<CsrfTokenInput />}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
