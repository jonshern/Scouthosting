"use client";

import { useActionState } from "react";
import { addComment } from "@/server-actions/posts";

type State = { error?: string; ok?: true } | null;

export function CommentForm({
  orgSlug,
  postId,
  csrf,
}: {
  orgSlug: string;
  postId: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(addComment, null);
  return (
    <form action={formAction} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="postId" value={postId} />
      <div>
        <label className="label" htmlFor="body">Comment</label>
        <textarea id="body" name="body" required rows={3} maxLength={5000} className="field" />
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{state.error}</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Posting…" : "Post comment"}
      </button>
    </form>
  );
}
