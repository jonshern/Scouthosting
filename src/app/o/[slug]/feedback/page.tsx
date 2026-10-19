// /o/[slug]/feedback — public roadmap. Members + leaders see the
// open feedback list, vote, and submit new requests. Anonymous
// visitors can read but not vote.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  submitFeedback,
  toggleFeedbackVote,
} from "@/server-actions/feedback";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const { user } = await getSession();

  const requests = await prisma.feedbackRequest.findMany({
    where: { orgId: org.id, status: { notIn: ["shipped", "declined"] } },
    orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      votes: {
        where: user ? { userId: user.id } : { userId: "__none__" },
        select: { id: true },
      },
    },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display font-semibold text-3xl mb-2">Feedback</h1>
      <p className="text-ink-muted text-sm mb-6">
        Suggestions, bug reports, and requests for {org.displayName}. Vote on
        what matters to you; submit something new at the bottom.
      </p>

      {requests.length === 0 ? (
        <p className="text-ink-muted">Nothing here yet — be the first.</p>
      ) : (
        <ul className="space-y-3 mb-8">
          {requests.map((r) => {
            const youVoted =
              user && Array.isArray(r.votes) && r.votes.length > 0;
            return (
              <li key={r.id} className="card flex gap-4">
                <div className="flex flex-col items-center min-w-[60px]">
                  {user ? (
                    <form action={toggleFeedbackVote}>
                      <CsrfTokenInput />
                      <input type="hidden" name="orgSlug" value={slug} />
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className={`text-xs px-2 py-1 rounded ${
                          youVoted ? "bg-accent text-white" : "btn-secondary"
                        }`}
                      >
                        {youVoted ? "✓" : "▲"}
                      </button>
                    </form>
                  ) : null}
                  <div className="text-sm font-medium">{r.voteCount}</div>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{r.title}</h3>
                  <p className="text-sm whitespace-pre-wrap mt-1">{r.body}</p>
                  <p className="text-xs text-ink-muted mt-2">
                    {r.kind} · {r.status} · {r.createdAt.toLocaleDateString()}
                    {r.category ? ` · ${r.category}` : ""}
                  </p>
                  {r.lastUpdate && (
                    <p className="mt-2 p-2 text-xs bg-accent-soft rounded">
                      <strong>Update: </strong>
                      {r.lastUpdate}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {user ? (
        <section className="card">
          <h2 className="font-medium mb-3">Submit feedback</h2>
          <form action={submitFeedback} className="space-y-3">
            <CsrfTokenInput />
            <input type="hidden" name="orgSlug" value={slug} />
            <label className="block">
              <span className="block text-sm">Title</span>
              <input name="title" required maxLength={200} className="input mt-1" />
            </label>
            <label className="block">
              <span className="block text-sm">Description</span>
              <textarea name="body" required rows={4} className="input mt-1" />
            </label>
            <label className="block">
              <span className="block text-sm">Kind</span>
              <select name="kind" defaultValue="feature" className="input mt-1">
                <option value="feature">Feature request</option>
                <option value="bug">Bug</option>
                <option value="help">Help / question</option>
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Submit
            </button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-ink-muted">
          <a href={`/login?next=/o/${slug}/feedback`} className="underline">
            Sign in
          </a>{" "}
          to submit feedback or vote.
        </p>
      )}
    </main>
  );
}

// helper kept colocated; not exported
void redirect;
