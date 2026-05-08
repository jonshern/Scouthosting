// Roster — Scouts, Adults, Merit Badge Counselors, Patrols, Pending invites
const { useState: useStateR } = React;

const SAMPLE_SCOUTS = [
  { id: "s1",  first: "Alex",    last: "Kowalski",  age: 16, joined: "2021", patrol: "Eagle",   rank: "life",      rankPct: 80, mb: 12, pos: "Senior Patrol Leader", lastSeen: "Mon", parents: [{ name: "Marta Kowalski", role: "Mother", email: "marta@example.org", phone: "612-555-0142" }, { name: "Ivan Kowalski", role: "Father", email: "ivan@example.org" }] },
  { id: "s2",  first: "Owen",    last: "Tanaka",    age: 14, joined: "2022", patrol: "Eagle",   rank: "star",      rankPct: 45, mb: 8,  pos: "Quartermaster",        lastSeen: "Mon", parents: [{ name: "Yui Tanaka", role: "Mother", email: "yui@example.org", phone: "612-555-0144" }] },
  { id: "s3",  first: "Ben",     last: "Liu",       age: 13, joined: "2023", patrol: "Hawk",    rank: "first",     rankPct: 60, mb: 4,  pos: "Librarian",            lastSeen: "Mon", parents: [{ name: "Jin Liu", role: "Father", email: "jin@example.org", phone: "612-555-0150" }] },
  { id: "s4",  first: "Marcus",  last: "Bell",      age: 15, joined: "2022", patrol: "Hawk",    rank: "star",      rankPct: 25, mb: 6,  pos: "Patrol Leader",        lastSeen: "Mon", parents: [{ name: "Tasha Bell", role: "Mother" }] },
  { id: "s5",  first: "Diego",   last: "Ramirez",   age: 12, joined: "2024", patrol: "Hawk",    rank: "tenderfoot",rankPct: 90, mb: 2,  pos: "—",                    lastSeen: "Apr 28", parents: [{ name: "Sofia Ramirez", role: "Mother" }, { name: "Carlos Ramirez", role: "Father" }] },
  { id: "s6",  first: "Aiden",   last: "Park",      age: 14, joined: "2022", patrol: "Wolf",    rank: "first",     rankPct: 100, mb: 5, pos: "ASPL",                 lastSeen: "Mon", parents: [{ name: "Helen Park", role: "Mother" }] },
  { id: "s7",  first: "Caleb",   last: "Whitfield", age: 13, joined: "2023", patrol: "Wolf",    rank: "second",    rankPct: 55, mb: 3,  pos: "—",                    lastSeen: "Mon", parents: [{ name: "Dan Whitfield", role: "Father" }] },
  { id: "s8",  first: "Theo",    last: "Brooks",    age: 12, joined: "2024", patrol: "Otter",   rank: "scout",     rankPct: 30, mb: 0,  pos: "—",                    lastSeen: "Apr 21", parents: [{ name: "Jordan Brooks", role: "Father" }] },
  { id: "s9",  first: "Henry",   last: "Olsen",     age: 11, joined: "2025", patrol: "Otter",   rank: "scout",     rankPct: 12, mb: 0,  pos: "—",                    lastSeen: "Apr 14", parents: [{ name: "Erika Olsen", role: "Mother" }] },
  { id: "s10", first: "Sam",     last: "Hutchins",  age: 17, joined: "2020", patrol: "Eagle",   rank: "eagle",     rankPct: 100, mb: 26, pos: "Junior ASM",           lastSeen: "Mon", parents: [{ name: "Renee Hutchins", role: "Mother" }] },
  { id: "s11", first: "Noah",    last: "Carter",    age: 15, joined: "2022", patrol: "Eagle",   rank: "life",      rankPct: 30, mb: 11, pos: "—",                    lastSeen: "Mon", parents: [{ name: "Megan Carter", role: "Mother" }] },
  { id: "s12", first: "Jack",    last: "Mendoza",   age: 13, joined: "2023", patrol: "Wolf",    rank: "first",     rankPct: 75, mb: 6,  pos: "Patrol Leader",        lastSeen: "Mon", parents: [{ name: "Luis Mendoza", role: "Father" }] },
  { id: "s13", first: "Eli",     last: "Singh",     age: 14, joined: "2023", patrol: "Hawk",    rank: "second",    rankPct: 80, mb: 4,  pos: "—",                    lastSeen: "Apr 28", parents: [{ name: "Priya Singh", role: "Mother" }] },
  { id: "s14", first: "Zach",    last: "Rivera",    age: 16, joined: "2021", patrol: "Eagle",   rank: "life",      rankPct: 60, mb: 14, pos: "Den Chief",            lastSeen: "Mon", parents: [{ name: "Mike Rivera", role: "Father" }] },
];

