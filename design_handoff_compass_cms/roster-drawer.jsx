// Member detail drawer + Invite + New Scout (with parent picker)
const { useState: useStateD } = React;

const MemberDrawer = ({ member, onClose }) => {
  const isScout = "rank" in member;
  const isCounselor = member.external !== undefined;
  const [tab, setTab] = useStateD(isScout ? "advancement" : "profile");

  const tabs = isScout
    ? [
        { id: "profile",     label: "Profile" },
        { id: "advancement", label: "Advancement" },
        { id: "parents",     label: "Parents & guardians" },
        { id: "medical",     label: "Medical & forms" },
        { id: "activity",    label: "Activity log" },
      ]
    : [
        { id: "profile",  label: "Profile" },
        { id: "roles",    label: "Roles & training" },
        ...(member.mb || isCounselor ? [{ id: "badges", label: "Counselor badges" }] : []),
        { id: "kids",     label: "Children in troop" },
        { id: "activity", label: "Activity log" },
      ];

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal member-drawer" onClick={e => e.stopPropagation()}>
        <div className="hero">
          <Avatar m={member} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="eyebrow">§ {isScout ? "Scout" : isCounselor && member.external ? "External counselor" : "Adult member"}</span>
            <h2 style={{ marginTop: 2 }}>{fullName(member)}</h2>
            <div className="sub">
              {isScout && <>{RANK_LABEL[member.rank]} · {member.patrol} Patrol · age {member.age} · joined {member.joined}{member.pos !== "—" && <> · {member.pos}</>}</>}
              {!isScout && !isCounselor && <>{member.role}{member.bsaId && <> · BSA #{member.bsaId}</>}{member.scouts?.[0] !== "—" && <> · parent of {member.scouts.join(", ")}</>}</>}
              {isCounselor && member.external && <>External · Council ID {member.councilId}</>}
            </div>
            <div className="row mt-1" style={{ gap: 6 }}>
              <button className="btn btn-sm"><Icon name="mail" /> Email</button>
              <button className="btn btn-sm"><Icon name="edit" /> Edit profile</button>
              <button className="btn btn-sm btn-ghost"><Icon name="more" /></button>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="tabs-row">
          {tabs.map(t => (
            <button key={t.id} className={"tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="tab-body">
          {tab === "profile" && <ProfileTab m={member} />}
          {tab === "advancement" && <AdvancementTab m={member} />}
          {tab === "parents" && <ParentsTab m={member} />}
          {tab === "medical" && <MedicalTab m={member} />}
          {tab === "roles" && <RolesTab m={member} />}
          {tab === "badges" && <BadgesTab m={member} />}
          {tab === "kids" && <KidsTab m={member} />}
          {tab === "activity" && <ActivityTab m={member} />}
        </div>
      </div>
    </div>
  );
};

const ProfileTab = ({ m }) => (
  <div className="kv">
    <div className="k">Full name</div><div className="v">{fullName(m)}</div>
    {m.role && <><div className="k">Role</div><div className="v">{m.role}</div></>}
    {m.bsaId && <><div className="k">BSA ID</div><div className="v mono">{m.bsaId}</div></>}
    {m.councilId && <><div className="k">Council ID</div><div className="v mono">{m.councilId}</div></>}
    {m.age && <><div className="k">Age</div><div className="v">{m.age}</div></>}
    {m.joined && <><div className="k">Joined</div><div className="v">{m.joined}</div></>}
    {m.patrol && <><div className="k">Patrol</div><div className="v">{m.patrol}</div></>}
    {m.emails && <><div className="k">Email</div><div className="v">{m.emails}</div></>}
    {m.phone && <><div className="k">Phone</div><div className="v mono">{m.phone}</div></>}
    {m.employer && <><div className="k">Employer</div><div className="v">{m.employer}</div></>}
  </div>
);

const ADV_REQ = [
  { name: "Camping nights — 20 needed", pct: 75, status: "in progress" },
  { name: "Service hours — 6 needed",   pct: 100, status: "complete" },
  { name: "Position of responsibility (4 mo)", pct: 50, status: "in progress" },
  { name: "Scoutmaster conference",     pct: 0,  status: "pending" },
  { name: "Board of Review",            pct: 0,  status: "pending" },
];

const AdvancementTab = ({ m }) => (
  <div>
    <div className="row" style={{ marginBottom: 12 }}>
      <div>
        <div className="eyebrow">working toward</div>
        <div className="serif" style={{ fontSize: 24, marginTop: 2 }}>
          {m.rank === "eagle" ? "Eagle Palms" : nextRank(m.rank)}
        </div>
      </div>
      <span className="spacer"></span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-sm"><Icon name="check" /> Sign off requirement</button>
        <button className="btn btn-sm btn-ghost"><Icon name="download" /> IA 2.0 sync</button>
      </div>
    </div>

    <h4 style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, margin: "0 0 6px" }}>Requirements</h4>
    {ADV_REQ.map((r, i) => (
      <div key={i} className="adv-row">
        <span className="tag" style={{ background: r.status === "complete" ? "#f0fdf4" : r.status === "pending" ? "var(--bg)" : "#fffbeb", color: r.status === "complete" ? "#15803d" : r.status === "pending" ? "var(--muted)" : "#92400e", borderColor: "transparent", justifyContent: "center" }}>{r.status}</span>
        <span style={{ fontSize: 13 }}>{r.name}</span>
        <div className="row" style={{ gap: 6 }}>
          <div className="progress-track" style={{ width: 50 }}><div className="fill" style={{ width: `${r.pct}%` }}></div></div>
          <span className="pct">{r.pct}%</span>
        </div>
      </div>
    ))}

    <h4 className="mt-3" style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, margin: "20px 0 6px" }}>Merit badges ({m.mb})</h4>
    <div className="mb-cluster">
      {["Citizenship in the World", "First Aid", "Camping", "Hiking", "Personal Mgmt", "Communication", "Cooking", "Family Life", "Swimming", "Cycling"].slice(0, m.mb || 0).map((b, i) => (
        <span key={i} className={"mb-badge" + (i < 4 ? " eagle" : "")}>{b}</span>
      ))}
    </div>
  </div>
);

const nextRank = current => {
  const order = ["scout", "tenderfoot", "second", "first", "star", "life", "eagle"];
  const i = order.indexOf(current);
  return RANK_LABEL[order[i + 1]] || "—";
};

const ParentsTab = ({ m }) => (
  <div>
    {(m.parents || []).map((p, i) => (
      <div key={i} className="parent-card">
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-soft), #d6e0ff)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontSize: 13, flex: "0 0 36px", border: "1px solid var(--line)" }}>
          {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="a">
          <div className="row">
            <span className="name">{p.name}</span>
            <span className="tag">{p.role}</span>
            <span className="spacer"></span>
            <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>linked to roster</span>
          </div>
          <div className="contact">
            {p.email || "—"}{p.phone ? ` · ${p.phone}` : ""}
          </div>
        </div>
        <button className="btn btn-sm btn-ghost btn-icon"><Icon name="more" /></button>
      </div>
    ))}
    <button className="btn btn-sm" style={{ marginTop: 8 }}><Icon name="plus" /> Add guardian</button>
  </div>
);

const MedicalTab = ({ m }) => (
  <div>
    <div className="kv">
      <div className="k">Annual health form A&B</div><div className="v"><span style={{ color: "var(--ok)" }}>✓ on file · expires Aug 2026</span></div>
      <div className="k">Annual health form C</div><div className="v"><span style={{ color: "var(--warn)" }}>Required for Philmont · not on file</span></div>
      <div className="k">Insurance</div><div className="v">HealthPartners · #HP-{m.id.slice(1)}442</div>
      <div className="k">Allergies</div><div className="v">{m.id.endsWith("3") ? "Peanuts (severe)" : "None reported"}</div>
      <div className="k">Dietary</div><div className="v">—</div>
      <div className="k">Emergency contact</div><div className="v">{(m.parents?.[0] || {}).name || "—"}</div>
    </div>
    <div className="row mt-3" style={{ gap: 6 }}>
      <button className="btn btn-sm"><Icon name="download" /> Download forms</button>
      <button className="btn btn-sm btn-ghost"><Icon name="mail" /> Request update</button>
    </div>
  </div>
);

const RolesTab = ({ m }) => (
  <div>
    <h4 style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Compass roles</h4>
    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>{m.role}</span>
      <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>Adult Leader</span>
      {m.role === "Treasurer" && <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>Treasurer</span>}
      <button className="btn btn-sm btn-ghost btn-icon"><Icon name="plus" /></button>
    </div>

    <h4 style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, margin: "20px 0 8px" }}>Training & compliance</h4>
    <div className="kv">
      <div className="k">Youth Protection</div><div className="v">{m.trained ? <span className="trained-yes">✓ current · expires {m.ypt}</span> : <span className="trained-no">Not on file — required</span>}</div>
      <div className="k">Position-specific</div><div className="v">{m.role.includes("Scoutmaster") ? "SM Specific Training · complete" : "Committee Member Specific · complete"}</div>
      <div className="k">IOLS</div><div className="v">{m.role.startsWith("Scoutmaster") || m.role === "ASM" ? "Complete · Sep 2024" : "Not required"}</div>
      <div className="k">CPR/First Aid</div><div className="v">Current · expires Mar 2027</div>
    </div>
  </div>
);

