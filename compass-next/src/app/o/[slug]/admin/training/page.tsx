// /o/[slug]/admin/training — leader training matrix. Adults' YPT
// + outdoor leader training rows from the Training table, with
// expiry highlighting.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";

export default async function TrainingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/training`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const rows = await prisma.training.findMany({
    where: { orgId: org.id },
    orderBy: [{ completedAt: "desc" }],
    take: 500,
    include: { member: { select: { firstName: true, lastName: true } } },
  });

  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Training</h1>
      {rows.length === 0 ? (
        <p className="text-ink-muted">No training rows yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-ink-muted/15">
            <tr>
              <th className="py-2">Member</th>
              <th>Course</th>
              <th>Completed</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const exp = t.expiresAt;
              const expired = exp && exp.getTime() < now;
              const expiringSoon = exp && exp.getTime() - now < ninetyDays && !expired;
              return (
                <tr key={t.id} className="border-b border-ink-muted/10">
                  <td className="py-2">
                    {t.member.firstName} {t.member.lastName}
                  </td>
                  <td>{t.courseName}</td>
                  <td className="text-xs text-ink-muted">
                    {t.completedAt.toLocaleDateString()}
                  </td>
                  <td
                    className={`text-xs ${
                      expired
                        ? "text-red-600"
                        : expiringSoon
                        ? "text-amber-700"
                        : "text-ink-muted"
                    }`}
                  >
                    {exp ? exp.toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
