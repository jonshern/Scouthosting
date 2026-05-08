// Setup checklist — onboarding page for new units

const SETUP_STEPS = [
  {
    id: "plan", num: 1, label: "Planning", time: "30 min",
    desc: "Decide who's running the site and what features matter.",
    tasks: [
      { t: "Meet with committee — set goals, owners, schedule" },
      { t: "Pick data sources for roster, advancement, accounting" },
      { t: "Decide if scouts can request requirement sign-offs in-app" },
      { t: "Decide on credit card payments + who pays the fees" },
      { t: "Decide whether adults submit reimbursements through the site" },
      { t: "If you run boy + girl troops, decide one site or two" },
    ],
  },
  {
    id: "roster1", num: 2, label: "Initial roster", time: "20 min", depends: 1,
    desc: "Get your setup leaders into the system so they can help.",
    tasks: [
      { t: "Upload membership data, OR…" },
      { t: "Manually add the leaders helping set up the site" },
    ],
  },
  {
    id: "security", num: 3, label: "Security", time: "10 min", depends: 2,
    desc: "Promote your setup crew to admins.",
    tasks: [
      { t: "Assign roles (Scoutmaster, Committee, Treasurer, Webmaster…)" },
      { t: "Send invite emails with first-time login links" },
    ],
  },
  {
    id: "roster", num: 4, label: "Full roster", time: "1 hour", depends: 3,
    desc: "Add everyone — scouts, adults, patrols, training.",
    tasks: [
      { t: "Add remaining members (or invite parents to self-register)" },
      { t: "Set up patrols and patrol membership" },
      { t: "Enter current scout & adult leader positions" },
      { t: "Upload adult training (YPT, position-specific)" },
      { t: "Create dynamic subgroups (e.g. 'going to Philmont')" },
      { t: "Ask leaders to fill in their About Me + photo" },
    ],
  },
  {
    id: "site", num: 5, label: "Public site", time: "45 min", depends: 3,
    desc: "Make your unit look great to prospective families.",
    tasks: [
      { t: "Upload a banner image" },
      { t: "Edit Home + About Our Troop" },
      { t: "Create custom pages — history, FAQ, leaders" },
      { t: "Post your first announcement" },
      { t: "Upload troop forms (medical, permission slips, etc.)" },
      { t: "Add resource links" },
    ],
  },
  {
    id: "calendar", num: 6, label: "Calendar", time: "30 min", depends: 3,
    desc: "Get the year on the books and locations saved.",
    tasks: [
      { t: "Customize event types" },
      { t: "Enter event locations (meeting place, camps, trailheads)" },
      { t: "Enter past events you'll attach photos or expenses to" },
      { t: "Enter upcoming events — use Copy Event for recurring ones" },
      { t: "Show leaders how to take attendance from the mobile app" },
    ],
  },
  {
    id: "photos", num: 7, label: "Photos & video", time: "15 min", depends: 6,
    desc: "Showcase what scouting actually looks like.",
    tasks: [
      { t: "Upload photos from past events" },
      { t: "Link YouTube videos to the Video Gallery" },
    ],
  },
  {
    id: "adv", num: 8, label: "Advancement", time: "1 hour", depends: 4,
    desc: "Track ranks, merit badges, requirement sign-offs.",
    tasks: [
      { t: "Upload (or enter) advancement data per scout" },
      { t: "Enter participation — camping nights, service hours, hiking miles" },
      { t: "Review advancement settings" },
      { t: "Assign merit badge counselors" },
      { t: "Train leaders to sign off on requirements" },
    ],
  },
  {
    id: "inv", num: 9, label: "Inventory & library", time: "30 min", depends: 3, optional: true,
    desc: "Stop losing handbooks and lanterns.",
    tasks: [
      { t: "Enter library materials" },
      { t: "Enter troop equipment" },
      { t: "Check out anything currently with members" },
      { t: "Show leaders how to check items in/out from the app" },
    ],
  },
  {
    id: "money", num: 10, label: "Accounting", time: "1 hour", depends: 4, optional: true,
    desc: "Move from a spreadsheet to a real ledger.",
    tasks: [
      { t: "Set up troop accounts + starting balances" },
      { t: "Set up personal subaccounts for fundraising proceeds" },
      { t: "Upload (or enter) member balances" },
      { t: "Connect Square or PayPal for credit cards" },
      { t: "Review expense reimbursement settings" },
      { t: "Begin monthly reconciliation" },
    ],
  },
  {
    id: "fund", num: 11, label: "Fundraisers", time: "30 min", depends: 4, optional: true,
    desc: "Run popcorn, wreaths, mulch — without the spreadsheet.",
    tasks: [
      { t: "Set up sales campaign + merchandise" },
      { t: "Train scouts on online ordering" },
      { t: "Train fundraising leads on Booth Sales" },
    ],
  },
  {
    id: "rollout", num: 12, label: "Roll out", time: "ongoing", depends: 4,
    desc: "Get everyone using it.",
    tasks: [
      { t: "Send invite emails to all members" },
      { t: "Walk through the site at a troop meeting" },
      { t: "Train families on the mobile app — events, permissions, RSVPs" },
      { t: "Train scouts on requesting requirement sign-offs" },
      { t: "Add ongoing site care to a committee meeting" },
    ],
  },
];

