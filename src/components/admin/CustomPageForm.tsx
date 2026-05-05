"use client";

import { useActionState } from "react";
import { upsertCustomPage } from "@/server-actions/pages";

type State = { error?: string; ok?: true } | null;

export function CustomPageForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: {
    id?: string;
    slug?: string;
    title?: string;
    body?: string;
    visibility?: string;
    showInNav?: boolean;
    sortOrder?: number;
  };
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(upsertCustomPage, null);
  const p = initial ?? {};
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {p.id && <input type="hidden" name="id" value={p.id} />}

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} defaultValue={p.title ?? ""} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="slug">URL slug</label>
        <input id="slug" name="slug" required defaultValue={p.slug ?? ""} className="field" />
        <p className="mt-1 text-xs text-ink-muted">Lowercase letters, digits, hyphens. Page lives at <code>/p/&lt;slug&gt;</code>.</p>
      </div>

      <div>
        <label className="label" htmlFor="body">Body</label>
        <textarea
          id="body"
          name="body"
          rows={14}
          maxLength={50_000}
          defaultValue={p.body ?? ""}
          className="field font-mono text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          Plain text with paragraph breaks. URLs are auto-linked. HTML is escaped.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="visibility">Visibility</label>
          <select id="visibility" name="visibility" defaultValue={p.visibility ?? "public"} className="field">
            <option value="public">Public</option>
            <option value="members">Members only</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sortOrder">Sort order</label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={p.sortOrder ?? 0}
            className="field"
          />
        </div>
        <div className="flex items-end gap-2">
          <input
            id="showInNav"
            name="showInNav"
            type="checkbox"
            defaultChecked={p.showInNav ?? true}
          />
          <label htmlFor="showInNav">Show in navigation</label>
        </div>
      </div>

      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{state.error}</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : p.id ? "Save changes" : "Create page"}
      </button>
    </form>
  );
}
