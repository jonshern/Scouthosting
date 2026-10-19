"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessage, type ChatActionState } from "@/server-actions/chat";

type Props = {
  channelId: string;
  csrf: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
};

export function ChatComposer({ channelId, csrf, disabled, disabledReason }: Props) {
  const [state, action, pending] = useActionState<ChatActionState, FormData>(
    async (prev, fd) => sendMessage(prev, fd),
    null,
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  // After a successful send, clear + refresh so the new message
  // appears server-rendered. router.refresh() re-runs the server
  // component; the realtime bus handles sub-second fanout for
  // already-mounted SSE clients.
  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  if (disabled) {
    return (
      <p className="mt-3 text-xs text-attention-text">
        {disabledReason ?? "Posting is paused."}
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-4 flex flex-col gap-2 border-t border-line pt-3"
    >
      {csrf}
      <input type="hidden" name="channelId" value={channelId} />
      <textarea
        name="body"
        rows={3}
        required
        placeholder="Write a message…"
        className="input"
        aria-label="Message body"
      />
      <div className="flex items-center justify-between">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Sending…" : "Send"}
        </button>
        {state && "error" in state && state.error ? (
          <p role="alert" className="text-xs text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
