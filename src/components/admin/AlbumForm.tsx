"use client";

import { useActionState } from "react";
import { upsertAlbum } from "@/server-actions/photos";

type State = { error?: string; ok?: true } | null;

export function AlbumForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: { id?: string; title?: string; slug?: string; description?: string | null; visibility?: string };
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(upsertAlbum, null);
  const a = initial ?? {};
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {a.id && <input type="hidden" name="id" value={a.id} />}
      <div>
        <label className="label" htmlFor="title">Album title</label>
        <input id="title" name="title" required maxLength={200} defaultValue={a.title ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="slug">URL slug</label>
        <input id="slug" name="slug" required defaultValue={a.slug ?? ""} className="field" />
        <p className="mt-1 text-xs text-ink-muted">Lowercase letters, digits, hyphens. Stable URL.</p>
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={a.description ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="visibility">Visibility</label>
        <select id="visibility" name="visibility" defaultValue={a.visibility ?? "public"} className="field">
          <option value="public">Public</option>
          <option value="members">Members only</option>
        </select>
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">{state.error}</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : a.id ? "Save album" : "Create album"}
      </button>
    </form>
  );
}
