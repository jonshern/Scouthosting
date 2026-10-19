// Roster admin index. Per design_handoff_compass_cms §7:
//   - five tabs: Scouts / Adults / Merit Badge Counselors / Patrols / Pending
//   - stats strip at the top: active scouts, adults (+ trained sub),
//     MB counselors (in-troop + external), patrols, pending count
// Tabs are URL-driven via ?tab=<scouts|adults|counselors|patrols|pending>.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";
import { ApproveButton, DeclineButton } from "@/components/admin/PendingActions";
import {
  MemberDetailBody,
  isMemberTab,
  type MemberTab,
} from "@/components/admin/MemberDetailBody";
import { MemberDrawerOverlay } from "@/components/admin/MemberDrawerOverlay";
import { MembersGrid, type MemberGridRow } from "@/components/admin/MembersGrid";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { InviteEveryoneButton } from "@/components/admin/AccessForms";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { Pill } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

type Tab = "scouts" | "adults" | "counselors" | "patrols" | "pending";

const TAB_LABELS: Record<Tab, string> = {
  scouts: "Scouts",
  adults: "Adult members",
  counselors: "Merit badge counselors",
  patrols: "Patrols",
  pending: "Pending",
};

function applyTextSearch<T extends { firstName: string; lastName: string }>(
  rows: T[],
  q: string,
): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    `${r.firstName} ${r.lastName}`.toLowerCase().includes(needle),
  );
}

