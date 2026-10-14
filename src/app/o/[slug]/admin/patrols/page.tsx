// Patrols admin. Card grid with patrol color, member count (computed
// from Member.patrol matching Patrol.name), and a leader avatar.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { PatrolForm } from "@/components/admin/PatrolForms";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function PatrolsAdmin({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [patrols, members] = await Promise.all([
    prisma.patrol.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { leader: true },
    }),
    prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null, status: { in: ["active", "prospect"] } },
    }),
  ]);

  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const memberOptions = members
    .map((m) => {
      const name = dek
        ? (() => {
            const pii = decryptMemberPii(m, dek, org.id);
            return `${pii.firstName} ${pii.lastName}`.trim();
          })()
        : m.id;
      return { id: m.id, name: name || m.id, patrol: m.patrol };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Member count per patrol — match Member.patrol against Patrol.name.
  const patrolByName = new Map<string, number>();
  for (const m of memberOptions) {
    if (m.patrol) {
      patrolByName.set(m.patrol, (patrolByName.get(m.patrol) ?? 0) + 1);
    }
  }

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Roster"
        title="Patrols"
        description="Patrol metadata: color, leader, description. Member assignment lives on the member detail page (free-form patrol field for back-compat)."
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {patrols.length === 0 ? (
          <p className="text-sm text-slate-muted col-span-full">
            No patrols yet. Add one below.
          </p>
        ) : (
          patrols.map((p) => {
            const leaderName = p.leader && dek
              ? (() => {
                  const pii = decryptMemberPii(p.leader, dek, org.id);
                  return `${pii.firstName} ${pii.lastName}`.trim();
                })()
              : null;
            const count = patrolByName.get(p.name) ?? 0;
            return (
              <Link
                key={p.id}
                href={`/o/${slug}/admin/patrols/${p.id}`}
                className="rounded-xl border border-line bg-surface overflow-hidden hover:border-accent transition-colors"
              >
                <div
                  className="h-12 w-full"
                  style={{ background: p.color }}
                  aria-hidden
                />
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-lg text-ink">{p.name}</span>
                    <span className="font-mono text-xs text-slate-muted">{p.color}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-muted">
                    {count} member{count === 1 ? "" : "s"}
                    {leaderName ? ` · led by ${leaderName}` : ""}
                  </p>
                  {p.description ? (
                    <p className="mt-2 text-xs text-slate-soft line-clamp-2">{p.description}</p>
                  ) : null}
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">
          New patrol
        </h2>
        <PatrolForm orgSlug={slug} members={memberOptions} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
