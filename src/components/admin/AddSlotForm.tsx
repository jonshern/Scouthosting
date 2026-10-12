"use client";

import { useActionState } from "react";
import { addEventSlot, type AddSlotState } from "@/server-actions/events";

/** Add one sign-up slot to an event by hand. */
export function AddSlotForm({
  orgSlug,
  eventId,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<AddSlotState, FormData>(addEventSlot, null);

  return (
    <form action={formAction} className="space-y-3" key={state?.ok ? state.title : "form"}>
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label className="label" htmlFor="slot-title">Slot</label>
          <input id="slot-title" name="title" required maxLength={200} placeholder="Drive 2 scouts" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="slot-capacity">Spots</label>
          <input id="slot-capacity" name="capacity" type="number" min={1} max={1000} defaultValue={1} required className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="slot-description">Details (optional)</label>
        <input id="slot-description" name="description" maxLength={1000} className="field" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowWaitlist" defaultChecked />
        Start a waitlist when it fills
      </label>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add slot"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm">Added “{state.title}”.</p>}
    </form>
  );
}
