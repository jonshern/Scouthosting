import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import {
  PatrolForm,
  DeletePatrolButton,
} from "@/components/admin/PatrolForms";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Patrol" };

export default async function PatrolDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const patrol = await prisma.patrol.findUnique({
    where: { id, orgId: org.id },
  });
  if (!patrol) notFound();

  const members = await prisma.member.findMany({
    where: { orgId: org.id, deletedAt: null, status: { in: ["active", "prospect"] } },
  });
  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const memberOptions = members
    .map((m) => {
      const name = dek
        ? (() => {
            const pii = decryptMemberPii(m, dek, org.id);
            return `${pii.firstName} ${pii.lastName}`.trim();
          })()
        : m.id;
      return { id: m.id, name: name || m.id };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Members assigned to this patrol (matched by name).
  const assigned = members.filter((m) => m.patrol === patrol.name);

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Roster · Patrol"
        title={patrol.name}
        description={patrol.description ?? undefined}
        actions={
          <Link href={`/o/${slug}/admin/patrols`} className="btn-secondary">
            ← All patrols
          </Link>
        }
      />
      <PatrolForm
        orgSlug={slug}
        initial={{
          id: patrol.id,
          name: patrol.name,
          color: patrol.color,
          leaderMemberId: patrol.leaderMemberId,
          description: patrol.description,
          archived: patrol.archived,
        }}
        members={memberOptions}
        csrf={<CsrfTokenInput />}
      />

      <div>
        <h2 className="font-display font-semibold text-xl text-ink mb-3">
          Members ({assigned.length})
        </h2>
        {assigned.length === 0 ? (
          <p className="text-sm text-slate-muted">
            No members are assigned to this patrol yet. Set their patrol on
            the member detail page to{" "}
            <code className="font-mono text-xs">{patrol.name}</code>.
          </p>
        ) : (
          <ul className="text-sm divide-y divide-line">
            {assigned.map((m) => {
              const name = dek
                ? (() => {
                    const pii = decryptMemberPii(m, dek, org.id);
                    return `${pii.firstName} ${pii.lastName}`.trim();
                  })()
                : m.id;
              return (
                <li key={m.id} className="py-2 flex items-baseline justify-between gap-3">
                  <Link
                    href={`/o/${slug}/admin/members/${m.id}`}
                    className="text-ink hover:text-accent"
                  >
                    {name || m.id}
                  </Link>
                  <span className="text-xs text-slate-muted">
                    {m.position ?? (m.isYouth ? "Youth" : "Adult")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line pt-6">
        <DeletePatrolButton orgSlug={slug} id={patrol.id} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
