// /o/[slug]/admin/members/[id]/positions — position-of-responsibility
// history for a single member.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";

export default async function MemberPositionsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/members/${id}/positions`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const member = await prisma.member.findFirst({
    where: { id, orgId: org.id },
    select: { firstName: true, lastName: true, position: true },
  });
  if (!member) return <p className="p-12">Member not found.</p>;

  const terms = await prisma.positionTerm.findMany({
    where: { orgId: org.id, memberId: id },
    orderBy: { startedAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-1">
        {member.firstName} {member.lastName}
      </h1>
      <p className="text-ink-muted mb-6 text-sm">
        Current position: {member.position ?? "—"}
      </p>
      {terms.length === 0 ? (
        <p className="text-ink-muted">No position history.</p>
      ) : (
        <ul className="space-y-2">
          {terms.map((t) => (
            <li key={t.id} className="card text-sm">
              <strong>{t.position}</strong>
              <div className="text-xs text-ink-muted">
                {t.startedAt.toLocaleDateString()} —{" "}
                {t.endedAt ? t.endedAt.toLocaleDateString() : "present"}
              </div>
              {t.notes && <p className="text-xs mt-1">{t.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
