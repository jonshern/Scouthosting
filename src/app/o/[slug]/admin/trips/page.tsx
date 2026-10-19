// /o/[slug]/admin/trips — trip planner index. Lists every Event
// that has a TripPlan attached (the planner is opt-in per event).

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Trip planner" };

export default async function TripsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/trips`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const trips = await prisma.tripPlan.findMany({
    where: { orgId: org.id },
    orderBy: { event: { startsAt: "desc" } },
    take: 100,
    include: {
      event: {
        select: { id: true, title: true, startsAt: true, location: true },
      },
      _count: { select: { meals: true, gear: true } },
    },
  });

  return (
    <section>
      <AdminPageHeader kicker="Calendar" title="Trip planner" />
      {trips.length === 0 ? (
        <p className="text-slate-soft">
          No trips yet. Open an event and click "Add trip plan" to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {trips.map((t) => (
            <li key={t.id} className="card">
              <Link
                href={`/o/${slug}/admin/trips/${t.id}`}
                className="font-medium"
              >
                {t.event.title}
              </Link>
              <div className="text-xs text-slate-muted">
                {t.event.startsAt.toLocaleDateString()}
                {t.event.location ? ` · ${t.event.location}` : ""}
                {" · "}
                {t._count.meals} meals · {t._count.gear} gear items
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