const SetupChecklist = ({ checks, setChecks }) => {
  const completedSteps = SETUP_STEPS.filter(s => s.tasks.every(t => checks[s.id + ":" + t.t]));
  const requiredSteps = SETUP_STEPS.filter(s => !s.optional);
  const requiredDone = requiredSteps.filter(s => s.tasks.every(t => checks[s.id + ":" + t.t]));
  const totalTasks = SETUP_STEPS.reduce((n, s) => n + s.tasks.length, 0);
  const doneTasks = SETUP_STEPS.reduce((n, s) => n + s.tasks.filter(t => checks[s.id + ":" + t.t]).length, 0);
  const pct = Math.round(doneTasks / totalTasks * 100);

  const toggle = (sid, t) => {
    const k = sid + ":" + t;
    setChecks({ ...checks, [k]: !checks[k] });
  };

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Welcome</span>
        <h1>Get your unit set up</h1>
        <p className="lede">A guided 13-step rollout, sequenced so each step builds on the last. Most units finish the required steps in 4–6 hours over a couple of evenings. Don't go alone — split it across the committee.</p>
      </div>

      <div style={{ padding: "0 28px 60px" }}>
        {/* Progress hero */}
        <div className="card" style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 18, alignItems: "center" }}>
          <div>
            <div className="serif" style={{ fontSize: 18 }}>You're <strong>{pct}%</strong> set up</div>
            <div style={{ height: 6, background: "var(--bg-2)", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: "var(--accent)", borderRadius: 999, transition: "width 0.3s" }}></div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              {doneTasks} of {totalTasks} tasks complete · {requiredDone.length} of {requiredSteps.length} required steps done
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 18 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Est. remaining</div>
            <div className="serif" style={{ fontSize: 22, marginTop: 2 }}>~3.5 hrs</div>
          </div>
          <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 18 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live since</div>
            <div className="serif" style={{ fontSize: 22, marginTop: 2 }}>Apr 28</div>
          </div>
          <button className="btn"><Icon name="mail" /> Email this to committee</button>
        </div>

        <div className="row mt-3" style={{ gap: 8, padding: "10px 14px", background: "#fff7e6", border: "1px solid #f3dba0", borderRadius: 8 }}>
          <Icon name="info" />
          <div style={{ fontSize: 12.5, color: "#92580c" }}>
            We sent this checklist to <strong>scoutmaster@example.org</strong> when you created your account. Anyone with admin access can update progress here, and your committee will see it on their dashboard.
          </div>
        </div>

        <div className="mt-3" style={{ display: "grid", gap: 10 }}>
          {SETUP_STEPS.map(s => {
            const stepDone = s.tasks.filter(t => checks[s.id + ":" + t.t]).length;
            const allDone = stepDone === s.tasks.length;
            const dep = s.depends && SETUP_STEPS.find(x => x.num === s.depends);
            const depDone = !dep || dep.tasks.every(t => checks[dep.id + ":" + t.t]);

            return (
              <div key={s.id} className="card" style={{ overflow: "hidden", opacity: depDone ? 1 : 0.55 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, padding: "14px 18px", alignItems: "center", borderBottom: stepDone > 0 ? "1px solid var(--line)" : "none" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: allDone ? "var(--ok)" : depDone ? "var(--accent-soft)" : "var(--bg-2)",
                    color: allDone ? "#fff" : depDone ? "var(--accent)" : "var(--muted-2)",
                    display: "grid", placeItems: "center",
                    fontFamily: "var(--serif)", fontSize: 16,
                  }}>
                    {allDone ? <Icon name="check" size={18} /> : s.num}
                  </div>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="serif" style={{ fontSize: 17 }}>{s.label}</span>
                      {s.optional && <span className="tag">optional</span>}
                      {dep && !depDone && <span className="tag" style={{ color: "var(--muted)" }}>after step {s.depends}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{s.desc}</div>
                  </div>
                  <span className="tag mono">{s.time}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 50, textAlign: "right" }}>{stepDone}/{s.tasks.length}</span>
                </div>

                {depDone && (
                  <div style={{ padding: "8px 18px 14px" }}>
                    {s.tasks.map((task, i) => {
                      const k = s.id + ":" + task.t;
                      const done = !!checks[k];
                      return (
                        <div key={i} onClick={() => toggle(s.id, task.t)} className="row" style={{
                          padding: "7px 0", gap: 10, cursor: "pointer", borderBottom: i < s.tasks.length - 1 ? "1px dashed var(--line)" : "none",
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4,
                            border: "1.5px solid " + (done ? "var(--ok)" : "var(--line-2)"),
                            background: done ? "var(--ok)" : "transparent",
                            color: "#fff", display: "grid", placeItems: "center", flex: "0 0 18px",
                          }}>
                            {done && <Icon name="check" size={11} />}
                          </div>
                          <span style={{ fontSize: 13.5, color: done ? "var(--muted)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>{task.t}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 row" style={{ justifyContent: "center", color: "var(--muted)", fontSize: 12.5, gap: 10 }}>
          <button className="btn btn-sm">Download as spreadsheet</button>
          <button className="btn btn-sm">Print checklist</button>
          <button className="btn btn-sm">Skip — I'll figure it out</button>
        </div>
      </div>
    </>
  );
};

window.SetupChecklist = SetupChecklist;
window.SETUP_STEPS = SETUP_STEPS;
