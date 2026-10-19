"use client";

// Invite and access-level forms for the roster (server-actions/unit-access.ts).

import { useActionState } from "react";
import {
  inviteEveryone,
  inviteMember,
  setMemberAccess,
  type InviteState,
} from "@/server-actions/unit-access";

function Result({ state }: { state: InviteState }) {
  if (!state) return null;
  if (state.error) return <span role="alert" className="text-xs text-danger">{state.error}</span>;
  return <span role="status" className="text-xs text-done-text">{state.ok}</span>;
}

export function InviteMemberButton({
  orgSlug,
  memberId,
  csrf,
  label = "Send invite",
}: {
  orgSlug: string;
  memberId: string;
  csrf: React.ReactNode;
  label?: string;
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="memberId" value={memberId} />
      <button type="submit" disabled={pending} className="btn-primary text-xs">
        {pending ? "Sending…" : label}
      </button>
      <Result state={state} />
    </form>
  );
}

export function InviteEveryoneButton({
  orgSlug,
  csrf,
  className = "btn-primary",
}: {
  orgSlug: string;
  csrf: React.ReactNode;
  className?: string;
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteEveryone, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <button type="submit" disabled={pending} className={className}>
        {pending ? "Sending…" : "Invite everyone"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function AccessLevelForm({
  orgSlug,
  memberId,
  current,
  options,
  csrf,
}: {
  orgSlug: string;
  memberId: string;
  current: string;
  options: { value: string; label: string; hint: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(setMemberAccess, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="memberId" value={memberId} />
      <label className="sr-only" htmlFor={`access-${memberId}`}>
        Access level
      </label>
      <select id={`access-${memberId}`} name="role" defaultValue={current} className="input text-sm w-auto">
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.hint}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn-secondary text-xs">
        {pending ? "Saving…" : "Save"}
      </button>
      <Result state={state} />
    </form>
  );
}
