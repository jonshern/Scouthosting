// /o/[slug]/admin/newsletters — list drafts + sent newsletters.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function NewslettersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/newsletters`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const newsletters = await prisma.newsletter.findMany({
    where: { orgId: org.id },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      publishedAt: true,
    },
  });
  const schedule = await prisma.newsletterSchedule.findUnique({
    where: { orgId: org.id },
    select: {
      paused: true,
      weekday: true,
      localTime: true,
      timezone: true,
      minStories: true,
      lastDraftedAt: true,
    },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader
        kicker="Messages"
        title="Newsletters"
        actions={
          <Link href={`/o/${slug}/admin/newsletters/schedule`} className="btn-secondary">
            Schedule
          </Link>
        }
      />

      {schedule ? (
        <p className="mb-6 text-sm text-slate-soft">
          Auto-draft is{" "}
          <strong>{schedule.paused ? "paused" : "on"}</strong> for{" "}
          {weekdayLabel(schedule.weekday)} at {schedule.localTime ?? "07:00"} (
          {schedule.timezone ?? "UTC"}). Min stories: {schedule.minStories ?? 2}.
        </p>
      ) : (
        <p className="mb-6 text-sm text-slate-soft">No auto-draft schedule set.</p>
      )}

      {newsletters.length === 0 ? (
        <p className="text-slate-soft">No newsletters yet.</p>
      ) : (
        <ul className="space-y-2">
          {newsletters.map((n) => (
            <li key={n.id} className="card flex items-center justify-between">
              <div>
                <Link
                  href={`/o/${slug}/admin/newsletters/${n.id}`}
                  className="font-medium"
                >
                  {n.title}
                </Link>
                <div className="text-xs text-slate-muted">
                  {n.status} · created {n.createdAt.toLocaleDateString()}
                  {n.publishedAt ? ` · sent ${n.publishedAt.toLocaleDateString()}` : ""}
                </div>
              </div>
              <span
                className={`text-xs uppercase tracking-wide ${
                  n.status === "sent" ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {n.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function weekdayLabel(d: number): string {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1] ?? `${d}`;
}