const SAMPLE_ADULTS = [
  { id: "a1", first: "Sarah",   last: "Chen",       role: "Scoutmaster",     trained: true,  ypt: "2026-08-12", bsaId: "12876541", scouts: ["—"], emails: "sarah@example.org",   phone: "612-555-0101", mb: false, employer: "Saint Paul Schools", joined: "2018" },
  { id: "a2", first: "Mike",    last: "Rivera",     role: "Committee Chair", trained: true,  ypt: "2026-09-01", bsaId: "10921120", scouts: ["Zach"], emails: "mike@example.org",  phone: "612-555-0114", mb: true,  badges: ["Engineering", "Personal Mgmt"], employer: "3M", joined: "2020" },
  { id: "a3", first: "Lena",    last: "Park",       role: "Treasurer",       trained: true,  ypt: "2026-04-21", bsaId: "11220330", scouts: ["Aiden"], emails: "lena@example.org", phone: "612-555-0117", mb: false, employer: "Wells Fargo", joined: "2021" },
  { id: "a4", first: "Dan",     last: "Whitfield",  role: "Advancement",     trained: true,  ypt: "2026-11-30", bsaId: "13003342", scouts: ["Caleb"], emails: "dan@example.org",  phone: "612-555-0120", mb: true,  badges: ["Citizenship in Society", "Communication"], employer: "Target", joined: "2019" },
  { id: "a5", first: "Priya",   last: "Shah",       role: "Webmaster",       trained: true,  ypt: "2026-10-14", bsaId: "13442251", scouts: ["Eli"], emails: "priya@example.org", phone: "612-555-0123", mb: false, employer: "U of M", joined: "2022" },
  { id: "a6", first: "Jordan",  last: "Brooks",     role: "ASM",             trained: true,  ypt: "2026-07-08", bsaId: "13884412", scouts: ["Theo"], emails: "jordan@example.org", phone: "612-555-0128", mb: true,  badges: ["Hiking", "Camping", "First Aid"], employer: "REI", joined: "2022" },
  { id: "a7", first: "Erika",   last: "Olsen",      role: "Committee",       trained: false, ypt: "—",          bsaId: "14001120", scouts: ["Henry"], emails: "erika@example.org", phone: "612-555-0140", mb: false, employer: "Self-employed", joined: "2024" },
  { id: "a8", first: "Marta",   last: "Kowalski",   role: "Committee",       trained: true,  ypt: "2026-05-19", bsaId: "11541230", scouts: ["Alex"], emails: "marta@example.org", phone: "612-555-0142", mb: true,  badges: ["Cooking"], employer: "Mayo Clinic", joined: "2020" },
  { id: "a9", first: "Carlos",  last: "Ramirez",    role: "ASM",             trained: true,  ypt: "2026-06-22", bsaId: "12110430", scouts: ["Diego"], emails: "carlos@example.org", phone: "612-555-0144", mb: true,  badges: ["Cycling", "Geocaching"], employer: "Polaris", joined: "2024" },
  { id: "a10",first: "Helen",   last: "Park",       role: "Committee",       trained: true,  ypt: "2026-03-10", bsaId: "12880321", scouts: ["Aiden"], emails: "helen@example.org", phone: "612-555-0146", mb: false, employer: "Hennepin County", joined: "2022" },
];

