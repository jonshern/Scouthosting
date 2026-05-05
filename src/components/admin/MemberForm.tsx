"use client";

import { useActionState } from "react";
import { upsertMember, type MemberState } from "@/server-actions/members";

export function MemberForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    isYouth?: boolean;
    patrol?: string | null;
    position?: string | null;
    commPreference?: string;
    status?: string;
  };
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<MemberState, FormData>(upsertMember, null);
  const m = initial ?? {};
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {m.id && <input type="hidden" name="id" value={m.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" required maxLength={80} defaultValue={m.firstName ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" required maxLength={80} defaultValue={m.lastName ?? ""} className="field" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" maxLength={320} defaultValue={m.email ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" maxLength={40} defaultValue={m.phone ?? ""} className="field" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-end gap-2">
          <input id="isYouth" name="isYouth" type="checkbox" defaultChecked={m.isYouth ?? true} />
          <label htmlFor="isYouth">Youth (under 18)</label>
        </div>
        <div>
          <label className="label" htmlFor="patrol">Patrol / den</label>
          <input id="patrol" name="patrol" maxLength={50} defaultValue={m.patrol ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="position">Position</label>
          <input id="position" name="position" maxLength={80} defaultValue={m.position ?? ""} className="field" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="commPreference">Communication preference</label>
          <select id="commPreference" name="commPreference" defaultValue={m.commPreference ?? "email"} className="field">
            <option value="email">Email only</option>
            <option value="sms">SMS only</option>
            <option value="both">Both</option>
            <option value="none">Do not contact</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={m.status ?? "active"} className="field">
            <option value="prospect">Prospect (lead)</option>
            <option value="active">Active</option>
            <option value="alumni">Alumni</option>
          </select>
        </div>
      </div>

      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{state.error}</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : m.id ? "Save changes" : "Add member"}
      </button>
    </form>
  );
}
