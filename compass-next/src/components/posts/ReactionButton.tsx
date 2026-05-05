"use client";

import { useActionState } from "react";
import { toggleReaction } from "@/server-actions/posts";

type State = { error?: string; ok?: true; on?: boolean } | null;

export function ReactionButton({
  orgSlug,
  postId,
  kind,
  initialOn,
  initialCount,
  csrf,
}: {
  orgSlug: string;
  postId: string;
  kind: "like" | "bookmark";
  initialOn: boolean;
  initialCount: number;
  csrf: React.ReactNode;
}) {
  const [, formAction, pending] = useActionState<State, FormData>(toggleReaction, null);
  // The Server Action calls revalidatePath, so initialOn / initialCount
  // arrive fresh from the server after a successful toggle. Trust them.
  const on = initialOn;
  const count = initialCount;
  const label = kind === "like" ? "Like" : "Bookmark";
  return (
    <form action={formAction} className="inline-flex">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={on}
        className={
          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs " +
          (on ? "bg-forest text-white border-forest" : "border-ink-muted/30 hover:border-forest")
        }
      >
        {label} · {count}
      </button>
    </form>
  );
}
