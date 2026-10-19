// /super-admin/analytics/people/[id] — one adult's page views and
// actions across the products, newest first (lib/usage). Scouts have no
// timeline here.

import Link from "next/link";
import { requireOwnerPage } from "@/lib/owner/guard";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pill, Section } from "@/components/owner/ConsoleBits";
import { actionLabel, VIEW } from "@/lib/usage/events";
import { personTimeline } from "@/lib/usage/report";

export const dynamic = "force-dynamic";

export default async function OwnerPersonUsagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, displayName: true, email: true } });
  if (!user) notFound();
  const rows = await personTimeline(user.id);

  return (
    <Section
      title={`What ${user.displayName} did`}
      action={
        <Link href={`/super-admin/people/${user.id}`} className="text-sm">
          Account
        </Link>
      }
    >
      <p className="text-sm text-ink-muted">
        {user.email} · last {rows.length} page views and actions, newest first.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing recorded for this account.</p>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <time className="w-40 shrink-0 font-mono text-xs text-ink-muted" dateTime={r.createdAt.toISOString()}>
                {r.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
              <Pill tone="muted">{r.product}</Pill>
              {r.name === VIEW ? (
                <span className="font-mono text-xs">{r.path ?? "/"}</span>
              ) : (
                <span className="font-medium">{actionLabel(r.name)}</span>
              )}
              {r.org ? <span className="text-ink-muted">{r.org.displayName}</span> : null}
              {r.platform !== "server" ? (
                <span className="text-xs text-ink-muted">
                  {r.platform}
                  {r.device ? ` · ${r.device}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
