// /o/[slug]/admin/oa — Order of the Arrow elections + candidates.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Order of the Arrow" };

export default async function OaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/oa`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const elections = await prisma.oaElection.findMany({
    where: { orgId: org.id },
    orderBy: { electionDate: "desc" },
    include: { candidates: { orderBy: { candidateName: "asc" } } },
  });

  return (
    <section>
      <AdminPageHeader kicker="Roster" title="Order of the Arrow" />
      {elections.length === 0 ? (
        <p className="text-slate-soft">No elections recorded.</p>
      ) : (
        <ul className="space-y-4">
          {elections.map((e) => (
            <li key={e.id} className="card">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display font-semibold text-lg">
                  {e.electionDate.toLocaleDateString()}
                  {e.lodgeName ? ` · ${e.lodgeName}` : ""}
                </h2>
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                  {e.status}
                </span>
              </div>
              {e.votingMembersCount != null && (
                <p className="text-xs text-slate-muted">
                  Voting unit: {e.votingMembersCount}
                  {e.votingThreshold != null
                    ? ` · threshold: ${e.votingThreshold}`
                    : ""}
                </p>
              )}
              <ul className="mt-2 text-sm space-y-1">
                {e.candidates.map((c) => (
                  <li key={c.id}>
                    {c.candidateName}{" "}
                    <span className="text-xs text-slate-muted">
                      — {c.status}
                      {c.votesFor != null
                        ? ` · ${c.votesFor} for / ${c.votesAgainst ?? 0} against`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
