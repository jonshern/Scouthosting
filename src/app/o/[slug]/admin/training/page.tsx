// /o/[slug]/admin/training — leader training matrix. Adults' YPT
// + outdoor leader training rows from the Training table, with
// expiry highlighting.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { unwrapDekWithMaster, decryptField } from "@/lib/encryption";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function TrainingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
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

  const rawRows = await prisma.training.findMany({
    where: { orgId: org.id },
    orderBy: [{ completedAt: "desc" }],
    take: 500,
    include: { member: { select: { encFirstName: true, encLastName: true } } },
  });
  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const rows = rawRows.map((t) => ({
    ...t,
    member: {
      firstName: dek
        ? decryptField(t.member.encFirstName, dek, org.id, "member.firstName") ?? ""
        : "",
      lastName: dek
        ? decryptField(t.member.encLastName, dek, org.id, "member.lastName") ?? ""
        : "",
    },
  }));

  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Roster" title="Training" />
      {rows.length === 0 ? (
        <p className="text-slate-soft">No training rows yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted border-b border-line">
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
                <tr key={t.id} className="border-b border-line">
                  <td className="py-2">
                    {t.member.firstName} {t.member.lastName}
                  </td>
                  <td>{t.courseName}</td>
                  <td className="text-xs text-slate-muted">
                    {t.completedAt.toLocaleDateString()}
                  </td>
                  <td
                    className={`text-xs ${
                      expired
                        ? "text-danger"
                        : expiringSoon
                        ? "text-attention-text"
                        : "text-slate-muted"
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
