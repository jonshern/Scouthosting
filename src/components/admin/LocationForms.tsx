"use client";

import { useActionState, useState } from "react";
import {
  upsertLocation,
  deleteLocation,
  type LocationState,
} from "@/server-actions/locations";

const TYPES = ["Meeting", "Camp", "Outdoor", "Service", "Trailhead", "High Adv."];

export function LocationForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: {
    id?: string;
    name?: string;
    type?: string;
    address?: string | null;
    description?: string | null;
    phone?: string | null;
    website?: string | null;
    lat?: string | null;
    lng?: string | null;
    distanceMiles?: number | null;
    imageUrl?: string | null;
    tags?: string[];
    archived?: boolean;
  };
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    upsertLocation,
    null,
  );
  const l = initial ?? {};
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {l.id ? <input type="hidden" name="id" value={l.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Location name</label>
          <input id="name" name="name" required maxLength={120} defaultValue={l.name ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={l.type ?? "Meeting"} className="field">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="address">Address</label>
          <input id="address" name="address" maxLength={500} defaultValue={l.address ?? ""} className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={l.description ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" maxLength={40} defaultValue={l.phone ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="website">Website</label>
          <input id="website" name="website" maxLength={500} defaultValue={l.website ?? ""} placeholder="https://…" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="lat">Latitude</label>
          <input id="lat" name="lat" maxLength={40} defaultValue={l.lat ?? ""} className="field font-mono text-xs" />
        </div>
        <div>
          <label className="label" htmlFor="lng">Longitude</label>
          <input id="lng" name="lng" maxLength={40} defaultValue={l.lng ?? ""} className="field font-mono text-xs" />
        </div>
        <div>
          <label className="label" htmlFor="distanceMiles">Distance from unit (mi)</label>
          <input id="distanceMiles" name="distanceMiles" type="number" step="0.1" min={0} defaultValue={l.distanceMiles ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="imageUrl">Image URL</label>
          <input id="imageUrl" name="imageUrl" maxLength={500} defaultValue={l.imageUrl ?? ""} placeholder="https://…" className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="tags">Tags (comma-separated)</label>
          <input id="tags" name="tags" maxLength={400} defaultValue={(l.tags ?? []).join(", ")} placeholder="weekly, primary, summer" className="field" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="archived" defaultChecked={!!l.archived} /> Archived (hidden from new event picker)
      </label>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : l.id ? "Save location" : "Create location"}
      </button>
    </form>
  );
}

export function DeleteLocationButton({
  orgSlug,
  id,
  csrf,
}: {
  orgSlug: string;
  id: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<LocationState, FormData>(
    deleteLocation,
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
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-slate-muted"
      >
        Cancel
      </button>
      {state && "error" in state ? <p className="text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
