// /o/[slug]/admin/newsletters/schedule — edit the auto-draft schedule.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { saveNewsletterSchedule } from "@/server-actions/newsletters";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function NewsletterSchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/newsletters/schedule`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }
  const sched = await prisma.newsletterSchedule.findUnique({
    where: { orgId: org.id },
    select: {
      paused: true,
      weekday: true,
      localTime: true,
      timezone: true,
      minStories: true,
    },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Messages" title="Newsletter schedule" />
      <form action={saveNewsletterSchedule} className="space-y-4 max-w-md">
        <CsrfTokenInput />
        <input type="hidden" name="orgSlug" value={slug} />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="paused" defaultChecked={sched?.paused ?? false} />
          <span>Pause auto-draft</span>
        </label>
        <label className="block">
          <span className="block text-sm">Weekday (1=Mon … 7=Sun)</span>
          <input
            name="weekday"
            type="number"
            min={1}
            max={7}
            defaultValue={sched?.weekday ?? 7}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Local time (HH:MM)</span>
          <input
            name="localTime"
            type="text"
            placeholder="07:00"
            defaultValue={sched?.localTime ?? "07:00"}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Timezone (IANA)</span>
          <input
            name="timezone"
            type="text"
            placeholder="America/Chicago"
            defaultValue={sched?.timezone ?? "UTC"}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">
            Minimum stories before drafting (skip a sleepy week)
          </span>
          <input
            name="minStories"
            type="number"
            min={0}
            max={20}
            defaultValue={sched?.minStories ?? 2}
            className="input mt-1"
          />
        </label>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>
    </main>
  );
}
