"use client";

import { useActionState, useRef, useState } from "react";
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
  const [fileName, setFileName] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    if (textRef.current) textRef.current.value = await f.text();
  }

  return (
    <form action={formAction} className="space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="fileName" value={fileName} />
      <label className="label" htmlFor="slot-file-pick">Waypoint event file</label>
      <input id="slot-file-pick" type="file" accept=".json,application/json" onChange={pickFile} className="text-sm" />
      <textarea
        id="slot-file"
        ref={textRef}
        aria-label="Event file contents"
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
      <p className="text-xs text-ink-muted">
        The public sign-up slug must match the file&apos;s name without <code>.json</code> (for example{" "}
        <code>2026-11-14-scout-tech-fair</code>), because that is what Waypoint sends. If the event has no slug
        yet, importing sets it for you.
      </p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Importing…" : "Import stations and roles"}
      </button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm">
          Imported: {state.created} new, {state.updated} updated.
          {state.publicSlug && (
            <>
              {" "}Public slug: <code>{state.publicSlug}</code>.
            </>
          )}
          {state.signupsOpened && <> Sign-up required is now on, so families can sign up.</>}
        </p>
      )}
      {state?.slugWarning && <p className="text-sm text-attention-text">{state.slugWarning}</p>}
    </form>
  );
}
