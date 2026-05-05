"use client";

import { useState } from "react";
import { runRosterImport, type RosterImportState } from "@/server-actions/roster";

type Props = {
  orgSlug: string;
  csrf: React.ReactNode;
};

export function RosterImportForm({ orgSlug, csrf }: Props) {
  const [state, setState] = useState<RosterImportState>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("orgSlug", orgSlug);
      const result = await runRosterImport(state, fd);
      setState(result);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} encType="multipart/form-data" className="space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {state && "committed" in state ? (
        <p className="text-emerald-700">
          Import committed — created {state.created}, updated {state.updated}, unchanged{" "}
          {state.unchanged}.
        </p>
      ) : null}

      <label className="block">
        <span className="block text-sm">Upload CSV / XLSX</span>
        <input type="file" name="file" accept=".csv,.xlsx,.xls,.tsv" className="mt-1" />
      </label>
      <label className="block">
        <span className="block text-sm">…or paste CSV here</span>
        <textarea name="text" rows={10} className="input mt-1" />
      </label>

      {state && "error" in state && (
        <p role="alert" className="text-red-600 text-sm">
          {state.error}
        </p>
      )}

      {state && "preview" in state ? (
        <div className="card">
          <h3 className="font-medium">Preview</h3>
          <ul className="mt-2 text-sm">
            <li>{state.preview.creates} new members</li>
            <li>{state.preview.updates} updates</li>
            <li>{state.preview.unchanged} unchanged</li>
            <li>{state.preview.conflicts.length} conflicts</li>
          </ul>
          {state.preview.conflicts.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm">Conflicts</summary>
              <ul className="mt-1 text-xs">
                {state.preview.conflicts.map((c: { firstName: string; lastName: string; reason: string }, i: number) => (
                  <li key={i}>
                    {c.firstName} {c.lastName}: {c.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          name="mode"
          value="preview"
          disabled={pending}
          className="btn-secondary"
        >
          Preview
        </button>
        <button
          type="submit"
          name="mode"
          value="commit"
          disabled={pending}
          className="btn-primary"
        >
          Commit
        </button>
      </div>
    </form>
  );
}