const BadgesTab = ({ m }) => (
  <div>
    <h4 style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Counsels</h4>
    <div className="mb-cluster">
      {(m.badges || []).map((b, i) => (
        <span key={i} className="mb-badge" style={{ padding: "4px 10px", fontSize: 12 }}>
          {b}
          <button className="btn btn-sm btn-ghost btn-icon" style={{ marginLeft: 4, opacity: 0.7 }}><Icon name="x" size={10} /></button>
        </span>
      ))}
      <button className="btn btn-sm"><Icon name="plus" /> Add badge</button>
    </div>

    <div className="kv mt-3">
      <div className="k">Approved by council</div><div className="v">{m.expires ? `Yes · expires ${m.expires}` : "Yes · expires Jul 2027"}</div>
      <div className="k">Show contact info to scouts</div><div className="v"><label className="row" style={{ gap: 6 }}><input type="checkbox" defaultChecked /> Yes — visible in scout-facing directory</label></div>
      <div className="k">Areas of expertise</div><div className="v">{m.employer ? `Industry: ${m.employer}` : "—"}</div>
    </div>
  </div>
);

const KidsTab = ({ m }) => {
  const kids = SAMPLE_SCOUTS.filter(s => s.parents?.some(p => p.name.includes(m.last)));
  return (
    <div>
      {kids.length === 0 && <div className="empty" style={{ padding: 18 }}>No children currently in the troop.</div>}
      {kids.map(k => (
        <div key={k.id} className="parent-card">
          <Avatar m={k} />
          <div className="a">
            <div className="name">{fullName(k)}</div>
            <div className="role">{RANK_LABEL[k.rank]} · {k.patrol} Patrol · age {k.age}</div>
          </div>
          <button className="btn btn-sm btn-ghost">View →</button>
        </div>
      ))}
      <button className="btn btn-sm mt-2"><Icon name="plus" /> Link another scout</button>
    </div>
  );
};

