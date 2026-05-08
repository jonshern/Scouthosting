// Roles & permissions admin — Security tab

const ROLES = [
  { id: "admin", name: "Site Administrator", critical: true, color: "#7a1e1e",
    desc: "Full access. Assigns user roles and configures the site.",
    note: "Designate at least two — you need a backup.",
    perms: ["Manage users & roles", "Edit any page", "Manage billing", "All permissions below"] },
  { id: "adult", name: "Adult Leader",
    desc: "Committee members and scoutmasters.",
    perms: ["View roster & advancement", "Email troop", "View accounting", "Take attendance"] },
  { id: "historian", name: "Historian",
    desc: "Scout role for attendance, calendar updates, and media.",
    perms: ["Take attendance", "Update calendar", "Upload photos & videos"] },
  { id: "forum", name: "Forum Moderator",
    desc: "Update and delete postings on the Scout Forum.",
    perms: ["Edit any post", "Delete any post", "Pin & lock threads"] },
  { id: "events", name: "Event Planner",
    desc: "Add, update, and remove events from the troop calendar.",
    perms: ["Create events", "Edit events", "Manage event locations"] },
  { id: "members", name: "Membership",
    desc: "Enter new members and update existing member records.",
    perms: ["Add members", "Edit member records", "Manage patrols"] },
  { id: "rank", name: "Rank Advancement",
    desc: "Sign off requirements; manage recognition; sync to Internet Advancement 2.0.",
    perms: ["Sign off requirements", "Manage merit badges", "Run BSA IA 2.0 sync"] },
  { id: "treasurer", name: "Treasurer",
    desc: "Accounts, transactions, budgets, and reconciliation.",
    perms: ["Create accounts", "Enter transactions", "Generate reports", "Reconcile bank"] },
  { id: "finreview", name: "Financial Review",
    desc: "Read-only access to all accounting information.",
    perms: ["View all accounts", "View transactions", "View reports"] },
  { id: "library", name: "Librarian",
    desc: "Check materials in/out and maintain library inventory.",
    perms: ["Check out items", "Edit library inventory"] },
  { id: "equip", name: "Troop Equipment",
    desc: "Manage troop equipment and inventory.",
    perms: ["Check out equipment", "Edit equipment inventory"] },
  { id: "web", name: "Web Page Editor",
    desc: "Edit the Home page and other custom pages.",
    perms: ["Edit pages", "Manage media"] },
  { id: "guest", name: "Guest", muted: true,
    desc: "View the calendar but cannot sign up.",
    note: "Optionally open a public Google Calendar link instead.",
    perms: ["View calendar"] },
];

// Sample assignments
const SAMPLE_ASSIGNMENTS = [
  { name: "Sarah Chen",    initials: "SC", title: "Scoutmaster",         roles: ["admin", "adult", "members"] },
  { name: "Mike Rivera",   initials: "MR", title: "Committee Chair",     roles: ["admin", "adult"] },
  { name: "Lena Park",     initials: "LP", title: "Treasurer",           roles: ["adult", "treasurer"] },
  { name: "Dan Whitfield", initials: "DW", title: "Advancement Chair",   roles: ["adult", "rank"] },
  { name: "Priya Shah",    initials: "PS", title: "Webmaster",           roles: ["adult", "web"] },
  { name: "Jordan Brooks", initials: "JB", title: "ASM · 14yr",          roles: ["adult", "events"] },
  { name: "Alex K. (SPL)", initials: "AK", title: "Senior Patrol Leader · scout", roles: ["historian"] },
  { name: "Owen T.",       initials: "OT", title: "Quartermaster · scout", roles: ["equip"] },
  { name: "Ben L.",        initials: "BL", title: "Librarian · scout",   roles: ["library"] },
  { name: "Public Guest",  initials: "G",  title: "Shared view-only",    roles: ["guest"] },
];

