// Scoutbook sync admin. CSV importer + last-run summary + a list of
// members with no Scoutbook user ID linked yet so the leader can
// either link manually or import a CSV that includes them.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  ScoutbookCsvForm,
  LinkScoutbookForm,
} from "@/components/admin/ScoutbookForms";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { Pill, Stat, StatRow } from "@/components/ui";

export default async function ScoutbookAdmin({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [profiles, runs, unlinked] = await Promise.all([
    prisma.scoutbookProfile.findMany({
      where: { orgId: org.id },
      include: { member: true },
      orderBy: { syncedAt: "desc" },
      take: 200,
    }),
    prisma.scoutbookSyncRun.findMany({
      where: { orgId: org.id },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    prisma.member.findMany({
      where: {
        orgId: org.id,
        deletedAt: null,
        status: { in: ["active", "prospect"] },
        isYouth: true,
        scoutbookUserId: null,
      },
      take: 100,
    }),
  ]);

  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Scoutbook"
        title="Read-only sync"
        description="Pull rank, service hours, camping nights, hiking miles from Scoutbook into Compass for parent-portal display + Eagle tracker. We never write back."
        actions={
          <Link href={`/o/${slug}/admin/members`} className="btn-secondary">
            Roster
          </Link>
        }
      />

      <StatRow>
        <Stat label="Profiles cached" value={profiles.length} />
        <Stat label="Last syncs" value={runs.length} />
        <Stat label="Youths missing link" value={unlinked.length} tone={unlinked.length > 0 ? "danger" : "default"} />
      </StatRow>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">Import advancement CSV</h2>
        <p className="text-sm text-slate-muted mb-3">
          From Internet Advancement / My.Scouting: <em>Council Advancement Reports</em> →
          export the unit roster + advancement summary as CSV with member IDs visible.
        </p>
        <ScoutbookCsvForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">Sync history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-muted">No syncs yet.</p>
        ) : (
          <ul className="text-sm divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="py-2">
                <span className="font-mono text-xs text-slate-muted">{r.id.slice(0, 8)}</span>{" "}
                · {r.startedAt.toLocaleString()} · {r.source} · applied {r.rowsApplied}/{r.rowsSeen}
                {r.errorMessage ? <span className="text-danger"> · {r.errorMessage}</span> : null}
                {r.warnings.length > 0 ? (
                  <span className="text-amber"> · {r.warnings.length} warning(s)</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">Profiles</h2>
        {profiles.length === 0 ? (
          <p className="text-sm text-slate-muted">No profiles yet — run a CSV import.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Scout</th>
                  <th className="px-4 py-2 font-semibold">Rank</th>
                  <th className="px-4 py-2 font-semibold text-right">Service hr</th>
                  <th className="px-4 py-2 font-semibold text-right">Camping nt</th>
                  <th className="px-4 py-2 font-semibold text-right">Hiking mi</th>
                  <th className="px-4 py-2 font-semibold">Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profiles.map((p) => {
                  let name = p.scoutbookUserId;
                  if (dek) {
                    const pii = decryptMemberPii(p.member, dek, org.id);
                    name = `${pii.firstName} ${pii.lastName}`.trim() || name;
                  }
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-ink font-medium">{name}</td>
                      <td className="px-4 py-3">
                        {p.rank ? <Pill tone="accent">{p.rank}</Pill> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{p.serviceHours}</td>
                      <td className="px-4 py-3 text-right font-mono">{p.campingNights}</td>
                      <td className="px-4 py-3 text-right font-mono">{p.hikingMiles}</td>
                      <td className="px-4 py-3 text-slate-soft text-xs">
                        {p.syncedAt.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {unlinked.length > 0 ? (
        <div>
          <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">
            Youths without a Scoutbook ID
          </h2>
          <p className="text-sm text-slate-muted mb-3">
            Paste the BSA member ID here so future imports can match this Scout.
          </p>
          <ul className="space-y-2">
            {unlinked.map((m) => {
              let name = m.id;
              if (dek) {
                const pii = decryptMemberPii(m, dek, org.id);
                name = `${pii.firstName} ${pii.lastName}`.trim() || m.id;
              }
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-3">
                  <span className="text-ink font-medium">{name}</span>
                  <LinkScoutbookForm orgSlug={slug} memberId={m.id} csrf={<CsrfTokenInput />} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
