// /o/[slug]/admin/dm — DM thread list. Leaders use this to start
// or follow up on a 1:1 conversation with a member.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Direct messages" };

export default async function DmAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/dm`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const threads = await prisma.channel.findMany({
    where: {
      orgId: org.id,
      kind: "dm",
      members: { some: { userId: user.id } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      members: {
        where: { userId: { not: user.id } },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  return (
    <section>
      <AdminPageHeader kicker="Messages" title="Direct messages" />
      {threads.length === 0 ? (
        <p className="text-slate-soft">
          No DM threads yet. Start one from a member's profile.
        </p>
      ) : (
        <ul className="space-y-2">
          {threads.map((t) => {
            const other = t.members[0]?.user;
            return (
              <li key={t.id} className="card">
                <Link href={`/o/${slug}/chat?channel=${t.id}`} className="font-medium">
                  {other?.displayName ?? "Unknown"}
                </Link>
                <div className="text-xs text-slate-muted">
                  {other?.email}
                  {" · "}
                  {t._count.messages} messages
                  {" · "}
                  {t.updatedAt.toLocaleDateString()}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