const ActivityTab = ({ m }) => (
  <div style={{ fontSize: 13 }}>
    {[
      { d: "Mon Apr 28", t: "Attended troop meeting", who: "auto" },
      { d: "Sun Apr 20", t: "Camping requirement signed off", who: "Sarah Chen" },
      { d: "Mon Apr 14", t: "Attended troop meeting", who: "auto" },
      { d: "Sat Apr 12", t: "Service hours logged · 4 hrs", who: m.first },
      { d: "Mon Apr 07", t: "Profile updated", who: "self" },
    ].map((e, i) => (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 12, padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{e.d}</span>
        <span>{e.t}</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{e.who}</span>
      </div>
    ))}
  </div>
);

// ---- Invite modal ----
const InviteModal = ({ onClose, onInvite }) => (
  <div className="modal-bg" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
      <div className="modal-head">
        <div>
          <span className="eyebrow">§ Roster</span>
          <h3 style={{ marginTop: 2 }}>Invite an adult</h3>
        </div>
        <span className="spacer"></span>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-body">
        <div className="field"><label>Email</label><input className="input" placeholder="parent@example.com" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>First name</label><input className="input" /></div>
          <div className="field" style={{ flex: 1 }}><label>Last name</label><input className="input" /></div>
        </div>
        <div className="field"><label>Role</label>
          <select className="select"><option>Committee member</option><option>ASM</option><option>Scoutmaster</option><option>Treasurer</option><option>Advancement</option></select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" defaultChecked /> Also designate as Merit Badge Counselor</label>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={onInvite}><Icon name="mail" /> Send invite</button>
      </div>
    </div>
  </div>
);