export default async function AdminMembersIndex({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ trash?: string; q?: string; tab?: string; member?: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { trash, q, tab: rawTab, member: drawerMemberId } = await searchParams;
  const showTrash = trash === "1";
  const tab: Tab = (
    ["scouts", "adults", "counselors", "patrols", "pending"] as const
  ).includes(rawTab as Tab)
    ? (rawTab as Tab)
    : "scouts";

  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  if (!org.encryptedDek) {
    return (
      <section className="space-y-6">
        <AdminPageHeader kicker="Roster" title="Members" />
        <div className="card border-danger-line bg-danger-soft text-sm text-danger">
          This site doesn&apos;t have an encryption vault yet. Re-create the org or
          restore from a recovery code to view roster data.
        </div>
      </section>
    );
  }

  // Fetch the data needed for stats first — quick aggregate counts
  // independent of the active tab.
  const [
    youthCount,
    adultCount,
    pendingCount,
    inTroopCounselorCount,
    externalCounselorCount,
    patrolCount,
    trainings,
  ] = await Promise.all([
    prisma.member.count({
      where: { orgId: org.id, deletedAt: null, isYouth: true, status: "active" },
    }),
    prisma.member.count({
      where: { orgId: org.id, deletedAt: null, isYouth: false, status: "active" },
    }),
    prisma.member.count({
      where: { orgId: org.id, deletedAt: null, status: "prospect" },
    }),
    prisma.meritBadgeCounselor.count({
      where: { orgId: org.id, memberId: { not: null } },
    }),
    prisma.meritBadgeCounselor.count({
      where: { orgId: org.id, memberId: null },
    }),
    prisma.patrol.count({
      where: { orgId: org.id, archived: false },
    }),
    // YPT trained / not-trained ratio for the Adults tile.
    prisma.training.findMany({
      where: {
        orgId: org.id,
        courseName: { contains: "youth protection", mode: "insensitive" },
      },
      select: { memberId: true, expiresAt: true },
    }),
  ]);

  const yptTrainedMemberIds = new Set(
    trainings
      .filter((t) => !t.expiresAt || t.expiresAt > new Date())
      .map((t) => t.memberId),
  );
  // Untrained adults = all adult Member ids minus the trained set.
  const untrainedAdults = await prisma.member
    .findMany({
      where: { orgId: org.id, deletedAt: null, isYouth: false, status: "active" },
      select: { id: true },
    })
    .then((rs) => rs.filter((r) => !yptTrainedMemberIds.has(r.id)).length);

  // Per-tab data.
  const dek = unwrapDekWithMaster(org);

  const firstChar = q && /^[a-zA-Z]/.test(q) ? q[0]!.toLowerCase() : null;
  const memberWhereCommon = {
    orgId: org.id,
    deletedAt: showTrash ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            ...(firstChar ? [{ lastNameLc1: firstChar }] : []),
          ],
        }
      : {}),
  };

  // For Scouts and Adults tabs, filter on isYouth.
  let memberRows: { id: string; firstName: string; lastName: string; patrol: string | null; position: string | null; email: string | null; isYouth: boolean; status: string }[] = [];
  let patrolRows: { id: string; name: string; color: string; leaderName: string | null; memberCount: number }[] = [];
  let counselorRows: { id: string; name: string; inTroop: boolean; badges: string[] }[] = [];
  let pendingRows: { id: string; firstName: string; lastName: string; email: string | null; prospectSource: string | null; firstContactedAt: Date | null }[] = [];

  if (tab === "scouts" || tab === "adults") {
    const isYouth = tab === "scouts";
    const where = {
      ...memberWhereCommon,
      isYouth,
      status: showTrash ? undefined : "active",
    };
    const raw = await prisma.member.findMany({
      where: where as never,
      orderBy: [{ lastNameLc1: "asc" }, { createdAt: "asc" }],
      take: q ? 400 : 200,
    });
    const decrypted = raw.map((m) => {
      const pii = decryptMemberPii(m, dek, org.id);
      return { ...m, ...pii };
    });
    decrypted.sort((a, b) => {
      const c = a.lastName.localeCompare(b.lastName);
      return c !== 0 ? c : a.firstName.localeCompare(b.firstName);
    });
    const filtered = q ? applyTextSearch(decrypted, q) : decrypted;
    memberRows = filtered.slice(0, 200).map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      patrol: m.patrol,
      position: m.position,
      email: m.email,
      isYouth: m.isYouth,
      status: m.status,
    }));
  } else if (tab === "patrols") {
    const patrols = await prisma.patrol.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: { name: "asc" },
      include: { leader: true },
    });
    // Member counts by patrol.name.
    const allActive = await prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null, status: "active" },
      select: { patrol: true },
    });
    const byName = new Map<string, number>();
    for (const m of allActive) {
      if (m.patrol) byName.set(m.patrol, (byName.get(m.patrol) ?? 0) + 1);
    }
    patrolRows = patrols.map((p) => {
      let leaderName: string | null = null;
      if (p.leader) {
        const pii = decryptMemberPii(p.leader, dek, org.id);
        leaderName = `${pii.firstName} ${pii.lastName}`.trim() || null;
      }
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        leaderName,
        memberCount: byName.get(p.name) ?? 0,
      };
    });
  } else if (tab === "counselors") {
    const counselors = await prisma.meritBadgeCounselor.findMany({
      where: { orgId: org.id },
      orderBy: { name: "asc" },
      take: 500,
    });
    counselorRows = counselors.map((c) => ({
      id: c.id,
      name: c.name,
      inTroop: c.memberId !== null,
      badges: c.badges,
    }));
  } else if (tab === "pending") {
    const prospects = await prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null, status: "prospect" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    pendingRows = prospects.map((p) => {
      const pii = decryptMemberPii(p, dek, org.id);
      return {
        id: p.id,
        firstName: pii.firstName,
        lastName: pii.lastName,
        email: p.email,
        prospectSource: p.prospectSource,
        firstContactedAt: p.firstContactedAt,
      };
    });
  }

  const tabHref = (t: Tab) => {
    const sp = new URLSearchParams();
    sp.set("tab", t);
    if (q) sp.set("q", q);
    if (showTrash) sp.set("trash", "1");
    return `/o/${slug}/admin/members?${sp.toString()}`;
  };

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Roster"
        title={showTrash ? "Members · trash" : "Members"}
        description={
          showTrash
            ? "Soft-deleted entries. Restore or purge from here."
            : "Active roster: youth, adults, MB counselors, patrols, pending."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showTrash ? null : <InviteEveryoneButton orgSlug={slug} csrf={<CsrfTokenInput />} />}
            <Link
              href={`/o/${slug}/admin/members${showTrash ? "" : "?trash=1"}`}
              className="btn-secondary"
            >
              {showTrash ? "Active roster" : "View trash"}
            </Link>
          </div>
        }
      />

      {/* Stats strip — five tiles per the handoff. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Active scouts" value={youthCount} />
        <StatTile
          label="Adult members"
          value={adultCount}
          sub={
            untrainedAdults > 0
              ? `${untrainedAdults} not YPT-trained`
              : "All YPT-trained"
          }
          tone={untrainedAdults > 0 ? "warn" : "default"}
        />
        <StatTile
          label="MB counselors"
          value={inTroopCounselorCount + externalCounselorCount}
          sub={`${inTroopCounselorCount} in-troop · ${externalCounselorCount} external`}
        />
        <StatTile label="Patrols" value={patrolCount} />
        <StatTile
          label="Pending"
          value={pendingCount}
          tone={pendingCount > 0 ? "accent" : "default"}
        />
      </div>

      {/* Tabs */}
      <nav className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={
              "rounded-full px-3 py-1.5 text-sm transition-colors " +
              (t === tab
                ? "bg-ink text-white"
                : "text-slate-soft hover:text-ink hover:bg-surface-alt")
            }
          >
            {TAB_LABELS[t]}
            {t === "pending" && pendingCount > 0 ? (
              <span className="ml-1.5 text-[10px] font-semibold">{pendingCount}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {/* Search bar — only relevant for scouts / adults tabs */}
      {(tab === "scouts" || tab === "adults") && (
        <form action={`/o/${slug}/admin/members`} method="GET" className="space-y-2">
          <input type="hidden" name="tab" value={tab} />
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name or email"
              className="field flex-1"
            />
            {showTrash && <input type="hidden" name="trash" value="1" />}
            <button type="submit" className="btn-secondary">Search</button>
          </div>
          <p className="text-xs text-slate-muted">
            Names are encrypted at rest — name searches match within the visible page.
            For broader matches, search by email.
          </p>
        </form>
      )}

      {/* Tab body */}
      {tab === "scouts" || tab === "adults" ? (
        (() => {
          const baseSp = new URLSearchParams();
          baseSp.set("tab", tab);
          if (q) baseSp.set("q", q);
          if (showTrash) baseSp.set("trash", "1");
          return (
            <MembersGrid
              rows={memberRows as MemberGridRow[]}
              drawerBaseHref={`/o/${slug}/admin/members`}
              drawerBaseQuery={baseSp.toString()}
              emptyMessage={
                showTrash ? "Nothing in the trash." : "No members yet."
              }
            />
          );
        })()
      ) : null}
      {tab === "patrols" ? <PatrolList rows={patrolRows} slug={slug} /> : null}
      {tab === "counselors" ? <CounselorList rows={counselorRows} slug={slug} /> : null}
      {tab === "pending" ? <PendingList rows={pendingRows} slug={slug} /> : null}

      {/* Add-a-member form on the Scouts tab when not in trash.
          Includes the link-existing-adult picker. */}
      {tab === "scouts" && !showTrash ? (
        <div className="space-y-3 border-t border-line pt-8">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em]">
            Add a member
          </h2>
          <AddMemberForm orgSlug={slug} orgId={org.id} dek={dek} />
        </div>
      ) : null}

      {/* Drawer overlay: rendered when ?member=<id> is in the URL.
          Reuses the same MemberDetailBody as the standalone page so
          the content stays in sync between the two routes. */}
      {drawerMemberId ? (
        <MemberDrawerOverlay closeHref={`/o/${slug}/admin/members`}>
          <MemberDetailBody
            slug={slug}
            memberId={drawerMemberId}
            tab={isMemberTab(rawTab) ? (rawTab as MemberTab) : "profile"}
            buildTabHref={(t) => {
              const sp = new URLSearchParams();
              sp.set("tab", t);
              if (q) sp.set("q", q);
              if (showTrash) sp.set("trash", "1");
              sp.set("member", drawerMemberId);
              return `/o/${slug}/admin/members?${sp.toString()}`;
            }}
            variant="drawer"
          />
        </MemberDrawerOverlay>
      ) : null}
    </section>
  );
}