const EXTERNAL_COUNSELORS = [
  { id: "c1", first: "Robert",  last: "Mason",   external: true, badges: ["Aviation", "Astronomy", "Space Exploration"], emails: "rmason@example.org", phone: "651-555-0190", councilId: "VW-2210", expires: "2027-02-01" },
  { id: "c2", first: "Diane",   last: "Whitcombe", external: true, badges: ["Bird Study", "Mammal Study", "Nature"],     emails: "dwhit@example.org",  phone: "651-555-0192", councilId: "VW-2244", expires: "2026-12-12" },
  { id: "c3", first: "Anthony", last: "Cole",   external: true, badges: ["Welding", "Metalwork"], emails: "ac@example.org", phone: "651-555-0194", councilId: "VW-1990", expires: "2026-09-30" },
  { id: "c4", first: "Yvette",  last: "Park",    external: true, badges: ["Public Speaking", "Communication", "Journalism"], emails: "yvette@example.org", phone: "651-555-0196", councilId: "VW-2310", expires: "2027-08-04" },
];

const PATROLS = [
  { id: "p1", name: "Eagle Patrol",  color: "#7a1e1e", leader: "Alex Kowalski",  members: 5, active: true },
  { id: "p2", name: "Hawk Patrol",   color: "#1d3a8a", leader: "Marcus Bell",    members: 4, active: true },
  { id: "p3", name: "Wolf Patrol",   color: "#15803d", leader: "Jack Mendoza",   members: 4, active: true },
  { id: "p4", name: "Otter Patrol",  color: "#0e7490", leader: "(Unassigned)",   members: 2, active: true },
  { id: "p5", name: "Bear Patrol",   color: "#92400e", leader: "—",              members: 0, active: false },
];

const PENDING = [
  { id: "n1", first: "Hailey",  last: "Yoon",    audience: "Adult",  requestedRole: "Committee", requestedBy: "Sarah Chen",  invited: "Apr 28" },
  { id: "n2", first: "Lucas",   last: "Berg",    audience: "Scout",  requestedRole: "—",          requestedBy: "Self · webform", invited: "Apr 25" },
  { id: "n3", first: "Anita",   last: "Sokol",   audience: "Counselor", requestedRole: "External", requestedBy: "Dan Whitfield", invited: "Apr 14" },
];

const fullName = m => `${m.first} ${m.last}`;
const initials = m => (m.first[0] + (m.last?.[0] || "")).toUpperCase();
const RANK_LABEL = { scout: "Scout", tenderfoot: "Tenderfoot", second: "Second Class", first: "First Class", star: "Star", life: "Life", eagle: "Eagle" };