// ---- New scout — with parent picker ----
const NewScoutModal = ({ onClose, onSave }) => {
  const [parents, setParents] = useStateD([]);
  const [showPicker, setShowPicker] = useStateD(false);

  const linkParent = a => {
    setParents([...parents, { id: a.id, name: fullName(a), role: a.scouts?.[0] === "—" ? "Guardian" : "Mother", email: a.emails, phone: a.phone, linked: true }]);
    setShowPicker(false);
  };
  const addBlank = () => setParents([...parents, { name: "", role: "Parent", email: "", phone: "", linked: false }]);
  const updateParent = (i, p) => setParents(parents.map((x, k) => k === i ? { ...x, ...p } : x));
  const removeParent = i => setParents(parents.filter((_, k) => k !== i));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: "min(640px, 96vw)" }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">§ Roster</span>
            <h3 style={{ marginTop: 2 }}>Register new scout</h3>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>First name</label><input className="input" placeholder="Lucas" /></div>
            <div className="field" style={{ flex: 1 }}><label>Last name</label><input className="input" placeholder="Berg" /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Date of birth</label><input className="input mono" type="date" /></div>
            <div className="field" style={{ flex: 1 }}><label>Patrol</label>
              <select className="select"><option>(unassigned — assign later)</option>{PATROLS.filter(p => p.active).map(p => <option key={p.id}>{p.name}</option>)}</select>
            </div>
          </div>
          <div className="field"><label>BSA ID <span className="tag" style={{ marginLeft: 6 }}>optional</span></label><input className="input mono" placeholder="Will be assigned by council if blank" /></div>

          <div className="divider"></div>

          <div className="row">
            <h4 style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, margin: 0 }}>Parents & guardians</h4>
            <span className="spacer"></span>
            <button className="btn btn-sm" onClick={() => setShowPicker(true)}><Icon name="search" /> Link existing adult</button>
            <button className="btn btn-sm btn-ghost" onClick={addBlank}><Icon name="plus" /> Add new</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 8px" }}>
            Search the roster — if a parent is already in the troop (perhaps from another sibling), link their record so contact info stays in sync.
          </div>

          {parents.length === 0 && (
            <div className="empty" style={{ padding: 14, fontSize: 12.5 }}>
              <Icon name="users" /> <span style={{ marginLeft: 6 }}>No parent linked yet.</span>
            </div>
          )}

          {parents.map((p, i) => (
            <div key={i} className="parent-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="row">
                <span className="tag" style={{ background: p.linked ? "var(--accent-soft)" : "var(--bg-2)", color: p.linked ? "var(--accent)" : "var(--muted)", borderColor: "transparent" }}>
                  {p.linked ? "✓ linked from roster" : "new record"}
                </span>
                <span className="spacer"></span>
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => removeParent(i)}><Icon name="trash" /></button>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <input className="input" style={{ flex: 2 }} placeholder="Name" value={p.name} onChange={e => updateParent(i, { name: e.target.value })} disabled={p.linked} />
                <select className="select" style={{ width: 130 }} value={p.role} onChange={e => updateParent(i, { role: e.target.value })}>
                  <option>Mother</option><option>Father</option><option>Guardian</option><option>Step-parent</option>
                </select>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <input className="input" style={{ flex: 2 }} placeholder="Email" value={p.email || ""} onChange={e => updateParent(i, { email: e.target.value })} disabled={p.linked} />
                <input className="input mono" style={{ flex: 1 }} placeholder="Phone" value={p.phone || ""} onChange={e => updateParent(i, { phone: e.target.value })} disabled={p.linked} />
              </div>
              {!p.linked && (
                <label className="row" style={{ gap: 6, marginTop: 6, fontSize: 12 }}>
                  <input type="checkbox" defaultChecked /> Also create an Adult Member record (committee, parent of scout)
                </label>
              )}
            </div>
          ))}

          {showPicker && (
            <div className="card" style={{ marginTop: 8, maxHeight: 220, overflow: "auto" }}>
              <div style={{ padding: 10, borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
                <input className="input" placeholder="Search adult roster…" autoFocus />
              </div>
              {SAMPLE_ADULTS.slice(0, 8).map(a => (
                <div key={a.id} className="row" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer", gap: 10 }} onClick={() => linkParent(a)}>
                  <Avatar m={a} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 13.5 }}>{fullName(a)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{a.role} · {a.scouts?.[0] !== "—" ? "parent of " + a.scouts.join(", ") : "no scouts in troop"}</div>
                  </div>
                  <button className="btn btn-sm btn-primary">Link</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn">Save & add another</button>
          <button className="btn btn-primary" onClick={onSave}><Icon name="check" /> Register scout</button>
        </div>
      </div>
    </div>
  );
};

window.MemberDrawer = MemberDrawer;
window.InviteModal = InviteModal;
window.NewScoutModal = NewScoutModal;
