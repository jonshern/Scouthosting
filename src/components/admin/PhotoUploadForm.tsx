"use client";

import { useActionState } from "react";
import { uploadPhotos } from "@/server-actions/photos";

type State = { error?: string; ok?: true; count?: number; errors?: string[] } | null;

export function PhotoUploadForm({
  orgSlug,
  albumId,
  csrf,
}: {
  orgSlug: string;
  albumId: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(uploadPhotos, null);
  return (
    <form action={formAction} className="card space-y-4" encType="multipart/form-data">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="albumId" value={albumId} />
      <div>
        <label className="label" htmlFor="file">Photos</label>
        <input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          required
          className="field"
        />
        <p className="mt-1 text-xs text-ink-muted">JPEG, PNG, WebP, or GIF — up to 10 MB each.</p>
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">{state.error}</div>
      )}
      {state?.ok && (
        <div role="status" className="text-sm text-done-text bg-done-soft border border-done/30 rounded p-3">
          Uploaded {state.count} photo{state.count === 1 ? "" : "s"}.
          {state.errors && state.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-attention-text">
              {state.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Uploading…" : "Upload photos"}
      </button>
    </form>
  );
}
