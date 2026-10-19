"use client";

import { useActionState } from "react";
import { upsertPost, type PostState } from "@/server-actions/posts";

export function PostForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: { id?: string; title?: string | null; body?: string; visibility?: string; pinned?: boolean };
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<PostState, FormData>(upsertPost, null);
  const p = initial ?? {};
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {p.id && <input type="hidden" name="id" value={p.id} />}

      <div>
        <label className="label" htmlFor="title">Title (optional)</label>
        <input id="title" name="title" maxLength={200} defaultValue={p.title ?? ""} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="body">Body</label>
        <textarea
          id="body"
          name="body"
          required
          rows={10}
          maxLength={50_000}
          defaultValue={p.body ?? ""}
          className="field font-mono text-sm"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="visibility">Visibility</label>
          <select id="visibility" name="visibility" defaultValue={p.visibility ?? "public"} className="field">
            <option value="public">Public</option>
            <option value="members">Members only</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input id="pinned" name="pinned" type="checkbox" defaultChecked={p.pinned ?? false} />
          <label htmlFor="pinned">Pin to top of /posts</label>
        </div>
      </div>

      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">{state.error}</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : p.id ? "Save changes" : "Publish post"}
      </button>
    </form>
  );
}
