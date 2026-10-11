"use client";

import { useActionState } from "react";
import { importEventSlots, type ImportSlotsState } from "@/server-actions/events";

/** Paste a Waypoint event file to create this event's station and volunteer slots. */
export function ImportSlotsForm({
  orgSlug,
  eventId,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ImportSlotsState, FormData>(importEventSlots, null);
  return (
    <form action={formAction} className="space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <label className="label" htmlFor="slot-file">Waypoint event file</label>
      <textarea
        id="slot-file"
        name="file"
        required
        rows={6}
        placeholder='{ "stations": [ { "id": "fa-am", "badge": "First Aid", "capacity": 12 } ], "volunteerRoles": [ … ] }'
        className="field font-mono text-xs"
      />
      <p className="text-xs text-ink-muted">
        Paste the event&apos;s JSON file. Each station becomes a slot keyed <code>station:&lt;id&gt;</code> and
        each volunteer role one keyed <code>role:&lt;id&gt;</code>. Importing again updates names and
        capacities; nothing is deleted.
      </p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Importing…" : "Import stations and roles"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm">
          Imported: {state.created} new, {state.updated} updated.
        </p>
      )}
    </form>
  );
}
