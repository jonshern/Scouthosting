import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PostForm } from "@/components/admin/PostForm";

export default async function AdminPostEdit({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const post = await prisma.post.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!post || post.orgId !== org.id) notFound();
  return (
    <section className="space-y-8">
      <div>
        <Link href={`/o/${slug}/admin/posts`} className="text-sm">← All posts</Link>
        <h1 className="font-display text-3xl font-semibold mt-1">
          {post.title ?? post.body.slice(0, 80)}
        </h1>
      </div>
      <PostForm
        orgSlug={slug}
        initial={{
          id: post.id,
          title: post.title,
          body: post.body,
          visibility: post.visibility,
          pinned: post.pinned,
        }}
        csrf={<CsrfTokenInput />}
      />
      {post.comments.length > 0 && (
        <div>
          <h2 className="font-display text-xl font-semibold mb-2">Comments</h2>
          <ul className="space-y-3">
            {post.comments.map((c) => (
              <li key={c.id} className="card text-sm">
                <div className="text-ink-muted">{new Date(c.createdAt).toLocaleString()}</div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
