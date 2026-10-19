// Per-event permission slip status. Shows who's signed, who still
// owes one, and surfaces the "Send slips" action that emails parents.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { eventSlipStatus } from "@/lib/permission-slips/status";
import { effectiveSlipText } from "@/lib/permission-slips";
import { SendSlipsButton } from "@/components/admin/SendSlipsButton";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { Pill, Stat, StatRow } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function EventSlipsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({
    where: { id, orgId: org.id },
    select: {
      id: true,
      title: true,
      startsAt: true,
      requiresPermissionSlip: true,
      permissionSlipText: true,
    },
  });
  if (!event) notFound();

  const status = await eventSlipStatus(org, event.id);
  const signed = status.filter((s) => s.signed).length;
  const needed = status.length;
  const slipText = effectiveSlipText(event.permissionSlipText);

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Calendar · Event"
        title={`Permission slips — ${event.title}`}
        description={
          event.requiresPermissionSlip
            ? `${signed} of ${needed} signed`
            : "Slip not required for this event — toggle on the event edit page."
        }
        actions={
          <Link href={`/o/${slug}/admin/events/${event.id}`} className="btn-secondary">
            ← Back to event
          </Link>
        }
      />

      <StatRow>
        <Stat label="Yes RSVPs" value={needed} sub="Youth attendees expected" />
        <Stat
          label="Signed"
          value={signed}
          tone={signed === needed && needed > 0 ? "success" : "default"}
        />
        <Stat
          label="Outstanding"
          value={Math.max(0, needed - signed)}
          tone={needed - signed > 0 ? "danger" : "success"}
        />
        <Stat
          label="Required?"
          value={event.requiresPermissionSlip ? "Yes" : "No"}
          tone={event.requiresPermissionSlip ? "accent" : "default"}
        />
      </StatRow>

      {event.requiresPermissionSlip ? (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="font-display font-semibold text-lg text-ink">Send slips</h2>
          <p className="mt-1 text-sm text-slate-soft">
            Emails every linked parent of every yes-RSVP youth. Re-running
            is safe — each link upserts on (event, scout). Sends through
            the configured mail driver ({process.env.MAIL_DRIVER ?? "console"}).
          </p>
          <div className="mt-4">
            <SendSlipsButton orgSlug={slug} eventId={event.id} csrf={<CsrfTokenInput />} />
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-slate-soft">Preview consent text</summary>
            <p className="mt-2 whitespace-pre-line text-slate-soft">{slipText}</p>
          </details>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Scout</th>
              <th className="px-4 py-2 font-semibold">Patrol</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Signed by</th>
              <th className="px-4 py-2 font-semibold">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {status.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-muted">
                  No yes-RSVP youths yet.
                </td>
              </tr>
            ) : (
              status.map((s) => (
                <tr key={s.memberId}>
                  <td className="px-4 py-3 font-medium text-ink">{s.scoutName}</td>
                  <td className="px-4 py-3 text-slate-soft">{s.patrol ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.signed ? (
                      <Pill tone="success">Signed</Pill>
                    ) : (
                      <Pill tone="danger">Outstanding</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-soft">{s.signedByName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-soft">
                    {s.signedAt ? s.signedAt.toLocaleString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
