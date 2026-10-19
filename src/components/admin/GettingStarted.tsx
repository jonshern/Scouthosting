// "Get your unit going" card on the admin home. Each step checks the
// unit's real data, so it ticks itself off as the work gets done and
// matches what every leader sees. Gone once every step is done, or when
// someone hides it in their browser (GettingStartedFrame). The longer,
// hand-ticked rollout plan stays at /admin/setup.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { INVITE_ACTION } from "@/lib/members/access";
import { GettingStartedFrame } from "./GettingStartedFrame";

type Step = { id: string; label: string; hint: string; href: string; cta: string; done: boolean };

export async function gettingStartedSteps(org: { id: string; slug: string }): Promise<Step[]> {
  const base = `/o/${org.slug}/admin`;
  const [youth, leaders, families, invites, events, page, posts] = await Promise.all([
    prisma.member.count({ where: { orgId: org.id, deletedAt: null, isYouth: true } }),
    prisma.orgMembership.count({ where: { orgId: org.id, role: { in: ["leader", "admin"] } } }),
    prisma.orgMembership.count({ where: { orgId: org.id, role: "parent" } }),
    prisma.auditLog.count({ where: { orgId: org.id, action: INVITE_ACTION } }),
    prisma.event.count({ where: { orgId: org.id } }),
    prisma.page.count({ where: { orgId: org.id } }),
    prisma.announcement.count({ where: { orgId: org.id } }),
  ]);
  return [
    {
      id: "roster",
      label: "Add your scouts and their families",
      hint: "Paste a spreadsheet or Scoutbook export, or add people one at a time.",
      href: `${base}/members/import`,
      cta: "Import roster",
      done: youth > 0,
    },
    {
      id: "leaders",
      label: "Bring in another leader",
      hint: "Add them to the roster, send an invite, then make them a leader on their page.",
      href: `${base}/members`,
      cta: "Open roster",
      done: leaders > 1,
    },
    {
      id: "calendar",
      label: "Put your next meeting or campout on the calendar",
      hint: "Families RSVP from the calendar, and the reminders go out on their own.",
      href: `${base}/events/new`,
      cta: "New event",
      done: events > 0,
    },
    {
      id: "site",
      label: "Make the public site yours",
      hint: "A headline and a few lines about your unit for families looking for a troop.",
      href: `${base}/site`,
      cta: "Edit site",
      done: page > 0,
    },
    {
      id: "announce",
      label: "Post a first announcement",
      hint: "Say hi. It's the first thing families see when they sign in.",
      href: `${base}/announcements`,
      cta: "Write one",
      done: posts > 0,
    },
    {
      id: "invite",
      label: "Invite your families",
      hint: "Everyone on the roster with an email gets a link to join.",
      href: `${base}/members`,
      cta: "Invite everyone",
      done: families > 0 || invites > 0,
    },
  ];
}

export async function GettingStarted({ org }: { org: { id: string; slug: string } }) {
  const steps = await gettingStartedSteps(org);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const nextId = steps.find((s) => !s.done)?.id;

  return (
    <GettingStartedFrame orgSlug={org.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider py-5 pl-6 pr-20">
        <div>
          <div className="eyebrow mb-1">§ Getting started</div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Get your unit going.</h2>
        </div>
        <span className="text-[13px] text-muted">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li
            key={s.id}
            data-step={s.id}
            data-done={s.done ? "true" : "false"}
            className="grid grid-cols-[28px_1fr] items-start gap-3 border-b border-divider px-6 py-4 last:border-b-0 sm:grid-cols-[28px_1fr_auto]"
          >
            <span
              aria-hidden
              className={
                "mt-0.5 grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold " +
                (s.done ? "bg-done-soft text-done-text" : "bg-sunk text-ink-2")
              }
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <div className={"text-[15px] font-medium " + (s.done ? "text-muted line-through" : "text-ink")}>
                {s.label}
                <span className="sr-only">{s.done ? " (done)" : ""}</span>
              </div>
              {s.done ? null : <div className="mt-0.5 text-[13px] text-muted">{s.hint}</div>}
            </div>
            {s.done ? null : (
              <Link
                href={s.href}
                className={
                  (s.id === nextId ? "btn-primary" : "btn-secondary") +
                  " col-start-2 justify-self-start text-xs no-underline sm:col-start-3"
                }
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <div className="px-6 py-3 text-[13px] text-muted">
        Want the full rollout plan? <Link href={`/o/${org.slug}/admin/setup`}>See the setup guide</Link>.
      </div>
    </GettingStartedFrame>
  );
}
