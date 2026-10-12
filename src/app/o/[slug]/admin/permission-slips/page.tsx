// Org-wide permission-slip status. Two views:
//   needed-by-event:  every upcoming event that requires a slip, with
//                     signed/needed counts + jump link.
//   needed-by-scout:  every scout who still owes at least one signature
//                     in the next 60 days, with the list of events.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  upcomingEventsNeedingSlips,
  scoutsWithOutstandingSlips,
} from "@/lib/permission-slips/status";
import { Pill } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function OrgPermissionSlipsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [byEvent, byScout] = await Promise.all([
    upcomingEventsNeedingSlips(org),
    scoutsWithOutstandingSlips(org),
  ]);

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Reports"
        title="Permission slips"
        description="Status across the next 60 days of events that require a slip. Click any event to send reminders or view per-scout detail."
      />

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink">By event</h2>
        <p className="mt-1 text-sm text-slate-muted">
          {byEvent.length === 0
            ? "No upcoming events require a slip."
            : `${byEvent.length} event${byEvent.length === 1 ? "" : "s"} in the next 60 days.`}
        </p>
        {byEvent.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">Signed</th>
                  <th className="px-4 py-2 font-semibold">Needed</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byEvent.map((e) => {
                  const outstanding = Math.max(0, e.needed - e.signed);
                  return (
                    <tr key={e.eventId}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/o/${slug}/admin/events/${e.eventId}/permission-slips`}
                          className="font-medium text-ink hover:text-sky"
                        >
                          {e.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-soft">
                        {e.startsAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-soft">{e.signed}</td>
                      <td className="px-4 py-3 text-slate-soft">{e.needed}</td>
                      <td className="px-4 py-3">
                        {outstanding === 0 ? (
                          <Pill tone="success">All in</Pill>
                        ) : (
                          <Pill tone="danger">{outstanding} outstanding</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink">By scout</h2>
        <p className="mt-1 text-sm text-slate-muted">
          {byScout.length === 0
            ? "Every yes-RSVP youth has a signed slip on file."
            : `${byScout.length} scout${byScout.length === 1 ? "" : "s"} still owe a signature.`}
        </p>
        {byScout.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Scout</th>
                  <th className="px-4 py-2 font-semibold">Patrol</th>
                  <th className="px-4 py-2 font-semibold">Outstanding events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byScout.map((row) => (
                  <tr key={row.memberId} className="align-top">
                    <td className="px-4 py-3 font-medium text-ink">{row.scoutName}</td>
                    <td className="px-4 py-3 text-slate-soft">{row.patrol ?? "—"}</td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1 text-sm">
                        {row.outstanding.map((e) => (
                          <li key={e.eventId}>
                            <Link
                              href={`/o/${slug}/admin/events/${e.eventId}/permission-slips`}
                              className="text-slate-soft hover:text-sky"
                            >
                              {e.title}{" "}
                              <span className="text-xs text-slate-muted">
                                · {e.startsAt.toLocaleDateString()}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