const SecurityAdmin = ({ toast }) => {
  const [tab, setTab] = useState("roles");
  const [openRole, setOpenRole] = useState(null);
  const [guestMode, setGuestMode] = useState("compass"); // compass | gcal

  const adminCount = SAMPLE_ASSIGNMENTS.filter(a => a.roles.includes("admin")).length;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Overview</span>
        <h1>Security</h1>
        <p className="lede">Roles control what people can do in Compass. Assign roles to members on your roster — one person can hold many.</p>
      </div>

      <div style={{ padding: "0 28px 60px" }}>
        {/* Admin coverage banner */}
        <div className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", borderColor: adminCount >= 2 ? "var(--line)" : "#f3dba0", background: adminCount >= 2 ? "var(--surface)" : "#fff7e6" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: adminCount >= 2 ? "var(--ok)" : "#c98a16", color: "#fff",
            display: "grid", placeItems: "center", flex: "0 0 32px",
          }}>
            <Icon name={adminCount >= 2 ? "check" : "info"} size={14} />
          </div>
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <strong>{adminCount} site administrator{adminCount === 1 ? "" : "s"}</strong> assigned.
            {adminCount < 2 && <span style={{ color: "#92580c" }}> Designate at least two so you have a backup if one is unavailable.</span>}
            {adminCount >= 2 && <span style={{ color: "var(--muted)" }}> You have a backup if one is unavailable.</span>}
          </div>
          <button className="btn btn-sm">Assign admin</button>
        </div>

        {/* Tabs */}
        <div className="row mt-3" style={{ borderBottom: "1px solid var(--line)" }}>
          {[
            { id: "roles",  label: "Roles" },
            { id: "people", label: "People & assignments" },
            { id: "policy", label: "Login policy" },
          ].map(x => (
            <button key={x.id}
              className={"cal-tab" + (tab === x.id ? " active" : "")}
              style={{ padding: "11px 16px", marginBottom: -1 }}
              onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
          <span className="spacer"></span>
          {tab === "people" && <button className="btn btn-sm btn-primary" style={{ marginBottom: 6 }}><Icon name="plus" /> Invite</button>}
        </div>

        {tab === "roles" && (
          <>
            <div className="row mt-3" style={{ color: "var(--muted)", fontSize: 12.5, gap: 8 }}>
              <Icon name="info" />
              <span>Click a role to inspect its permissions or rename it. Roles are stack-able — one person can hold several.</span>
            </div>
            <div className="mt-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {ROLES.map(r => {
                const count = SAMPLE_ASSIGNMENTS.filter(a => a.roles.includes(r.id)).length;
                return (
                  <div key={r.id} className="card" style={{ padding: 14, cursor: "pointer", opacity: r.muted ? 0.85 : 1 }} onClick={() => setOpenRole(r)}>
                    <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: r.color || "var(--accent)",
                        marginTop: 7, flex: "0 0 8px",
                      }}></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="serif" style={{ fontSize: 16 }}>{r.name}</span>
                          {r.critical && <span className="tag" style={{ background: "#fef0f0", borderColor: "#f3c0c0", color: "#7a1e1e" }}>critical</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{r.desc}</div>
                        {r.note && (
                          <div style={{ fontSize: 11.5, color: r.critical ? "#7a1e1e" : "var(--muted)", fontStyle: "italic", marginTop: 6, fontFamily: "var(--serif)" }}>
                            {r.note}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="row mt-2" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{count} assigned</span>
                      <span className="spacer"></span>
                      <span style={{ fontSize: 11.5, color: "var(--accent)" }}>{r.perms.length} permissions →</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Guest -> google calendar option (per user note) */}
            <div className="card mt-3" style={{ padding: 14, borderStyle: "dashed", background: "var(--bg-2)" }}>
              <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <Icon name="info" />
                <div style={{ flex: 1 }}>
                  <div className="serif" style={{ fontSize: 15 }}>Guest access — choose how outsiders see your calendar</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                    Skip the dummy "Guest, Guest" account. Either keep a true Compass guest role or expose a public Google Calendar link from the public site.
                  </div>
                  <div className="row mt-2" style={{ gap: 8, flexWrap: "wrap" }}>
                    <label className="row" style={{ gap: 8, padding: "8px 12px", background: guestMode === "compass" ? "var(--accent-soft)" : "var(--surface)", border: "1px solid " + (guestMode === "compass" ? "var(--accent)" : "var(--line)"), borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                      <input type="radio" checked={guestMode === "compass"} onChange={() => setGuestMode("compass")} />
                      <span>Use Compass guest role (read-only login)</span>
                    </label>
                    <label className="row" style={{ gap: 8, padding: "8px 12px", background: guestMode === "gcal" ? "var(--accent-soft)" : "var(--surface)", border: "1px solid " + (guestMode === "gcal" ? "var(--accent)" : "var(--line)"), borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                      <input type="radio" checked={guestMode === "gcal"} onChange={() => setGuestMode("gcal")} />
                      <span>Open public Google Calendar link instead</span>
                    </label>
                  </div>
                  {guestMode === "gcal" && (
                    <div className="field mt-2" style={{ marginBottom: 0 }}>
                      <label>Public calendar URL</label>
                      <input className="input mono" defaultValue="https://calendar.google.com/calendar/embed?src=troop100%40group.calendar.google.com" />
                      <span className="hint">We'll add a "View calendar" button on your public site that opens this in a new tab.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "people" && (
          <div className="card mt-3" style={{ overflow: "hidden" }}>
            <table className="pages-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Title</th>
                  <th>Roles</th>
                  <th>Last seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ASSIGNMENTS.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, flex: "0 0 28px" }}>{a.initials}</div>
                        <span className="name">{a.name}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--muted)" }}>{a.title}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        {a.roles.map(rid => {
                          const r = ROLES.find(x => x.id === rid);
                          return <span key={rid} className="tag" style={{ background: r.critical ? "#fef0f0" : "var(--accent-soft)", borderColor: r.critical ? "#f3c0c0" : "transparent", color: r.critical ? "#7a1e1e" : "var(--accent)" }}>{r.name}</span>;
                        })}
                        <button className="btn btn-sm btn-ghost btn-icon" title="Add role"><Icon name="plus" /></button>
                      </div>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{["2h ago", "yesterday", "3 days ago", "last week", "—"][i % 5]}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-sm btn-ghost btn-icon"><Icon name="more" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "policy" && (
          <div className="card mt-3">
            <div className="card-body">
              <div className="field"><label>Require strong passwords</label>
                <div className="seg" style={{ width: "fit-content" }}><button className="on">On</button><button>Off</button></div>
              </div>
              <div className="field"><label>Two-factor for site administrators</label>
                <div className="seg" style={{ width: "fit-content" }}><button className="on">Required</button><button>Optional</button></div>
              </div>
              <div className="field"><label>Session length</label>
                <select className="select"><option>30 days</option><option>14 days</option><option>7 days</option><option>1 day</option></select>
              </div>
              <div className="field"><label>Allow scouts to request requirement sign-offs</label>
                <div className="seg" style={{ width: "fit-content" }}><button className="on">Yes</button><button>No</button></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {openRole && <RoleDrawer role={openRole} onClose={() => setOpenRole(null)} />}
    </>
  );
};

const RoleDrawer = ({ role, onClose }) => (
  <div className="modal-bg" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
      <div className="modal-head">
        <div>
          <span className="eyebrow">§ Role</span>
          <h3 style={{ marginTop: 2 }}>{role.name}</h3>
        </div>
        <span className="spacer"></span>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-body">
        <p style={{ marginTop: 0, color: "var(--ink-2)", fontSize: 13.5 }}>{role.desc}</p>
        {role.note && (
          <div style={{ padding: 10, background: role.critical ? "#fef0f0" : "var(--bg-2)", border: "1px solid " + (role.critical ? "#f3c0c0" : "var(--line)"), borderRadius: 8, fontSize: 12.5, color: role.critical ? "#7a1e1e" : "var(--ink-2)", fontStyle: "italic", fontFamily: "var(--serif)", marginBottom: 14 }}>
            {role.note}
          </div>
        )}
        <h4 className="serif" style={{ fontSize: 14, fontWeight: 500, margin: "8px 0 8px" }}>Permissions</h4>
        <div style={{ display: "grid", gap: 6 }}>
          {role.perms.map((p, i) => (
            <div key={i} className="row" style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13 }}>
              <Icon name="check" />
              <span>{p}</span>
              <span className="spacer"></span>
              <span className="tag mono" style={{ fontSize: 10 }}>granted</span>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn">Rename role</button>
        <button className="btn btn-primary">Edit permissions</button>
      </div>
    </div>
  </div>
);

window.SecurityAdmin = SecurityAdmin;
