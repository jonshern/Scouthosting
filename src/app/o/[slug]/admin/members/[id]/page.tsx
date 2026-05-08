// Member detail — five-tab structure per the design_handoff_compass_cms
// member drawer: Profile / Advancement / Parents & guardians / Medical
// & forms / Activity. Tab switching is URL-driven (?tab=...) so the
// page stays a server component and we don't pull in client state.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MemberForm } from "@/components/admin/MemberForm";
import { MemberLifecycleButtons } from "@/components/admin/MemberLifecycleButtons";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Pill } from "@/components/ui";
import { centsToDollars, formatBalance } from "@/lib/treasury/money";

type Tab = "profile" | "advancement" | "parents" | "medical" | "activity";

const TAB_LABELS: Record<Tab, string> = {
  profile: "Profile",
  advancement: "Advancement",
  parents: "Parents & guardians",
  medical: "Medical & forms",
  activity: "Activity",
};

export default async function AdminMemberEdit({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const tab: Tab = (
    ["profile", "advancement", "parents", "medical", "activity"] as const
  ).includes(sp.tab as Tab)
    ? (sp.tab as Tab)
    : "profile";
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  if (!org.encryptedDek) {
    return (
      <section className="space-y-10">
        <AdminPageHeader kicker="Roster" title="Member" />
        <div className="card text-sm text-red-700 bg-red-50 border border-red-200">
          This site doesn&apos;t have an encryption vault yet.
        </div>
      </section>
    );
  }
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || member.orgId !== org.id) notFound();
  const dek = unwrapDekWithMaster(org);
  const pii = decryptMemberPii(member, dek, org.id);
  const [subaccount, scoutbook, parents, audit, allAdults, allYouthsForCount] =
    await Promise.all([
      prisma.memberSubaccount.findUnique({ where: { memberId: member.id } }),
      prisma.scoutbookProfile.findUnique({
        where: { memberId: member.id },
        include: {
          meritBadges: { orderBy: [{ status: "asc" }, { badgeName: "asc" }] },
          awards: { orderBy: { awardedAt: "desc" } },
        },
      }),
      member.parentIds.length > 0
        ? prisma.member.findMany({
            where: { orgId: org.id, id: { in: member.parentIds } },
          })
        : Promise.resolve([]),
      prisma.auditLog.findMany({
        where: { orgId: org.id, entityType: "Member", entityId: member.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.member.findMany({
        where: { orgId: org.id, deletedAt: null, isYouth: false, status: "active" },
        orderBy: [{ lastNameLc1: "asc" }, { createdAt: "asc" }],
        take: 200,
      }),
      prisma.member.findMany({
        where: { orgId: org.id, deletedAt: null, isYouth: true },
        select: { parentIds: true },
      }),
    ]);

  const adultChildCount = new Map<string, number>();
  for (const y of allYouthsForCount) {
    for (const pid of y.parentIds) {
      adultChildCount.set(pid, (adultChildCount.get(pid) ?? 0) + 1);
    }
  }
  const availableAdults = allAdults
    .filter((a) => a.id !== member.id) // can't be your own parent
    .map((a) => {
      const apii = decryptMemberPii(a, dek, org.id);
      return {
        id: a.id,
        name: `${apii.firstName} ${apii.lastName}`.trim() || a.id,
        email: a.email,
        childCount: adultChildCount.get(a.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentCards = parents.map((p) => {
    const pp = decryptMemberPii(p, dek, org.id);
    return {
      id: p.id,
      name: `${pp.firstName} ${pp.lastName}`.trim(),
      email: p.email,
      phone: pp.phone,
    };
  });

  const ageNow = (() => {
    if (!member.birthdate) return null;
    const today = new Date();
    const bd = member.birthdate;
    return (
      today.getFullYear() -
      bd.getFullYear() -
      (today.getMonth() < bd.getMonth() ||
      (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
        ? 1
        : 0)
    );
  })();

  const subline = [
    scoutbook?.rank,
    member.patrol,
    ageNow != null ? `age ${ageNow}` : null,
    member.position,
  ]
    .filter(Boolean)
    .join(" · ");

  const tabHref = (t: Tab) =>
    `/o/${slug}/admin/members/${member.id}?tab=${t}`;

  return (
    <section className="space-y-8">
      <div>
        <Link href={`/o/${slug}/admin/members`} className="text-sm text-slate-soft hover:text-ink">
          ← All members
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent italic font-display">
              § Roster · {member.isYouth ? "Scout" : "Adult"}
            </div>
            <h1 className="font-display text-4xl text-ink mt-1">
              {pii.firstName} {pii.lastName}
            </h1>
            {subline ? (
              <p className="mt-1 italic font-display text-sm text-slate-soft">{subline}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {member.email ? (
              <a
                href={`mailto:${member.email}`}
                className="btn-secondary text-xs"
              >
                Email
              </a>
            ) : null}
          </div>
        </div>
        {member.deletedAt && (
          <div className="mt-3 inline-block text-sm bg-warn-soft border border-warn/30 rounded p-2 text-warn">
            Removed on {new Date(member.deletedAt).toLocaleDateString()}.
          </div>
        )}
      </div>

      {/* Tabs */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-line">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={
              "px-4 py-2 text-sm transition-colors -mb-px " +
              (t === tab
                ? "border-b-2 border-accent text-ink font-medium"
                : "border-b-2 border-transparent text-slate-soft hover:text-ink")
            }
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {/* ── Profile tab ──────────────────────────────────────────── */}
      {tab === "profile" && (
        <>
          <MemberForm
            orgSlug={slug}
            initial={{
              id: member.id,
              firstName: pii.firstName,
              lastName: pii.lastName,
              email: member.email,
              phone: pii.phone,
              street: pii.street,
              city: pii.city,
              state: pii.state,
              zip: pii.zip,
              isYouth: member.isYouth,
              patrol: member.patrol,
              position: member.position,
              commPreference: member.commPreference,
              status: member.status,
              shirtSize: member.shirtSize,
              dietaryFlags: member.dietaryFlags,
              parentIds: member.parentIds,
            }}
            csrf={<CsrfTokenInput />}
            availableAdults={availableAdults}
          />
          {subaccount ? (
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg text-ink">Treasury subaccount</h3>
                <Link
                  href={`/o/${slug}/admin/treasury/members/${member.id}`}
                  className="text-sm text-accent hover:text-ink"
                >
                  Open ledger →
                </Link>
              </div>
              <p
                className={`mt-2 font-mono text-xl ${
                  subaccount.balanceCents < 0 ? "text-danger" : "text-success"
                }`}
              >
                {formatBalance(subaccount.balanceCents)}
              </p>
            </div>
          ) : null}
          <MemberLifecycleButtons
            orgSlug={slug}
            memberId={member.id}
            isDeleted={Boolean(member.deletedAt)}
            csrf={<CsrfTokenInput />}
          />
        </>
      )}

      {/* ── Advancement tab ──────────────────────────────────────── */}
      {tab === "advancement" && (
        <>
          {scoutbook ? (
            <>
              <div className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg text-ink">Current rank</h3>
                  <span className="text-xs text-slate-muted">
                    Synced {scoutbook.syncedAt.toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 font-display text-3xl text-accent">
                  {scoutbook.rank ?? "Not on file"}
                </p>
                {scoutbook.rankAchievedAt ? (
                  <p className="mt-1 text-xs text-slate-muted">
                    Achieved {scoutbook.rankAchievedAt.toLocaleDateString()}
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-line bg-surface p-5">
                <h3 className="font-display text-lg text-ink mb-3">Activity totals</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="font-mono text-2xl">{scoutbook.serviceHours}</div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                      Service hours
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-2xl">{scoutbook.campingNights}</div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                      Camping nights
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-2xl">{scoutbook.hikingMiles}</div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                      Hiking miles
                    </div>
                  </div>
                </div>
              </div>

              {scoutbook.meritBadges.length > 0 ? (
                <div className="rounded-xl border border-line bg-surface p-5">
                  <h3 className="font-display text-lg text-ink mb-3">
                    Merit badges ({scoutbook.meritBadges.length})
                  </h3>
                  <ul className="grid gap-1 sm:grid-cols-2 text-sm">
                    {scoutbook.meritBadges.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-baseline justify-between gap-2 py-1"
                      >
                        <span className="text-ink">{b.badgeName}</span>
                        <Pill
                          tone={
                            b.status === "completed" || b.status === "approved"
                              ? "success"
                              : b.status === "in-progress"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {b.status}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {scoutbook.awards.length > 0 ? (
                <div className="rounded-xl border border-line bg-surface p-5">
                  <h3 className="font-display text-lg text-ink mb-3">
                    Awards ({scoutbook.awards.length})
                  </h3>
                  <ul className="grid gap-1 sm:grid-cols-2 text-sm">
                    {scoutbook.awards.map((a) => (
                      <li key={a.id} className="py-1 text-ink">
                        {a.awardName}
                        {a.awardedAt ? (
                          <span className="text-xs text-slate-muted ml-2">
                            · {a.awardedAt.toLocaleDateString()}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-xs text-slate-muted">
                Source: Scoutbook (BSA member id{" "}
                <span className="font-mono">{scoutbook.scoutbookUserId}</span>).
                Edits go through Scoutbook directly.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-line bg-surface p-6 text-sm text-slate-soft">
              No Scoutbook profile cached for this member yet. Link a BSA member ID
              from <Link href={`/o/${slug}/admin/scoutbook`} className="text-accent">
                /admin/scoutbook
              </Link>{" "}then re-run the CSV import.
            </div>
          )}
        </>
      )}

      {/* ── Parents & guardians ──────────────────────────────────── */}
      {tab === "parents" && (
        <div className="space-y-3">
          <h3 className="font-display text-lg text-ink">Linked parents / guardians</h3>
          {parentCards.length === 0 ? (
            <p className="text-sm text-slate-muted">
              No parents linked yet.
              {member.isYouth ? (
                <>
                  {" "}Edit the member&rsquo;s <code className="font-mono text-xs">parentIds</code>{" "}
                  via the API or sibling Add-Member flow to wire one up.
                </>
              ) : null}
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {parentCards.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-lg text-ink">{p.name}</span>
                    <Pill tone="accent">Linked</Pill>
                  </div>
                  <div className="mt-1 text-xs text-slate-muted">
                    {p.email ?? "no email"}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </div>
                  <Link
                    href={`/o/${slug}/admin/members/${p.id}`}
                    className="mt-3 inline-block text-xs text-accent"
                  >
                    Open record →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Medical & forms ──────────────────────────────────────── */}
      {tab === "medical" && (
        <div className="space-y-4">
          <h3 className="font-display text-lg text-ink">Medical & forms</h3>
          <dl className="grid gap-2 sm:grid-cols-2 dashed-divide">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                Allergies / dietary
              </dt>
              <dd className="mt-1 text-ink">
                {member.dietaryFlags.length === 0 ? (
                  <span className="text-slate-muted">None on file</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {member.dietaryFlags.map((f) => (
                      <Pill key={f} tone="amber">{f}</Pill>
                    ))}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                Shirt size
              </dt>
              <dd className="mt-1 text-ink">
                {member.shirtSize ?? <span className="text-slate-muted">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                Birthdate
              </dt>
              <dd className="mt-1 text-ink">
                {member.birthdate ? member.birthdate.toLocaleDateString() : <span className="text-slate-muted">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-line text-slate-soft text-sm">
                {member.notes ?? <span className="text-slate-muted">—</span>}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate-muted">
            Annual health forms (A/B/C) live outside Compass for now — leaders track
            them per-trip via the existing trip plan attachments.
          </p>
        </div>
      )}

      {/* ── Activity (audit log filtered to this member) ─────────── */}
      {tab === "activity" && (
        <div className="space-y-3">
          <h3 className="font-display text-lg text-ink">Activity</h3>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-muted">No edits recorded yet.</p>
          ) : (
            <ul className="text-sm divide-y divide-line">
              {audit.map((a) => (
                <li key={a.id} className="py-2">
                  <span className="text-[11px] font-mono text-slate-muted">
                    {a.createdAt.toLocaleString()}
                  </span>{" "}
                  · <span className="text-ink">{a.userDisplay ?? "system"}</span>{" "}
                  · <Pill tone={
                    a.action === "create"
                      ? "success"
                      : a.action === "delete"
                        ? "danger"
                        : "accent"
                  }>{a.action}</Pill>{" "}
                  {a.summary ? <span className="text-slate-soft">{a.summary}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/o/${slug}/admin/audit?entity=Member&q=${member.id}`}
            className="text-xs text-accent"
          >
            Open in audit log →
          </Link>
        </div>
      )}
    </section>
  );
}

void centsToDollars;
