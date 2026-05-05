import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PostForm } from "@/components/admin/PostForm";

export default async function AdminPostsIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      posts: {
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        take: 20,
        include: { _count: { select: { comments: true, reactions: true } } },
      },
    },
  });
  if (!org) notFound();

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Posts</h1>
        <p className="mt-2 text-ink-muted">
          Public-site updates. Use Announcements for short timely notices,
          Posts for longer content with comments + reactions.
        </p>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">New post</h2>
        <PostForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">Recent</h2>
        {org.posts.length === 0 && <p className="text-ink-muted">Nothing published yet.</p>}
        <ul className="space-y-3">
          {org.posts.map((p) => (
            <li key={p.id} className="card flex items-start justify-between gap-4">
              <div>
                <Link href={`/o/${slug}/admin/posts/${p.id}`} className="font-medium">
                  {p.title ?? p.body.slice(0, 80)}
                </Link>
                <div className="mt-1 text-sm text-ink-muted">
                  {p.pinned ? "📌 Pinned · " : ""}
                  {p.visibility === "members" ? "Members only" : "Public"} ·{" "}
                  {p._count.comments} comments · {p._count.reactions} reactions ·{" "}
                  {new Date(p.publishedAt).toLocaleDateString()}
                </div>
              </div>
              <Link href={`/o/${slug}/posts/${p.id}`} className="text-sm">View public →</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
