import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { roleInOrg } from "@/lib/auth/role";

export default async function PublicPosts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const { user } = await getSession();
  const isMember = user ? Boolean(await roleInOrg(user.id, org.id)) || user.isSuperAdmin : false;

  const posts = await prisma.post.findMany({
    where: {
      orgId: org.id,
      ...(isMember ? {} : { visibility: "public" }),
    },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 20,
    include: { _count: { select: { comments: true, reactions: true } } },
  });

  return (
    <section className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl font-semibold">Posts</h1>
      {posts.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nothing published yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {posts.map((p) => (
            <li key={p.id} className="card">
              <Link href={`/o/${slug}/posts/${p.id}`} className="font-display text-xl font-semibold">
                {p.title ?? p.body.slice(0, 80)}
              </Link>
              <div className="mt-1 text-xs text-ink-muted">
                {p.pinned ? "📌 Pinned · " : ""}
                {new Date(p.publishedAt).toLocaleDateString()} ·{" "}
                {p._count.comments} comments · {p._count.reactions} reactions
              </div>
              <p className="mt-3 line-clamp-3 text-sm">{p.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