async function AddMemberForm({
  orgSlug,
  orgId,
  dek,
}: {
  orgSlug: string;
  orgId: string;
  dek: Buffer;
}) {
  const adults = await prisma.member.findMany({
    where: { orgId, deletedAt: null, isYouth: false, status: "active" },
    orderBy: [{ lastNameLc1: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  const adultIds = adults.map((a) => a.id);
  const youths =
    adultIds.length === 0
      ? []
      : await prisma.member.findMany({
          where: {
            orgId,
            deletedAt: null,
            isYouth: true,
            parentIds: { hasSome: adultIds },
          },
          select: { parentIds: true },
        });
  const childCounts = new Map<string, number>();
  for (const y of youths) {
    for (const pid of y.parentIds) {
      childCounts.set(pid, (childCounts.get(pid) ?? 0) + 1);
    }
  }
  const available = adults
    .map((a) => {
      const pii = decryptMemberPii(a, dek, orgId);
      return {
        id: a.id,
        name: `${pii.firstName} ${pii.lastName}`.trim() || a.id,
        email: a.email,
        childCount: childCounts.get(a.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <MemberForm
      orgSlug={orgSlug}
      csrf={<CsrfTokenInput />}
      availableAdults={available}
    />
  );
}

function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "accent" | "warn";
}) {
  const valueClass = {
    default: "text-ink",
    accent: "text-accent",
    warn: "text-warn",
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <div className={`font-display text-3xl font-semibold mt-1 ${valueClass}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-muted">{sub}</div> : null}
    </div>
  );
}

function PatrolList({
  rows,
  slug,
}: {
  rows: { id: string; name: string; color: string; leaderName: string | null; memberCount: number }[];
  slug: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-muted">
        No patrols yet.{" "}
        <Link href={`/o/${slug}/admin/patrols`} className="text-accent hover:text-ink">
          Create one →
        </Link>
      </div>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((p) => (
        <li key={p.id} className="rounded-xl border border-line bg-surface overflow-hidden">
          <Link href={`/o/${slug}/admin/patrols/${p.id}`} className="block">
            <div className="h-10" style={{ background: p.color }} aria-hidden />
            <div className="p-4">
              <div className="font-display font-semibold text-lg text-ink">{p.name}</div>
              <div className="mt-1 text-xs text-slate-muted">
                {p.memberCount} member{p.memberCount === 1 ? "" : "s"}
                {p.leaderName ? ` · led by ${p.leaderName}` : ""}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CounselorList({
  rows,
  slug,
}: {
  rows: { id: string; name: string; inTroop: boolean; badges: string[] }[];
  slug: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-muted">
        No merit badge counselors on file.{" "}
        <Link
          href={`/o/${slug}/admin/merit-badge-counselors`}
          className="text-accent hover:text-ink"
        >
          Add one →
        </Link>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-4 py-2 font-semibold">Type</th>
            <th className="px-4 py-2 font-semibold">Counsels</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
              <td className="px-4 py-3">
                {c.inTroop ? (
                  <Pill tone="accent">In-troop</Pill>
                ) : (
                  <Pill tone="amber">External</Pill>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {c.badges.length === 0 ? (
                  <span className="text-slate-muted">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {c.badges.slice(0, 5).map((b) => (
                      <span key={b} className="tag">{b}</span>
                    ))}
                    {c.badges.length > 5 ? (
                      <span className="text-slate-muted">+{c.badges.length - 5}</span>
                    ) : null}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingList({
  rows,
  slug,
}: {
  rows: { id: string; firstName: string; lastName: string; email: string | null; prospectSource: string | null; firstContactedAt: Date | null }[];
  slug: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-muted">
        No pending prospects. Add a lead from the leads page or via a public sign-up form.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-4 py-2 font-semibold">Email</th>
            <th className="px-4 py-2 font-semibold">Source</th>
            <th className="px-4 py-2 font-semibold">First contacted</th>
            <th className="px-4 py-2 font-semibold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-medium text-ink">
                {p.firstName} {p.lastName}
              </td>
              <td className="px-4 py-3 text-slate-soft">{p.email ?? "—"}</td>
              <td className="px-4 py-3 text-slate-soft text-xs">
                {p.prospectSource ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-soft text-xs">
                {p.firstContactedAt ? p.firstContactedAt.toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 text-xs">
                  <ApproveButton orgSlug={slug} memberId={p.id} csrf={<CsrfTokenInput />} />
                  <DeclineButton orgSlug={slug} memberId={p.id} csrf={<CsrfTokenInput />} />
                  <Link
                    href={`/o/${slug}/admin/members/${p.id}`}
                    className="text-accent hover:text-ink"
                  >
                    Open →
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
