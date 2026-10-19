import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";
import { renderMarkdownLite } from "@/lib/markdown";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { CommentForm } from "@/components/posts/CommentForm";
import { ReactionButton } from "@/components/posts/ReactionButton";

export default async function PublicPostDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      comments: { where: { hidden: false }, orderBy: { createdAt: "asc" } },
      reactions: true,
    },
  });
  if (!post || post.orgId !== org.id) notFound();

  const { user } = await getSession();
  const isMember = user ? Boolean(await roleInOrg(user.id, org.id)) || user.isSuperAdmin : false;
  if (post.visibility === "members" && !isMember) {
    return (
      <section className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Members only</h1>
        <p className="mt-2 text-ink-muted">
          <Link href={`/login?next=/o/${slug}/posts/${id}`}>Sign in</Link> to view.
        </p>
      </section>
    );
  }

  // Comments are for the unit's members, even on a public post: they tend
  // to name scouts ("great job Jane and Tommy").
  const comments = isMember ? post.comments : [];

  const likes = post.reactions.filter((r) => r.kind === "like").length;
  const bookmarks = post.reactions.filter((r) => r.kind === "bookmark").length;
  const liked = user ? post.reactions.some((r) => r.userId === user.id && r.kind === "like") : false;
  const bookmarked = user ? post.reactions.some((r) => r.userId === user.id && r.kind === "bookmark") : false;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div>
        <Link href={`/o/${slug}/posts`} className="text-sm">← All posts</Link>
        <h1 className="font-display text-4xl font-semibold mt-2">
          {post.title ?? post.body.slice(0, 80)}
        </h1>
        <div className="mt-2 text-sm text-ink-muted">
          {new Date(post.publishedAt).toLocaleDateString()}
          {post.pinned ? " · 📌 Pinned" : ""}
        </div>
      </div>

      <div
        className="prose prose-stone"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: renderMarkdownLite(post.body) }}
      />

      {user ? (
        <div className="flex items-center gap-2">
          <ReactionButton
            orgSlug={slug}
            postId={post.id}
            kind="like"
            initialOn={liked}
            initialCount={likes}
            csrf={<CsrfTokenInput />}
          />
          <ReactionButton
            orgSlug={slug}
            postId={post.id}
            kind="bookmark"
            initialOn={bookmarked}
            initialCount={bookmarks}
            csrf={<CsrfTokenInput />}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          <Link href={`/login?next=/o/${slug}/posts/${id}`}>Sign in</Link> to like, bookmark, or comment.
        </p>
      )}

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">Comments ({comments.length})</h2>
        <ul className="space-y-3 mb-6">
          {comments.map((c) => (
            <li key={c.id} className="card text-sm">
              <div className="text-ink-muted">{new Date(c.createdAt).toLocaleString()}</div>
              <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-ink-muted">{isMember ? "No comments yet." : "Comments are for members of this unit."}</li>
          )}
        </ul>
        {user && isMember ? (
          <CommentForm orgSlug={slug} postId={post.id} csrf={<CsrfTokenInput />} />
        ) : (
          <p className="text-sm text-ink-muted">
            {user ? "Members only — ask a leader to add you." : "Sign in to comment."}
          </p>
        )}
      </div>
    </article>
  );
}
