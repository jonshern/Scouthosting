"use client";

import { useActionState, useRef, useState } from "react";
import {
  importScoutbookCsv,
  linkScoutbookId,
  type ScoutbookImportState,
} from "@/server-actions/scoutbook";

export function ScoutbookCsvForm({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<ScoutbookImportState, FormData>(
    importScoutbookCsv,
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState<string>("");
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="csv" value={csvText} />
      <div>
        <label className="label">Council Advancement CSV</label>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFilename(f.name);
            const reader = new FileReader();
            reader.onload = () => setCsvText(String(reader.result ?? ""));
            reader.readAsText(f);
          }}
          className="field"
        />
        {filename ? (
          <p className="mt-1 text-xs text-slate-muted">
            {filename} ({csvText.length.toLocaleString()} bytes)
          </p>
        ) : null}
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? (
        <div className="rounded-md border border-success/30 bg-success-soft p-3 text-sm text-slate-soft">
          Applied {state.rowsApplied}/{state.rowsSeen} profiles ·{" "}
          {state.meritBadgesUpserted} merit badges · {state.awardsUpserted} awards.
          {state.unmatched.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer">
                {state.unmatched.length} unmatched
              </summary>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {state.unmatched.map((u) => (
                  <li key={u.scoutbookUserId}>
                    {u.firstName} {u.lastName} (Scoutbook ID {u.scoutbookUserId})
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {state.warnings.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer">{state.warnings.length} warnings</summary>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <button type="submit" disabled={pending || !csvText} className="btn-primary">
        {pending ? "Importing…" : "Import CSV"}
      </button>
    </form>
  );
}

export function LinkScoutbookForm({
  orgSlug,
  memberId,
  csrf,
}: {
  orgSlug: string;
  memberId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<{ ok?: true; error?: string } | null, FormData>(
    linkScoutbookId,
    null,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="memberId" value={memberId} />
      <input
        name="scoutbookUserId"
        required
        maxLength={40}
        placeholder="BSA member ID"
        className="field text-xs"
      />
      <button type="submit" disabled={pending} className="btn-secondary text-xs">
        {pending ? "…" : "Link"}
      </button>
      {state?.error ? <p className="w-full text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
