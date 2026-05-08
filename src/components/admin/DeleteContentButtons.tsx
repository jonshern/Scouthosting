"use client";

// Shared confirm-then-submit delete buttons for content surfaces
// (events, posts) whose server actions exist but had no UI button
// surfaced. Same pattern as DeletePatrolButton / DeleteLocationButton:
// first click flips into a "Confirm?" form, second click fires the
// server action. The actions `redirect()` on success — they only
// return a value when validation fails — so the inline error block
// is the only state we surface.

import { useActionState, useState } from "react";
import { deleteEvent } from "@/server-actions/events";
import { deletePost } from "@/server-actions/posts";
import { deleteAnnouncement } from "@/server-actions/announcements";

type State = { error?: string } | null | undefined;
type ActionFn = (
  prev: State,
  fd: FormData,
) => Promise<{ error?: string } | undefined>;

function ConfirmDelete({
  orgSlug,
  id,
  csrf,
  action,
}: {
  orgSlug: string;
  id: string;
  csrf: React.ReactNode;
  action: ActionFn;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    action as never,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-danger hover:text-ink"
      >
        Delete
      </button>
    );
  }
  return (
    <form action={formAction} className="flex items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-slate-soft">Confirm?</span>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-danger underline"
      >
        {pending ? "…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-slate-muted"
      >
        Cancel
      </button>
      {state && "error" in state && state.error ? (
        <p className="text-xs text-danger">{state.error}</p>
      ) : null}
    </form>
  );
}

export function DeleteEventButton({
  orgSlug,
  id,
  csrf,
}: {
  orgSlug: string;
  id: string;
  csrf: React.ReactNode;
}) {
  return (
    <ConfirmDelete orgSlug={orgSlug} id={id} csrf={csrf} action={deleteEvent} />
  );
}

export function DeletePostButton({
  orgSlug,
  id,
  csrf,
}: {
  orgSlug: string;
  id: string;
  csrf: React.ReactNode;
}) {
  return (
    <ConfirmDelete orgSlug={orgSlug} id={id} csrf={csrf} action={deletePost} />
  );
}

export function DeleteAnnouncementButton({
  orgSlug,
  id,
  csrf,
}: {
  orgSlug: string;
  id: string;
  csrf: React.ReactNode;
}) {
  return (
    <ConfirmDelete
      orgSlug={orgSlug}
      id={id}
      csrf={csrf}
      action={deleteAnnouncement}
    />
  );
}
