// /super-admin/errors/[fingerprint] — one kind of error: its stack,
// every recent time it happened (where, which unit, who, which
// release), and the control to mark it fixed.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { isFixed } from "@/lib/owner/errors";
import { Done, Pill, Section, shortDate } from "@/components/owner/ConsoleBits";
import { markErrorFixedAction, reopenErrorAction } from "@/server-actions/super-admin";
import { requireOwnerPage } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

function when(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export default async function OwnerErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ fingerprint: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  await requireOwnerPage();
  const { fingerprint } = await params;
  const { done } = await searchParams;
  if (!/^[0-9a-f]{40}$/.test(fingerprint)) return notFound();
  const [rows, total, resolution] = await Promise.all([
    prisma.errorLog.findMany({
      where: { fingerprint },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        org: { select: { slug: true, displayName: true } },
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.errorLog.count({ where: { fingerprint } }),
    prisma.errorResolution.findUnique({ where: { fingerprint } }),
  ]);
  if (rows.length === 0) return notFound();
  const latest = rows[0];
  const fixed = isFixed(latest.createdAt, resolution?.resolvedAt);
  const units = new Map(rows.filter((r) => r.org).map((r) => [r.org!.slug, r.org!.displayName]));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/super-admin/errors" className="text-sm">
          ← Errors
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">
            {latest.errorName || "Error"}: {latest.message.slice(0, 200)}
          </h2>
          <Pill tone="muted">{latest.service ?? "compass"}</Pill>
          {fixed ? <Pill tone="good">fixed</Pill> : resolution ? <Pill tone="bad">back after fix</Pill> : null}
        </div>
        <p className="text-sm text-ink-muted">
          {total} times · last {when(latest.createdAt)} · first seen {shortDate(rows[rows.length - 1].createdAt)}
          {units.size ? " · " : ""}
          {[...units].map(([slug, name], i) => (
            <span key={slug}>
              {i ? ", " : ""}
              <Link href={`/super-admin/orgs/${slug}`}>{name}</Link>
            </span>
          ))}
        </p>
        <Done message={done} />
      </header>

      <div className="flex gap-2">
        {fixed ? (
          <form action={reopenErrorAction}>
            <CsrfTokenInput />
            <input type="hidden" name="fingerprint" value={fingerprint} />
            <button type="submit" className="btn-secondary text-xs">
              Not fixed after all
            </button>
          </form>
        ) : (
          <form action={markErrorFixedAction} className="flex flex-wrap items-center gap-2">
            <CsrfTokenInput />
            <input type="hidden" name="fingerprint" value={fingerprint} />
            <input name="note" maxLength={200} placeholder="What fixed it (optional)" aria-label="What fixed it" className="field" />
            <button type="submit" className="btn-secondary text-xs">
              Mark fixed
            </button>
          </form>
        )}
        {resolution?.note ? <span className="text-sm text-ink-muted">Fix note: {resolution.note}</span> : null}
      </div>

      {latest.stack ? (
        <Section title="Stack">
          <pre className="overflow-x-auto rounded-lg bg-surface-alt p-4 text-xs">{latest.stack}</pre>
        </Section>
      ) : null}

      <Section title="Recent times">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-line text-left uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="pr-3">Where</th>
                <th className="pr-3">Unit</th>
                <th className="pr-3">Person</th>
                <th>Release</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-soft align-top">
                  <td className="py-1.5 pr-3 font-mono">{when(r.createdAt)}</td>
                  <td className="pr-3 font-mono">
                    {r.method ? `${r.method} ` : ""}
                    {r.path ?? (r.context && typeof r.context === "object" ? JSON.stringify(r.context).slice(0, 120) : "—")}
                  </td>
                  <td className="pr-3">{r.org ? <Link href={`/super-admin/orgs/${r.org.slug}`}>{r.org.displayName}</Link> : "—"}</td>
                  <td className="pr-3">{r.user ? <Link href={`/super-admin/people/${r.user.id}`}>{r.user.email}</Link> : "—"}</td>
                  <td>{r.release ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
