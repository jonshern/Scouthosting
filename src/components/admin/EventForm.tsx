"use client";

import { useActionState } from "react";
import { upsertEvent, type EventActionState } from "@/server-actions/events";

type EventInitial = {
  id?: string;
  title?: string | null;
  description?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  allDay?: boolean | null;
  location?: string | null;
  locationAddress?: string | null;
  category?: string | null;
  cost?: number | null;
  capacity?: number | null;
  signupRequired?: boolean | null;
  rrule?: string | null;
  recurrenceUntil?: Date | string | null;
  serviceHours?: number | null;
  campingNights?: number | null;
  hikingMiles?: number | null;
};

function toLocalDateTime(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: EventInitial;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<EventActionState, FormData>(upsertEvent, null);
  const e = initial ?? {};
  return (
    <form action={formAction} className="space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {e.id && <input type="hidden" name="id" value={e.id} />}

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} defaultValue={e.title ?? ""} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={4} maxLength={10_000} defaultValue={e.description ?? ""} className="field" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="startsAt">Starts at</label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toLocalDateTime(e.startsAt)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="endsAt">Ends at (optional)</label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={toLocalDateTime(e.endsAt)}
            className="field"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="allDay" name="allDay" type="checkbox" defaultChecked={!!e.allDay} />
        <label htmlFor="allDay">All-day event</label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="location">Location name</label>
          <input id="location" name="location" maxLength={200} defaultValue={e.location ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="locationAddress">Map address</label>
          <input id="locationAddress" name="locationAddress" maxLength={500} defaultValue={e.locationAddress ?? ""} className="field" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="category">Category</label>
          <input id="category" name="category" maxLength={50} defaultValue={e.category ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="cost">Cost ($)</label>
          <input id="cost" name="cost" type="number" min={0} defaultValue={e.cost ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="capacity">Capacity</label>
          <input id="capacity" name="capacity" type="number" min={0} defaultValue={e.capacity ?? ""} className="field" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="signupRequired" name="signupRequired" type="checkbox" defaultChecked={!!e.signupRequired} />
        <label htmlFor="signupRequired">Sign-up required</label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="rrule">Recurrence (RRULE)</label>
          <input
            id="rrule"
            name="rrule"
            maxLength={200}
            placeholder="FREQ=WEEKLY;BYDAY=MO"
            defaultValue={e.rrule ?? ""}
            className="field font-mono text-xs"
          />
          <p className="mt-1 text-xs text-ink-muted">
            RFC 5545 RRULE without the leading <code>RRULE:</code>. Leave blank for one-off events.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="recurrenceUntil">Recurs until</label>
          <input
            id="recurrenceUntil"
            name="recurrenceUntil"
            type="datetime-local"
            defaultValue={toLocalDateTime(e.recurrenceUntil)}
            className="field"
          />
        </div>
      </div>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="label col-span-3">Per-attendee credits</legend>
        <div>
          <label className="label" htmlFor="serviceHours">Service hours</label>
          <input id="serviceHours" name="serviceHours" type="number" step="0.5" min={0} defaultValue={e.serviceHours ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="campingNights">Camping nights</label>
          <input id="campingNights" name="campingNights" type="number" min={0} defaultValue={e.campingNights ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="hikingMiles">Hiking miles</label>
          <input id="hikingMiles" name="hikingMiles" type="number" step="0.1" min={0} defaultValue={e.hikingMiles ?? ""} className="field" />
        </div>
      </fieldset>

      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {state.error}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : e.id ? "Save changes" : "Create event"}
      </button>
    </form>
  );
}
