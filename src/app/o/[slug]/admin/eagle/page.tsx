// /o/[slug]/admin/eagle — Eagle Scouts roll + active EagleProjects.
// Now also surfaces Scoutbook-sourced Eagle rank rows so leaders see
// who Scoutbook believes is an Eagle but isn't on the manual roll yet.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { Pill } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Eagle pipeline" };

export default async function EaglePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/eagle`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const [scouts, projects, scoutbookEagles] = await Promise.all([
    prisma.eagleScout.findMany({
      where: { orgId: org.id },
      orderBy: [{ earnedAt: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.eagleProject.findMany({
      where: { orgId: org.id, status: { not: "complete" } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.scoutbookProfile.findMany({
      where: {
        orgId: org.id,
        rank: { equals: "Eagle", mode: "insensitive" },
      },
      include: { member: true },
      orderBy: { rankAchievedAt: "desc" },
    }),
  ]);

  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const scoutbookEagleRows = scoutbookEagles.map((p) => {
    let name = p.scoutbookUserId;
    if (dek) {
      const pii = decryptMemberPii(p.member, dek, org.id);
      name = `${pii.firstName} ${pii.lastName}`.trim() || name;
    }
    return {
      memberId: p.memberId,
      name,
      rankAchievedAt: p.rankAchievedAt,
      onManualRoll: false, // computed below
    };
  });
  // Mark which Scoutbook Eagles are already on the manual roll. Match
  // by display name + earnedAt as best-effort; manual roll predates
  // the sync so the data shapes don't line up perfectly.
  const manualRollKey = new Set(
    scouts.map((s) => `${s.firstName} ${s.lastName}`.toLowerCase()),
  );
  for (const r of scoutbookEagleRows) {
    if (manualRollKey.has(r.name.toLowerCase())) r.onManualRoll = true;
  }

  return (
    <section className="space-y-10">
      <AdminPageHeader kicker="Roster" title="Eagle pipeline" />
      <section>
        {scouts.length === 0 ? (
          <p className="text-slate-soft">No Eagle Scouts on the roll yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {scouts.map((s) => (
              <li key={s.id}>
                <strong>
                  {s.firstName} {s.lastName}
                </strong>{" "}
                — {s.earnedAt.toLocaleDateString()}
                {s.projectName ? ` · ${s.projectName}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      {scoutbookEagleRows.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
            From Scoutbook
          </h2>
          <p className="text-xs text-slate-muted mb-3">
            Synced from Scoutbook. Add missing entries to the manual roll above to record project details.
          </p>
          <ul className="space-y-1 text-sm">
            {scoutbookEagleRows.map((r) => (
              <li key={r.memberId} className="flex flex-wrap items-baseline gap-2">
                <strong>{r.name}</strong>
                {r.rankAchievedAt ? (
                  <span className="text-slate-muted">
                    · {r.rankAchievedAt.toLocaleDateString()}
                  </span>
                ) : null}
                {r.onManualRoll ? (
                  <Pill tone="success">On roll</Pill>
                ) : (
                  <Pill tone="amber">Not on roll</Pill>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">Active Eagle projects</h2>
        {projects.length === 0 ? (
          <p className="text-slate-soft text-sm">No active projects.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="card">
                <div className="font-medium">{p.scoutName}</div>
                <div className="text-xs text-slate-muted">
                  {p.status}
                  {p.beneficiary ? ` · ${p.beneficiary}` : ""}
                  {p.mentorName ? ` · mentor: ${p.mentorName}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
