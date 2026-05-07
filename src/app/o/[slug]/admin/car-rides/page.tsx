// /o/[slug]/admin/car-rides — driver + rider coordination per event.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function CarRidesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/car-rides`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const rides = await prisma.carRide.findMany({
    where: { orgId: org.id },
    orderBy: [{ departureTime: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      event: { select: { id: true, title: true, startsAt: true } },
      _count: { select: { riders: true } },
    },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Calendar" title="Car rides" />
      {rides.length === 0 ? (
        <p className="text-slate-soft">
          No rides yet. Drivers register from the public event page.
        </p>
      ) : (
        <ul className="space-y-2">
          {rides.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-baseline justify-between">
                <div>
                  <Link
                    href={`/o/${slug}/admin/events/${r.eventId}`}
                    className="font-medium"
                  >
                    {r.event.title}
                  </Link>
                  <div className="text-xs text-slate-muted">
                    {r.event.startsAt.toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs text-slate-muted">
                  {r._count.riders}/{r.seats} riders
                </span>
              </div>
              <div className="mt-2 text-sm">
                <strong>{r.driverName}</strong>
                {r.vehicleNote ? ` · ${r.vehicleNote}` : ""}
                {r.departureTime
                  ? ` · departs ${r.departureTime.toLocaleString()}`
                  : ""}
                {r.departureLocation ? ` from ${r.departureLocation}` : ""}
              </div>
              {r.notes && <p className="text-xs mt-1 text-slate-muted">{r.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
