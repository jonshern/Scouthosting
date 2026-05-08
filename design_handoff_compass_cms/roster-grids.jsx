// Roster grids + drawers + modals

const ScoutsGrid = ({ onOpen }) => {
  const cols = [
    {
      id: "name", label: "Name", sortable: true, accessor: r => `${r.last} ${r.first}`,
      render: r => <NameCell m={r} sub={`${r.age}y · joined ${r.joined}`} />,
    },
    {
      id: "rank", label: "Rank", sortable: true, accessor: r => r.rank,
      filter: Object.keys(RANK_LABEL).map(k => ({ value: k, label: RANK_LABEL[k] })),
      render: r => <span className={"rank-pill " + r.rank}>{RANK_LABEL[r.rank]}</span>,
    },
    {
      id: "rankPct", label: "Toward next", sortable: true,
      render: r => r.rank === "eagle" ? <span style={{ color: "var(--muted)", fontSize: 11.5 }}>—</span> :
        <div className="row" style={{ gap: 6 }}>
          <div className="progress-track"><div className="fill" style={{ width: `${r.rankPct}%` }}></div></div>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{r.rankPct}%</span>
        </div>,
    },
    {
      id: "patrol", label: "Patrol", sortable: true,
      filter: PATROLS.map(p => ({ value: p.name.replace(" Patrol", ""), label: p.name })),
      render: r => {
        const p = PATROLS.find(x => x.name.startsWith(r.patrol));
        return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p?.color || "#999" }}></span>
          {r.patrol}
        </span>;
      }
    },
    { id: "pos", label: "Position", render: r => <span style={{ fontSize: 12, color: r.pos === "—" ? "var(--muted-2)" : "var(--ink-2)" }}>{r.pos}</span> },
    { id: "mb", label: "MBs", sortable: true, render: r => <span className="mono" style={{ fontSize: 12 }}>{r.mb}</span> },
    { id: "lastSeen", label: "Last seen", render: r => <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.lastSeen}</span> },
  ];

  return (
    <DataGrid
      columns={cols}
      data={SAMPLE_SCOUTS}
      search={(r, q) => fullName(r).toLowerCase().includes(q) || r.patrol.toLowerCase().includes(q) || (r.pos || "").toLowerCase().includes(q)}
      onRowClick={onOpen}
      initialSort={{ id: "name", dir: "asc" }}
      bulkActions={[
        { label: "Email parents", icon: "mail", onClick: () => {} },
        { label: "Mark attendance", icon: "check", onClick: () => {} },
        { label: "Change patrol", icon: "users", onClick: () => {} },
        { label: "Export CSV", icon: "download", onClick: () => {} },
      ]}
    />
  );
};

const AdultsGrid = ({ onOpen }) => {
  const cols = [
    { id: "name", label: "Name", sortable: true, accessor: r => `${r.last} ${r.first}`, render: r => <NameCell m={r} sub={r.role} /> },
    { id: "role", label: "Leadership", sortable: true,
      filter: ["Scoutmaster", "ASM", "Committee Chair", "Committee", "Treasurer", "Advancement", "Webmaster"].map(r => ({ value: r, label: r })),
      render: r => <span style={{ fontFamily: "var(--serif)", fontSize: 13, fontStyle: "italic" }}>{r.role}</span> },
    { id: "trained", label: "YPT", sortable: true, accessor: r => r.trained ? 1 : 0,
      filter: [{ value: "1", label: "Trained" }, { value: "0", label: "Not trained" }],
      render: r => r.trained
        ? <span className="trained-yes" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><Icon name="check" /> {r.ypt}</span>
        : <span className="trained-no" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><Icon name="info" /> Not trained</span> },
    { id: "scouts", label: "Scout(s)", render: r => <span style={{ fontSize: 12, color: r.scouts[0] === "—" ? "var(--muted-2)" : "var(--ink-2)" }}>{r.scouts.join(", ")}</span> },
    { id: "mb", label: "MB Counselor", accessor: r => r.mb ? 1 : 0, sortable: true,
      filter: [{ value: "1", label: "Counselors only" }],
      render: r => r.mb
        ? <div className="mb-cluster">{(r.badges || []).slice(0, 2).map((b, i) => <span key={i} className="mb-badge">{b}</span>)}{r.badges?.length > 2 && <span className="tag">+{r.badges.length - 2}</span>}</div>
        : <span style={{ color: "var(--muted-2)", fontSize: 11.5 }}>—</span> },
    { id: "bsaId", label: "BSA ID", render: r => <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.bsaId}</span> },
    { id: "phone", label: "Contact", render: r => <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{r.phone}</span> },
  ];

  return (
    <DataGrid
      columns={cols}
      data={SAMPLE_ADULTS}
      search={(r, q) => fullName(r).toLowerCase().includes(q) || r.role.toLowerCase().includes(q)}
      onRowClick={onOpen}
      initialSort={{ id: "name", dir: "asc" }}
      bulkActions={[
        { label: "Email", icon: "mail", onClick: () => {} },
        { label: "Assign role", icon: "users", onClick: () => {} },
        { label: "Mark trained", icon: "check", onClick: () => {} },
        { label: "Export YPT roster", icon: "download", onClick: () => {} },
      ]}
    />
  );
};