// ---- Avatar ----
const Avatar = ({ m, size = "md" }) => {
  const cls = size === "lg" ? "avatar-lg" : "r-avatar ph";
  const style = size === "lg" ? { width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", background: "linear-gradient(135deg, var(--accent-soft), #d6e0ff)", color: "var(--accent)", fontFamily: "var(--serif)", fontSize: 22, border: "1px solid var(--line)", flex: "0 0 64px" } : {};
  return <div className={cls} style={style}>{initials(m)}</div>;
};

// ---- Member name cell ----
const NameCell = ({ m, sub }) => (
  <div className="r-name">
    <Avatar m={m} />
    <div className="label">
      <span className="n">{fullName(m)}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  </div>
);

// ====================================================================
// ROSTER SHELL
// ====================================================================
const RosterAdmin = ({ toast }) => {
  const [tab, setTab] = useStateR("scouts");
  const [openMember, setOpenMember] = useStateR(null);
  const [showInvite, setShowInvite] = useStateR(false);
  const [showNewScout, setShowNewScout] = useStateR(false);

  const adultLookup = id => SAMPLE_ADULTS.find(a => a.id === id);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Roster</span>
        <h1>Roster</h1>
        <p className="lede">Scouts, adult leaders, merit badge counselors, and patrols. Search, filter, and manage everyone in one place.</p>
      </div>

      <div style={{ padding: "0 28px 60px" }}>
        {/* Stats strip */}
        <div className="row mt-1" style={{ gap: 10, flexWrap: "wrap" }}>
          <StatTile label="Active scouts" v={SAMPLE_SCOUTS.length} sub="14 this season" />
          <StatTile label="Adult members" v={SAMPLE_ADULTS.length} sub={`${SAMPLE_ADULTS.filter(a => a.trained).length} trained · ${SAMPLE_ADULTS.filter(a => !a.trained).length} need YPT`} warn={SAMPLE_ADULTS.some(a => !a.trained)} />
          <StatTile label="MB counselors" v={SAMPLE_ADULTS.filter(a => a.mb).length + EXTERNAL_COUNSELORS.length} sub={`${SAMPLE_ADULTS.filter(a => a.mb).length} in-troop · ${EXTERNAL_COUNSELORS.length} external`} />
          <StatTile label="Patrols" v={PATROLS.filter(p => p.active).length} sub={`${PATROLS.length - PATROLS.filter(p => p.active).length} archived`} />
          <StatTile label="Pending" v={PENDING.length} sub="invites & registrations" highlight={PENDING.length > 0} />
        </div>

        {/* Tabs */}
        <div className="row mt-3" style={{ borderBottom: "1px solid var(--line)" }}>
          {[
            { id: "scouts",     label: "Scouts",                count: SAMPLE_SCOUTS.length },
            { id: "adults",     label: "Adult members",         count: SAMPLE_ADULTS.length },
            { id: "counselors", label: "Merit badge counselors", count: SAMPLE_ADULTS.filter(a => a.mb).length + EXTERNAL_COUNSELORS.length },
            { id: "patrols",    label: "Patrols",               count: PATROLS.length },
            { id: "pending",    label: "Pending",               count: PENDING.length },
          ].map(x => (
            <button key={x.id}
              className={"cal-tab" + (tab === x.id ? " active" : "")}
              style={{ padding: "11px 14px", marginBottom: -1 }}
              onClick={() => setTab(x.id)}>
              {x.label} <span className="tag" style={{ marginLeft: 4 }}>{x.count}</span>
            </button>
          ))}
          <span className="spacer"></span>
          {tab === "scouts" && <button className="btn btn-primary" style={{ marginBottom: 6 }} onClick={() => setShowNewScout(true)}><Icon name="plus" /> Register scout</button>}
          {tab === "adults" && <button className="btn btn-primary" style={{ marginBottom: 6 }} onClick={() => setShowInvite(true)}><Icon name="plus" /> Invite adult</button>}
          {tab === "counselors" && <button className="btn btn-primary" style={{ marginBottom: 6 }}><Icon name="plus" /> Add counselor</button>}
          {tab === "patrols" && <button className="btn btn-primary" style={{ marginBottom: 6 }}><Icon name="plus" /> New patrol</button>}
        </div>

        <div className="mt-3">
          {tab === "scouts"     && <ScoutsGrid onOpen={setOpenMember} />}
          {tab === "adults"     && <AdultsGrid onOpen={setOpenMember} />}
          {tab === "counselors" && <CounselorsGrid onOpen={setOpenMember} />}
          {tab === "patrols"    && <PatrolsGrid />}
          {tab === "pending"    && <PendingGrid onApprove={() => toast("Approved")} onDecline={() => toast("Declined")} />}
        </div>
      </div>

      {openMember && <MemberDrawer member={openMember} onClose={() => setOpenMember(null)} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvite={() => { setShowInvite(false); toast("Invite sent"); }} />}
      {showNewScout && <NewScoutModal onClose={() => setShowNewScout(false)} onSave={() => { setShowNewScout(false); toast("Scout registered"); }} />}
    </>
  );
};

const StatTile = ({ label, v, sub, warn, highlight }) => (
  <div className="card" style={{ padding: "10px 14px", flex: 1, minWidth: 150, borderColor: warn ? "#f3c0c0" : highlight ? "var(--accent)" : "var(--line)" }}>
    <div className="eyebrow" style={{ fontSize: 11 }}>{label}</div>
    <div className="serif" style={{ fontSize: 26, fontWeight: 400, marginTop: 2 }}>{v}</div>
    <div style={{ fontSize: 11, color: warn ? "#7a1e1e" : "var(--muted)", marginTop: 1 }}>{sub}</div>
  </div>
);

window.RosterAdmin = RosterAdmin;
window.SAMPLE_SCOUTS = SAMPLE_SCOUTS;
window.SAMPLE_ADULTS = SAMPLE_ADULTS;
window.EXTERNAL_COUNSELORS = EXTERNAL_COUNSELORS;
window.PATROLS = PATROLS;
window.PENDING = PENDING;
window.fullName = fullName;
window.initials = initials;
window.NameCell = NameCell;
window.Avatar = Avatar;
window.RANK_LABEL = RANK_LABEL;
