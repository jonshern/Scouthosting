"use client";

import { useActionState, useRef, useState } from "react";
import {
  uploadBankCsv,
  matchBankRow,
  type BankImportState,
} from "@/server-actions/bank-import";

export function BankUploadForm({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<BankImportState, FormData>(
    uploadBankCsv,
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");

  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="filename" value={filename} />
      <input type="hidden" name="csv" value={csvText} />
      <div>
        <label className="label">Bank CSV file</label>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFilename(file.name);
            const reader = new FileReader();
            reader.onload = () => setCsvText(String(reader.result ?? ""));
            reader.readAsText(file);
          }}
          className="field"
        />
        {filename ? (
          <p className="mt-1 text-xs text-slate-muted">
            {filename} ({csvText.length.toLocaleString()} bytes)
          </p>
        ) : null}
      </div>
      <div>
        <label className="label" htmlFor="format">Format</label>
        <select id="format" name="format" defaultValue="csv-generic" className="field">
          <option value="csv-generic">Generic CSV</option>
          <option value="csv-chase">Chase</option>
          <option value="csv-bofa">Bank of America</option>
          <option value="csv-usaa">USAA</option>
        </select>
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? (
        <p className="text-sm text-success">
          Uploaded {state.rowCount} rows.
          {state.warnings.length > 0 ? ` ${state.warnings.length} warning(s).` : ""}
        </p>
      ) : null}
      <button type="submit" disabled={pending || !csvText} className="btn-primary">
        {pending ? "Uploading…" : "Upload CSV"}
      </button>
    </form>
  );
}

export function MatchRowForm({
  orgSlug,
  rowId,
  candidates,
  csrf,
}: {
  orgSlug: string;
  rowId: string;
  candidates: { id: string; label: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<{ ok?: true; error?: string } | null, FormData>(
    matchBankRow,
    null,
  );
  if (candidates.length === 0) return <span className="text-xs text-slate-muted">No candidate transactions.</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="rowId" value={rowId} />
      <select name="txnId" required className="field text-xs" defaultValue="">
        <option value="" disabled>Pick a transaction…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn-secondary text-xs">
        {pending ? "…" : "Match"}
      </button>
      {state?.error ? <p className="w-full text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
