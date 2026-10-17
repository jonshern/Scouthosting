import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PostForm } from "@/components/admin/PostForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function AdminPostsIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireAdminPage(slug);
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
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Messages"
        title="Posts"
        description="Public-site updates with comments + reactions. Use Announcements for short timely notices."
      />

      <div className="space-y-3">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">
          New post
        </h2>
        <PostForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">Recent</h2>
        {org.posts.length === 0 ? (
          <p className="text-sm text-slate-muted">Nothing published yet.</p>
        ) : (
          <ul className="space-y-3">
            {org.posts.map((p) => (
              <li
                key={p.id}
                className="card flex items-start justify-between gap-4"
              >
                <div>
                  <Link
                    href={`/o/${slug}/admin/posts/${p.id}`}
                    className="font-semibold text-slate-ink hover:text-sky"
                  >
                    {p.title ?? p.body.slice(0, 80)}
                  </Link>
                  <div className="mt-1 text-sm text-slate-soft">
                    {p.pinned ? "📌 Pinned · " : ""}
                    {p.visibility === "members" ? "Members only" : "Public"} ·{" "}
                    {p._count.comments} comments · {p._count.reactions} reactions ·{" "}
                    {new Date(p.publishedAt).toLocaleDateString()}
                  </div>
                </div>
                <Link
                  href={`/o/${slug}/posts/${p.id}`}
                  className="text-sm text-sky hover:text-slate-ink"
                >
                  View public →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
