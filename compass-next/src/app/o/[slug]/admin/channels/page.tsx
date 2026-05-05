// /o/[slug]/admin/channels — list channels with kind, post-policy,
// and suspend status. Suspend / unsuspend / archive controls live
// per-channel.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unsuspendChannelAction, archiveChannelAction } from "@/server-actions/channels";

export default async function ChannelsAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
      <h1 className="font-display text-3xl mb-6">Channels</h1>
      <ul className="space-y-2">
        {channels.map((c) => (
          <li key={c.id} className="card">
            <div className="flex items-baseline justify-between">
              <div>
                <Link href={`/o/${slug}/chat?channel=${c.id}`} className="font-medium">
                  {c.name}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
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
              <p className="text-xs text-ink-muted mt-2">
                Archived {c.archivedAt.toLocaleDateString()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
