"use client";

import { useActionState, useState } from "react";
import {
  upsertPatrol,
  deletePatrol,
  type PatrolState,
} from "@/server-actions/patrols";

const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: "Eagle", hex: "#7a1e1e" },
  { name: "Hawk", hex: "#1d3a8a" },
  { name: "Wolf", hex: "#15803d" },
  { name: "Otter", hex: "#0e7490" },
  { name: "Bear", hex: "#92400e" },
];

export function PatrolForm({
  orgSlug,
  initial,
  members,
  csrf,
}: {
  orgSlug: string;
  initial?: {
    id?: string;
    name?: string;
    color?: string;
    leaderMemberId?: string | null;
    description?: string | null;
    archived?: boolean;
  };
  members: { id: string; name: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<PatrolState, FormData>(
    upsertPatrol,
    null,
  );
  const p = initial ?? {};
  const [color, setColor] = useState(p.color ?? "#1d3a8a");
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {p.id ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Patrol name</label>
          <input id="name" name="name" required maxLength={60} defaultValue={p.name ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="leaderMemberId">Patrol leader</label>
          <select id="leaderMemberId" name="leaderMemberId" defaultValue={p.leaderMemberId ?? ""} className="field">
            <option value="">— none —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Color</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              name="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-16 rounded border border-line"
            />
            <span className="font-mono text-xs text-slate-soft">{color}</span>
            <span className="text-slate-muted">·</span>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setColor(preset.hex)}
                className="flex items-center gap-1.5 text-xs text-slate-soft hover:text-ink"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: preset.hex }}
                />
                {preset.name}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="description">Description (optional)</label>
          <textarea id="description" name="description" rows={2} maxLength={500} defaultValue={p.description ?? ""} className="field" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="archived" defaultChecked={!!p.archived} /> Archived
      </label>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : p.id ? "Save patrol" : "Create patrol"}
      </button>
    </form>
  );
}

export function DeletePatrolButton({
  orgSlug,
  id,
  csrf,
}: {
  orgSlug: string;
  id: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<PatrolState, FormData>(
    deletePatrol,
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
    <form action={action} className="flex items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-slate-soft">Confirm?</span>
      <button type="submit" disabled={pending} className="text-xs text-danger underline">
        {pending ? "…" : "Yes, delete"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-slate-muted">
        Cancel
      </button>
      {state && "error" in state ? <p className="text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
