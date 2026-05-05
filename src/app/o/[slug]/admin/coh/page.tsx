// /o/[slug]/admin/coh — Court-of-Honor awards list, grouped by
// event so the admin can build the program flow at a glance.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";

export default async function CohPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/coh`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const awards = await prisma.cohAward.findMany({
    where: { orgId: org.id },
    orderBy: [{ event: { startsAt: "desc" } }, { sortOrder: "asc" }],
    take: 500,
    include: {
      event: { select: { id: true, title: true, startsAt: true } },
    },
  });

  const grouped = new Map<string, { event: typeof awards[0]["event"]; rows: typeof awards }>();
  for (const a of awards) {
    const k = a.event?.id ?? "(none)";
    if (!grouped.has(k)) grouped.set(k, { event: a.event, rows: [] });
    grouped.get(k)!.rows.push(a);
  }

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Courts of Honor</h1>
      {grouped.size === 0 ? (
        <p className="text-ink-muted">No awards recorded.</p>
      ) : (
        <div className="space-y-6">
          {[...grouped.values()].map((g) => (
            <section key={g.event?.id ?? "none"}>
              <h2 className="font-display text-xl">
                {g.event?.title ?? "(no event)"}
              </h2>
              <p className="text-xs text-ink-muted mb-2">
                {g.event?.startsAt.toLocaleDateString()}
              </p>
              <ul className="text-sm space-y-1">
                {g.rows.map((a) => (
                  <li key={a.id}>
                    <strong>{a.recipient}</strong> — {a.award}
                    {a.category ? ` (${a.category})` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
