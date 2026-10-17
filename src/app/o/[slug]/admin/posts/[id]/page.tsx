import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PostForm } from "@/components/admin/PostForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DeletePostButton } from "@/components/admin/DeleteContentButtons";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function AdminPostEdit({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const post = await prisma.post.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!post || post.orgId !== org.id) notFound();
  return (
    <section className="space-y-10">
      <div>
        <Link href={`/o/${slug}/admin/posts`} className="text-sm">← All posts</Link>
        <div className="mt-1">
          <AdminPageHeader
            kicker="Messages"
            title={post.title ?? post.body.slice(0, 80)}
          />
        </div>
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
      <div className="border-t border-line pt-6">
        <DeletePostButton orgSlug={slug} id={post.id} csrf={<CsrfTokenInput />} />
      </div>
      {post.comments.length > 0 && (
        <div>
          <h2 className="font-display text-2xl font-normal tracking-[-0.015em] mb-2">Comments</h2>
          <ul className="space-y-3">
            {post.comments.map((c) => (
              <li key={c.id} className="card text-sm">
                <div className="text-slate-muted">{new Date(c.createdAt).toLocaleString()}</div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
