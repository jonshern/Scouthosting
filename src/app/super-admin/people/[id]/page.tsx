// /super-admin/people/[id] — one account: what it uses, how it signs
// in, and the owner's control to turn it off (or back on). Scout names
// on Lantern trails stay encrypted; only counts show here.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { productsFor, PRODUCT_LABEL } from "@/lib/owner/console";
import { Done, Pill, Section, shortDate } from "@/components/owner/ConsoleBits";
import { disableAccountAction, enableAccountAction } from "@/server-actions/super-admin";

export const dynamic = "force-dynamic";

export default async function OwnerPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;
  const { user: me } = await getSession();
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerified: true,
      isSuperAdmin: true,
      totpEnrolledAt: true,
      adultAttestedAt: true,
      disabledAt: true,
      disabledReason: true,
      createdAt: true,
      memberships: {
        select: { role: true, createdAt: true, org: { select: { slug: true, displayName: true } } },
      },
      accounts: { select: { providerId: true } },
      apiTokens: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, lastUsedAt: true, createdAt: true },
      },
      journeyScouts: {
        select: { id: true, createdAt: true, _count: { select: { progress: true, devices: true } } },
      },
      counselorBadges: { select: { badgeSlug: true } },
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      _count: { select: { passkeys: true, mcpTokens: true } },
    },
  });
  if (!user) return notFound();

  const apps = [...new Set(user.apiTokens.map((t) => t.name))];
  const products = productsFor({
    units: user.memberships,
    lanternScouts: user.journeyScouts.length,
    counselorBadges: user.counselorBadges.length,
    apps,
  });
  const lastSeen = [user.sessions[0]?.updatedAt, ...user.apiTokens.map((t) => t.lastUsedAt)]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const [tickets, history] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, subject: true, status: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "User", entityId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const signIns = [
    ...new Set(user.accounts.map((a) => (a.providerId === "credential" ? "password" : a.providerId))),
    ...(user._count.passkeys ? [`${user._count.passkeys} passkey${user._count.passkeys === 1 ? "" : "s"}`] : []),
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/super-admin/people" className="text-sm">
          ← People
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-semibold text-3xl">{user.displayName}</h2>
          {user.disabledAt ? <Pill tone="bad">Turned off</Pill> : null}
          {user.isSuperAdmin ? <Pill tone="info">Owner</Pill> : null}
          {products.map((p) => (
            <Pill key={p} tone="info">
              {PRODUCT_LABEL[p]}
            </Pill>
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          {user.email}
          {user.emailVerified ? " (confirmed)" : " (not confirmed)"} · signed up {shortDate(user.createdAt)} · last seen{" "}
          {shortDate(lastSeen)}
        </p>
        <p className="text-sm text-ink-muted">
          Signs in with {signIns.join(", ") || "nothing yet"} · two-step {user.totpEnrolledAt ? "on" : "off"} · adult
          confirmed {user.adultAttestedAt ? "yes" : "no"}
        </p>
        <Done message={done} />
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Compass units">
          {user.memberships.length === 0 ? (
            <p className="text-sm text-ink-muted">Not in any unit.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.memberships.map((m) => (
                <li key={m.org.slug}>
                  <Link href={`/super-admin/orgs/${m.org.slug}`}>{m.org.displayName}</Link>{" "}
                  <span className="text-ink-muted">
                    {m.role} since {shortDate(m.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Lantern">
          {user.journeyScouts.length === 0 ? (
            <p className="text-sm text-ink-muted">No scouts on a trail.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.journeyScouts.map((s, i) => (
                <li key={s.id}>
                  Scout {i + 1}: {s._count.progress} steps checked, {s._count.devices} paired phone
                  {s._count.devices === 1 ? "" : "s"}, added {shortDate(s.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Waypoint">
          <p className="text-sm">
            {user.counselorBadges.length
              ? `Counselor for ${user.counselorBadges.length} badge${user.counselorBadges.length === 1 ? "" : "s"}: ${user.counselorBadges
                  .map((b) => b.badgeSlug)
                  .join(", ")}`
              : "Not listed as a counselor."}
          </p>
        </Section>

        <Section title="Apps and sites signed in">
          {user.apiTokens.length === 0 && user._count.mcpTokens === 0 ? (
            <p className="text-sm text-ink-muted">Website only.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {user.apiTokens.map((t) => (
                <li key={t.id}>
                  {t.name} <span className="text-ink-muted">· used {shortDate(t.lastUsedAt ?? t.createdAt)}</span>
                </li>
              ))}
              {user._count.mcpTokens ? <li>Claude connector</li> : null}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Support questions">
        {tickets.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tickets.map((t) => (
              <li key={t.id}>
                {t.subject} <span className="text-ink-muted">· {t.status} · {shortDate(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Access">
        <div className="card space-y-2 text-sm">
          {user.disabledAt ? (
            <form action={enableAccountAction} className="space-y-2">
              <CsrfTokenInput />
              <input type="hidden" name="userId" value={user.id} />
              <p className="text-danger">
                Turned off {shortDate(user.disabledAt)}
                {user.disabledReason ? `: ${user.disabledReason}` : ""}
              </p>
              <button type="submit" className="btn-primary text-xs">
                Turn account back on
              </button>
            </form>
          ) : me?.id === user.id ? (
            <p className="text-ink-muted">This is your account.</p>
          ) : (
            <form action={disableAccountAction} className="space-y-2">
              <CsrfTokenInput />
              <input type="hidden" name="userId" value={user.id} />
              <input name="reason" type="text" required maxLength={500} placeholder="Why (only you see this)" aria-label="Why" className="field w-full" />
              <button type="submit" className="btn-secondary text-xs">
                Turn account off
              </button>
              <p className="text-xs text-ink-muted">
                Signs them out everywhere, revokes their app tokens, Claude connector and their scouts&apos; paired
                phones, and refuses new sign-ins. Their data stays.
              </p>
            </form>
          )}
        </div>
      </Section>

      {history.length ? (
        <Section title="History">
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="font-mono text-xs text-ink-muted">{h.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>{" "}
                <span className="font-medium">{h.action}</span> by {h.userDisplay ?? "system"}
                {h.summary ? <span className="text-ink-muted"> · {h.summary}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
