// /o/[slug]/admin/members/[id]/positions — position-of-responsibility
// history for a single member.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function MemberPositionsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
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

  const memberRow = await prisma.member.findFirst({
    where: { id, orgId: org.id },
    select: {
      encFirstName: true,
      encLastName: true,
      encPhone: true,
      encStreet: true,
      encCity: true,
      encState: true,
      encZip: true,
      position: true,
    },
  });
  if (!memberRow) return <p className="p-12">Member not found.</p>;
  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const pii = dek
    ? decryptMemberPii(memberRow, dek, org.id)
    : { firstName: "", lastName: "", phone: null, street: null, city: null, state: null, zip: null };
  const member = { ...memberRow, ...pii };

  const terms = await prisma.positionTerm.findMany({
    where: { orgId: org.id, memberId: id },
    orderBy: { startedAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader
        kicker="Roster"
        title={`${member.firstName} ${member.lastName}`}
        description={`Current position: ${member.position ?? "—"}`}
      />
      {terms.length === 0 ? (
        <p className="text-slate-soft">No position history.</p>
      ) : (
        <ul className="space-y-2">
          {terms.map((t) => (
            <li key={t.id} className="card text-sm">
              <strong>{t.position}</strong>
              <div className="text-xs text-slate-muted">
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
