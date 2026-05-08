// Per-event emergency contact list. Surfaces the data that already
// lives on Member (encrypted name + phone, plaintext email) joined to
// each yes-RSVP's parent/guardian links via Member.parentIds.
//
// Designed to be opened on a phone and printed as a leader's pocket
// list. The CSV export under .../csv is a sibling route handler.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { emergencyContactsForEvent } from "@/lib/events/emergency-contacts";
import { Pill, PrintButton } from "@/components/ui";

function fmtPhone(p: string | null): string {
  return p && p.trim() ? p : "—";
}

export default async function EventEmergencyContactsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({
    where: { id, orgId: org.id },
    select: { id: true, title: true, startsAt: true, location: true },
  });
  if (!event) notFound();

  const contacts = await emergencyContactsForEvent(org, event.id);

  return (
    <section className="space-y-8 print:space-y-4">
      <AdminPageHeader
        kicker="Calendar · Event"
        title={`Emergency contacts — ${event.title}`}
        description={
          <>
            {event.startsAt.toLocaleString()}
            {event.location ? ` · ${event.location}` : ""} · {contacts.length} attendee
            {contacts.length === 1 ? "" : "s"}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link href={`/o/${slug}/admin/events/${event.id}`} className="btn-secondary">
              ← Back to event
            </Link>
            <Link
              href={`/o/${slug}/admin/events/${event.id}/emergency-contacts/csv`}
              className="btn-secondary"
            >
              Download CSV
            </Link>
            <PrintButton>Print</PrintButton>
          </div>
        }
      />

      {/* Print trigger that doesn't need React state. */}
      <noscript>
        <p className="text-xs text-slate-muted print:hidden">
          To print, use your browser&rsquo;s print menu (⌘P / Ctrl+P).
        </p>
      </noscript>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-muted">
          No yes-RSVPs are linked to roster members yet. Once attendees
          RSVP and are matched to the directory, their emergency
          contacts will appear here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Attendee</th>
                <th className="px-4 py-2 font-semibold">Direct</th>
                <th className="px-4 py-2 font-semibold">Emergency contact(s)</th>
                <th className="px-4 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contacts.map((c) => (
                <tr key={c.memberId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">
                      {c.scoutFirstName} {c.scoutLastName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-muted">
                      <Pill tone={c.isYouth ? "accent" : "neutral"}>
                        {c.isYouth ? "Youth" : "Adult"}
                      </Pill>
                      {c.patrol ? <span>{c.patrol}</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-soft">
                    <div>{fmtPhone(c.scoutPhone)}</div>
                    {c.scoutEmail ? (
                      <div className="text-xs text-slate-muted">{c.scoutEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {c.guardians.length === 0 ? (
                      <span className="text-xs text-slate-muted">
                        {c.isYouth
                          ? "No parents linked — fix on member detail"
                          : "Self-contact (adult)"}
                      </span>
                    ) : (
                      <ul className="space-y-1.5">
                        {c.guardians.map((g) => (
                          <li key={g.memberId}>
                            <div className="font-medium text-ink">{g.name}</div>
                            <div className="text-xs text-slate-soft">
                              {fmtPhone(g.phone)}
                              {g.email ? ` · ${g.email}` : ""}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-soft">
                    {c.notes ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-muted print:hidden">
        Source data: Member.parentIds + encrypted phone/name fields.
        Edits go through the member detail page.
      </p>
    </section>
  );
}
