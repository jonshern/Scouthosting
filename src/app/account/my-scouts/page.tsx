// Parent-facing "My Scouts" portal. Lists every roster Member across
// every org that links the signed-in user as a parent, with their
// upcoming events, RSVP status, permission-slip status, and treasury
// balance + recent transactions.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { myScoutsForUser } from "@/lib/parents/my-scouts";
import { Pill, SectionHeader } from "@/components/ui";
import { centsToDollars, formatBalance } from "@/lib/treasury/money";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PayBalanceForm } from "@/components/account/PayBalanceForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Scouts" };

export default async function MyScoutsPage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/my-scouts");

  const scouts = await myScoutsForUser(user);

  // Per-org Stripe wiring lookup so the pay button only renders where
  // it'll actually work.
  const orgSlugs = [...new Set(scouts.map((s) => s.orgSlug))];
  const stripeOrgs = await prisma.org.findMany({
    where: { slug: { in: orgSlugs } },
    select: { slug: true, treasuryStripeKeyPrefix: true },
  });
  const canPayBySlug = new Map(stripeOrgs.map((o) => [o.slug, !!o.treasuryStripeKeyPrefix]));

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <SectionHeader
        eyebrow="Family"
        title="My Scouts"
        description="Every Scout linked to you across the units you belong to. RSVPs, permission-slip status, and upcoming dates all in one place."
      />

      {scouts.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm text-slate-soft">
            We couldn&rsquo;t find any Scouts linked to your email
            (<strong>{user.email}</strong>). Ask a leader to add you as a
            parent on the member detail page, then refresh.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {scouts.map((s) => (
            <article key={`${s.orgId}-${s.memberId}`} className="rounded-xl border border-line bg-surface p-6">
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-ink">{s.scoutName || "Scout"}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-muted">
                    <Pill tone="accent">{s.orgDisplayName}</Pill>
                    {s.patrol ? <span>· {s.patrol}</span> : null}
                    {s.position ? <span>· {s.position}</span> : null}
                  </div>
                </div>
                <Link
                  href={`/o/${s.orgSlug}/calendar`}
                  className="text-sm text-sky hover:text-ink"
                >
                  Unit calendar →
                </Link>
              </header>

              <div className="mt-4">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-muted">
                  Upcoming · next 90 days
                </h3>
                {s.upcoming.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-muted">
                    Nothing on the calendar this Scout has RSVP&rsquo;d to or that needs a slip.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {s.upcoming.map((e) => (
                      <li key={e.eventId} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                        <div>
                          <div className="font-medium text-ink">{e.title}</div>
                          <div className="text-xs text-slate-muted">
                            {e.startsAt.toLocaleString()}
                            {e.location ? ` · ${e.location}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {e.rsvp === "yes" ? (
                            <Pill tone="success">RSVP yes</Pill>
                          ) : e.rsvp === "no" ? (
                            <Pill tone="neutral">RSVP no</Pill>
                          ) : e.rsvp === "maybe" ? (
                            <Pill tone="amber">RSVP maybe</Pill>
                          ) : null}
                          {e.requiresPermissionSlip ? (
                            e.slipSigned ? (
                              <Pill tone="success">Slip signed</Pill>
                            ) : (
                              <Pill tone="danger">Slip needed</Pill>
                            )
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {s.scoutbook ? (
                <div className="mt-6 rounded-md border border-line bg-surface-alt px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-muted">
                      Scoutbook
                    </h3>
                    <span className="text-xs text-slate-muted">
                      Synced {s.scoutbook.syncedAt.toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Rank</div>
                      <div className="text-ink font-medium">{s.scoutbook.rank ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Service hr</div>
                      <div className="font-mono">{s.scoutbook.serviceHours}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Camping nt</div>
                      <div className="font-mono">{s.scoutbook.campingNights}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-muted">Hiking mi</div>
                      <div className="font-mono">{s.scoutbook.hikingMiles}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-muted">
                    Source: Scoutbook (BSA member id {s.scoutbook.scoutbookUserId}). Edits go through Scoutbook directly.
                  </p>
                </div>
              ) : null}

              {s.balanceCents !== null ? (
                <div className="mt-6 rounded-md border border-line bg-surface-alt px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-muted">
                      Account balance
                    </h3>
                    <span
                      className={`font-display text-xl ${
                        s.balanceCents < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {formatBalance(s.balanceCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-muted">
                    {s.balanceCents < 0
                      ? "Family owes the unit"
                      : s.balanceCents > 0
                        ? "Credit on file"
                        : "All settled"}
                  </p>
                  {s.recentTransactions.length > 0 ? (
                    <ul className="mt-3 divide-y divide-line-soft text-xs">
                      {s.recentTransactions.map((t) => (
                        <li key={t.id} className="flex items-baseline justify-between gap-3 py-1.5">
                          <span className="text-slate-soft">
                            {t.postedAt.toLocaleDateString()} ·{" "}
                            <span className="text-ink">{t.description}</span>
                            <span className="text-slate-muted"> · {t.fundName}</span>
                          </span>
                          <span
                            className={`font-mono ${
                              t.amountCents < 0 ? "text-danger" : "text-success"
                            }`}
                          >
                            {centsToDollars(t.amountCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.balanceCents < 0 && canPayBySlug.get(s.orgSlug) ? (
                    <PayBalanceForm
                      orgSlug={s.orgSlug}
                      memberId={s.memberId}
                      defaultAmount={(Math.abs(s.balanceCents) / 100).toFixed(2)}
                      defaultDescription={`Balance toward ${s.scoutName || "Scout"}`}
                      csrf={<CsrfTokenInput />}
                    />
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
