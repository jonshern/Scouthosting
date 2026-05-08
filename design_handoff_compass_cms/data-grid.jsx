// Headless data grid styled with our CSS. Mimics TanStack Table API surface but
// hand-rolled to keep the prototype self-contained. Sortable, multi-filterable,
// searchable, paginated, multi-select.

const DataGrid = ({
  columns,        // [{ id, label, accessor, render?, sortable?, filter? }]
  data,           // array of rows
  search,         // (row, q) => boolean — controls "global search"
  onRowClick,
  bulkActions,    // [{ label, icon, onClick(rows) }]
  pageSize = 12,
  emptyLabel = "No matches",
  initialSort,    // { id, dir: 'asc'|'desc' }
}) => {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState(initialSort || null);
  const [filters, setFilters] = React.useState({});
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState({});

  // filter
  let rows = data.filter(r => {
    if (q && search) { if (!search(r, q.toLowerCase())) return false; }
    for (const cid of Object.keys(filters)) {
      const val = filters[cid];
      if (val === "all" || val == null || val === "") continue;
      const col = columns.find(c => c.id === cid);
      const cell = col.accessor ? col.accessor(r) : r[cid];
      if (Array.isArray(cell)) {
        if (!cell.includes(val)) return false;
      } else if (String(cell) !== String(val)) return false;
    }
    return true;
  });

  // sort
  if (sort) {
    const col = columns.find(c => c.id === sort.id);
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col.accessor ? col.accessor(a) : a[sort.id];
        const bv = col.accessor ? col.accessor(b) : b[sort.id];
        const cmp = (av ?? "") > (bv ?? "") ? 1 : (av ?? "") < (bv ?? "") ? -1 : 0;
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const selectedRows = data.filter(r => selected[r.id]);

  const toggleSort = id => {
    setSort(s => {
      if (!s || s.id !== id) return { id, dir: "asc" };
      if (s.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  };
  const toggleSelect = id => setSelected(s => ({ ...s, [id]: !s[id] }));
  const toggleSelectPage = () => {
    const allSelected = pageRows.every(r => selected[r.id]);
    const next = { ...selected };
    pageRows.forEach(r => { next[r.id] = !allSelected; });
    setSelected(next);
  };

  return (
    <div className="dg">
      {/* Toolbar */}
      <div className="dg-toolbar">
        <div className="dg-search">
          <Icon name="search" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Search…" />
          {q && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setQ("")}><Icon name="x" /></button>}
        </div>
        {columns.filter(c => c.filter).map(c => (
          <select key={c.id} className="select" style={{ width: "auto" }}
            value={filters[c.id] || "all"}
            onChange={e => { setFilters({ ...filters, [c.id]: e.target.value }); setPage(0); }}>
            <option value="all">{c.label}: all</option>
            {c.filter.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ))}
        <span className="spacer"></span>
        <span className="dg-count">{rows.length} of {data.length}</span>
      </div>

      {/* Bulk action bar */}
      {selectedRows.length > 0 && (
        <div className="dg-bulkbar">
          <span><strong>{selectedRows.length}</strong> selected</span>
          {(bulkActions || []).map((a, i) => (
            <button key={i} className="btn btn-sm" onClick={() => a.onClick(selectedRows)}>
              {a.icon && <Icon name={a.icon} />} {a.label}
            </button>
          ))}
          <span className="spacer"></span>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected({})}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="dg-table-wrap">
        <table className="dg-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every(r => selected[r.id])}
                  onChange={toggleSelectPage} />
              </th>
              {columns.map(c => (
                <th key={c.id}
                  onClick={() => c.sortable && toggleSort(c.id)}
                  style={{ width: c.width, cursor: c.sortable ? "pointer" : "default" }}>
                  <span>{c.label}</span>
                  {c.sortable && (
                    <span className={"dg-sort" + (sort?.id === c.id ? " on" : "")}>
                      <Icon name={sort?.id === c.id && sort.dir === "desc" ? "down" : "up"} size={10} />
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => (
              <tr key={r.id}
                  className={selected[r.id] ? "selected" : ""}
                  onClick={() => onRowClick && onRowClick(r)}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)} />
                </td>
                {columns.map(c => (
                  <td key={c.id}>
                    {c.render ? c.render(r) : (c.accessor ? c.accessor(r) : r[c.id])}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length + 1}>
                <div className="empty" style={{ padding: 28 }}>
                  <Icon name="search" /><div style={{ marginTop: 6, fontSize: 13 }}>{emptyLabel}</div>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="dg-pager">
          <button className="btn btn-sm btn-ghost" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
            <Icon name="left" /> Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Page {page + 1} of {totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
            Next <Icon name="right" />
          </button>
        </div>
      )}
    </div>
  );
};

window.DataGrid = DataGrid;
