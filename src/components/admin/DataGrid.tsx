"use client";

// Shared DataGrid primitive built on TanStack Table v8 (per
// design_handoff_compass_cms's component table). Render any
// row[] + column<TData>[] config and you get sortable headers,
// a global text filter, an empty state, and CSV export of the
// currently-visible rows. The intent is a single source of truth
// for admin tables — ledger, sales orders, audit log, etc.

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

export type DataGridProps<TData extends object> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  /** Optional placeholder for the global filter input. */
  searchPlaceholder?: string;
  /** Filename (without .csv) for the export link. */
  csvName?: string;
  /** Empty-state copy. */
  emptyMessage?: string;
  /**
   * Row click → URL nav. Each grid is read-only here; the parent
   * supplies a function returning the href to push to.
   */
  onRowHref?: (row: TData) => string | null;
  /** Optional class on the wrapping <div>. */
  className?: string;
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const body =
    [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n") +
    "\r\n";
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DataGrid<TData extends object>({
  data,
  columns,
  searchPlaceholder = "Search…",
  csvName,
  emptyMessage = "No rows.",
  onRowHref,
  className,
}: DataGridProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const visibleRows = table.getRowModel().rows;

  function exportCsv() {
    if (!csvName) return;
    const headers = useMemoSafeFlatHeaders(table);
    const rows = visibleRows.map((r) =>
      r.getVisibleCells().map((c) => {
        const v = c.getValue();
        // Coerce JSX → leave blank; primitives → as-is.
        if (typeof v === "object") return "";
        return v;
      }),
    );
    downloadCsv(csvName, headers, rows);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="field max-w-sm"
        />
        <span className="text-xs text-slate-muted">
          {visibleRows.length} of {data.length}
        </span>
        <span className="flex-1" />
        {csvName ? (
          <button type="button" onClick={exportCsv} className="btn-secondary text-xs">
            Download CSV
          </button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sort = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className="px-4 py-2 font-semibold whitespace-nowrap"
                    >
                      {h.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          disabled={!h.column.getCanSort()}
                          className={
                            "inline-flex items-center gap-1 " +
                            (h.column.getCanSort()
                              ? "hover:text-ink"
                              : "cursor-default")
                          }
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sort === "asc" ? "↑" : sort === "desc" ? "↓" : null}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-line">
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="px-4 py-6 text-center text-sm text-slate-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const href = onRowHref?.(row.original);
                return (
                  <tr
                    key={row.id}
                    className={
                      href ? "cursor-pointer hover:bg-surface-alt/60" : ""
                    }
                    onClick={
                      href
                        ? () => {
                            if (typeof window !== "undefined") {
                              window.location.assign(href);
                            }
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Internal helper: flat header text for the CSV export. We avoid
// useMemo here because the headers depend on the table state and
// rebuilding on each export keystroke is fine.
function useMemoSafeFlatHeaders<TData>(table: ReturnType<typeof useReactTable<TData>>) {
  return table
    .getHeaderGroups()[0]!
    .headers.map((h) =>
      typeof h.column.columnDef.header === "string"
        ? (h.column.columnDef.header as string)
        : (h.column.id ?? ""),
    );
}
