import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";

export default async function AdminAnnouncements({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { announcements: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!org) notFound();
  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Announcements</h1>
        <p className="mt-2 text-ink-muted">Post a short note that shows on the public site.</p>
      </div>
      <AnnouncementForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Recent</h2>
        {org.announcements.length === 0 && <p className="text-ink-muted">Nothing posted yet.</p>}
        <ul className="space-y-3">
          {org.announcements.map((a) => (
            <li key={a.id} className="card">
              <div className="font-medium">{a.title}</div>
              <div className="text-xs text-ink-muted">
                {new Date(a.createdAt).toLocaleString()}
              </div>
              <p className="mt-2 whitespace-pre-wrap">{a.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
