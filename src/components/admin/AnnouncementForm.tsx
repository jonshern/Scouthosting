"use client";

import { useActionState } from "react";
import { createAnnouncement } from "@/server-actions/announcements";

type State = { error?: string; ok?: true } | null;

export function AnnouncementForm({ orgSlug, csrf }: { orgSlug: string; csrf: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<State, FormData>(createAnnouncement, null);
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="body">Body</label>
        <textarea id="body" name="body" required maxLength={10_000} rows={6} className="field" />
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div role="status" className="text-sm text-done-text bg-done-soft border border-done/30 rounded p-3">
          Announcement posted.
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Posting…" : "Post announcement"}
      </button>
    </form>
  );
}