const CounselorsGrid = ({ onOpen }) => {
  const inTroop = SAMPLE_ADULTS.filter(a => a.mb).map(a => ({ ...a, external: false }));
  const all = [...inTroop, ...EXTERNAL_COUNSELORS];

  const cols = [
    { id: "name", label: "Counselor", sortable: true, accessor: r => `${r.last} ${r.first}`, render: r =>
      <NameCell m={r} sub={r.external ? "External · " + (r.councilId || "") : "In troop · " + r.role} /> },
    { id: "ext", label: "Type", sortable: true, accessor: r => r.external ? "External" : "In-troop",
      filter: [{ value: "In-troop", label: "In-troop" }, { value: "External", label: "External" }],
      render: r => r.external
        ? <span className="tag" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>External</span>
        : <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>In-troop</span> },
    { id: "badges", label: "Counsels", render: r =>
      <div className="mb-cluster">
        {(r.badges || []).slice(0, 4).map((b, i) => <span key={i} className="mb-badge">{b}</span>)}
        {r.badges?.length > 4 && <span className="tag">+{r.badges.length - 4}</span>}
      </div> },
    { id: "expires", label: "YPT / expires", render: r =>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.expires || r.ypt || "—"}</span> },
    { id: "phone", label: "Contact", render: r =>
      <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
        <div className="mono">{r.phone}</div>
        <div style={{ fontSize: 11 }}>{r.emails}</div>
      </div> },
  ];

  return (
    <DataGrid
      columns={cols}
      data={all}
      search={(r, q) => fullName(r).toLowerCase().includes(q) || (r.badges || []).some(b => b.toLowerCase().includes(q))}
      onRowClick={onOpen}
      bulkActions={[
        { label: "Email", icon: "mail", onClick: () => {} },
        { label: "Add badge", icon: "plus", onClick: () => {} },
        { label: "Renew", icon: "check", onClick: () => {} },
        { label: "Export contact list", icon: "download", onClick: () => {} },
      ]}
    />
  );
};

const PatrolsGrid = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
    {PATROLS.map(p => {
      const members = SAMPLE_SCOUTS.filter(s => s.patrol === p.name.replace(" Patrol", ""));
      return (
        <div key={p.id} className="card" style={{ padding: 14, opacity: p.active ? 1 : 0.6 }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: p.color, flex: "0 0 32px", display: "grid", placeItems: "center", color: "#fff", fontFamily: "var(--serif)", fontSize: 14 }}>{p.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 16 }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>PL · {p.leader}</div>
            </div>
            {!p.active && <span className="tag">archived</span>}
          </div>
          <div className="mt-2" style={{ display: "flex", gap: -6, flexWrap: "wrap" }}>
            {members.map(m => (
              <div key={m.id} title={fullName(m)} style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", border: "2px solid #fff", display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontSize: 10.5, marginRight: -6 }}>{initials(m)}</div>
            ))}
            {members.length === 0 && <span style={{ fontSize: 12, color: "var(--muted-2)", fontStyle: "italic" }}>No members yet</span>}
          </div>
          <div className="row mt-2" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{members.length} scouts</span>
            <span className="spacer"></span>
            <button className="btn btn-sm btn-ghost">Edit →</button>
          </div>
        </div>
      );
    })}
  </div>
);

const PendingGrid = ({ onApprove, onDecline }) => (
  <div className="card" style={{ overflow: "hidden" }}>
    <table className="dg-table">
      <thead>
        <tr>
          <th>Name</th><th>Audience</th><th>Requested</th><th>By</th><th>Invited</th><th></th>
        </tr>
      </thead>
      <tbody>
        {PENDING.map(p => (
          <tr key={p.id}>
            <td><NameCell m={p} /></td>
            <td><span className="tag">{p.audience}</span></td>
            <td style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{p.requestedRole}</td>
            <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.requestedBy}</td>
            <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.invited}</td>
            <td style={{ textAlign: "right" }}>
              <button className="btn btn-sm btn-ghost" onClick={onDecline}>Decline</button>
              <button className="btn btn-sm btn-primary" onClick={onApprove} style={{ marginLeft: 6 }}>Approve</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

window.ScoutsGrid = ScoutsGrid;
window.AdultsGrid = AdultsGrid;
window.CounselorsGrid = CounselorsGrid;
window.PatrolsGrid = PatrolsGrid;
window.PendingGrid = PendingGrid;
