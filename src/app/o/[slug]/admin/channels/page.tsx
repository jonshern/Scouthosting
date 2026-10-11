// /o/[slug]/admin/channels — list channels with kind, post-policy,
// and suspend status. Suspend / unsuspend / archive controls live
// per-channel.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unsuspendChannelAction, archiveChannelAction } from "@/server-actions/channels";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

const UNSUSPEND_ERRORS: Record<string, string> = {
  "no-current-adults":
    "Can't turn messages back on: this channel has youth and no YPT-current adult leaders.",
  "only-one-current-adult":
    "Can't turn messages back on: add a second YPT-current adult leader first.",
};

export default async function ChannelsAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/channels`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const channels = await prisma.channel.findMany({
    where: { orgId: org.id },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      kind: true,
      postPolicy: true,
      isSuspended: true,
      suspendedReason: true,
      archivedAt: true,
      _count: { select: { members: true } },
    },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Messages" title="Channels" />
      {error ? (
        <p role="alert" className="card mb-4 text-sm">
          {UNSUSPEND_ERRORS[error] ?? "Can't turn messages back on until two-deep is met."}
        </p>
      ) : null}
      <ul className="space-y-2">
        {channels.map((c) => (
          <li key={c.id} className="card">
            <div className="flex items-baseline justify-between">
              <div>
                <Link href={`/o/${slug}/chat?channel=${c.id}`} className="font-medium">
                  {c.name}
                </Link>
                <span className="ml-2 text-xs text-slate-muted">
                  {c.kind} · {c.postPolicy} · {c._count.members} members
                </span>
              </div>
              <div className="flex gap-2">
                {c.isSuspended && (
                  <form action={unsuspendChannelAction}>
                    <CsrfTokenInput />
                    <input type="hidden" name="orgSlug" value={slug} />
                    <input type="hidden" name="channelId" value={c.id} />
                    <button type="submit" className="btn-secondary text-xs">
                      Unsuspend
                    </button>
                  </form>
                )}
                {!c.archivedAt && (
                  <form action={archiveChannelAction}>
                    <CsrfTokenInput />
                    <input type="hidden" name="orgSlug" value={slug} />
                    <input type="hidden" name="channelId" value={c.id} />
                    <button type="submit" className="btn-secondary text-xs">
                      Archive
                    </button>
                  </form>
                )}
              </div>
            </div>
            {c.isSuspended && (
              <p className="text-xs text-amber-700 mt-2">
                Paused: {c.suspendedReason ?? "two-deep failed"}
              </p>
            )}
            {c.archivedAt && (
              <p className="text-xs text-slate-muted mt-2">
                Archived {c.archivedAt.toLocaleDateString()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
