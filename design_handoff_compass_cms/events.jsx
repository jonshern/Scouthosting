// Events admin — calendar list + new event modal that picks from saved locations

const SAMPLE_EVENTS = [
  { id: "e1", title: "Court of Honor",                 date: "2026-05-11", time: "19:00", locationId: "l1", group: "Troop",    rsvp: 24 },
  { id: "e2", title: "Spring Camporee",                date: "2026-05-15", time: "16:00", locationId: "l2", group: "Troop",    rsvp: 31 },
  { id: "e3", title: "Place flags · Ft. Snelling",     date: "2026-05-23", time: "15:00", locationId: "l5", group: "Service",  rsvp: 18 },
  { id: "e4", title: "Committee Meeting",              date: "2026-05-26", time: "19:00", locationId: "l1", group: "Adults",   rsvp: 9  },
  { id: "e5", title: "PLC meeting",                    date: "2026-06-01", time: "18:30", locationId: "l1", group: "Youth",    rsvp: 7  },
  { id: "e6", title: "Personal Mgmt MB #2",            date: "2026-06-01", time: "19:00", locationId: "l1", group: "Merit",    rsvp: 12 },
  { id: "e7", title: "Boundary Waters trek",           date: "2026-07-19", time: "08:00", locationId: "l3", group: "High Adv.",rsvp: 8 },
];

const EventsAdmin = ({ locations, openEvent, setOpenEvent, events, setEvents }) => {
  const byMonth = {};
  events.forEach(e => {
    const d = new Date(e.date);
    const key = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    (byMonth[key] = byMonth[key] || []).push(e);
  });

  const locById = id => locations.find(l => l.id === id);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Calendar</span>
        <h1>Events</h1>
        <p className="lede">Schedule meetings, campouts, service projects. Each event ties to a saved location and pushes to the public calendar.</p>
      </div>
      <div style={{ padding: "0 28px 40px" }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="seg">
            <button className="on"><Icon name="list" /> List</button>
            <button><Icon name="calendar" /> Month</button>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-primary" onClick={() => setOpenEvent({ mode: "new" })}>
            <Icon name="plus" /> New event
          </button>
        </div>

        {Object.entries(byMonth).map(([month, list]) => (
          <div key={month} className="mt-3">
            <div className="serif" style={{ fontSize: 18, color: "var(--ink-2)", marginBottom: 8 }}>{month}</div>
            <div className="card" style={{ overflow: "hidden" }}>
              {list.map((e, i) => {
                const loc = locById(e.locationId);
                const d = new Date(e.date + "T" + e.time);
                return (
                  <div key={e.id} onClick={() => setOpenEvent({ mode: "edit", id: e.id })}
                    style={{ display: "grid", gridTemplateColumns: "70px 1fr auto auto auto", gap: 14, padding: "12px 16px", borderBottom: i < list.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer", alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.1em", color: "var(--accent)", textTransform: "uppercase" }}>{d.toLocaleString("en-US", { month: "short", weekday: "short" })}</div>
                      <div className="serif" style={{ fontSize: 24, lineHeight: 1 }}>{d.getDate()}</div>
                    </div>
                    <div>
                      <div className="serif" style={{ fontSize: 16 }}>{e.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                        {e.time} · <Icon name="map" size={11} className="ico" style={{ display: "inline", verticalAlign: "-1px" }} /> {loc ? loc.name : "—"}
                      </div>
                    </div>
                    <span className="tag">{e.group}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{e.rsvp} RSVPs</span>
                    <Icon name="right" />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {openEvent && (
        <EventDrawer
          mode={openEvent.mode}
          event={openEvent.id ? events.find(e => e.id === openEvent.id) : null}
          locations={locations}
          onClose={() => setOpenEvent(null)}
          onSave={ev => {
            if (openEvent.mode === "new") setEvents([...events, { ...ev, id: "e" + Math.random().toString(36).slice(2, 6) }]);
            else setEvents(events.map(x => x.id === ev.id ? ev : x));
            setOpenEvent(null);
          }}
        />
      )}
    </>
  );
};

const EventDrawer = ({ mode, event, locations, onClose, onSave }) => {
  const [draft, setDraft] = React.useState(event || { title: "", date: "2026-05-15", time: "19:00", locationId: locations[0]?.id, group: "Troop", rsvp: 0, description: "" });
  const [locPickerOpen, setLocPickerOpen] = React.useState(false);
  const set = p => setDraft({ ...draft, ...p });
  const loc = locations.find(l => l.id === draft.locationId);
  const isNew = mode === "new";

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: "min(640px, 96vw)" }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">§ Calendar</span>
            <h3 style={{ marginTop: 2 }}>{isNew ? "New event" : draft.title || "Edit event"}</h3>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Title</label><input className="input" value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Spring Camporee" /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Date</label><input className="input mono" type="date" value={draft.date} onChange={e => set({ date: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Time</label><input className="input mono" type="time" value={draft.time} onChange={e => set({ time: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Group</label>
              <select className="select" value={draft.group} onChange={e => set({ group: e.target.value })}>
                <option>Troop</option><option>Patrol</option><option>Adults</option><option>Youth</option><option>Service</option><option>Merit</option><option>High Adv.</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Location</label>
            {loc ? (
              <div className="row" style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 8, gap: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: 6, backgroundImage: `url(${loc.photo})`, backgroundSize: "cover", backgroundPosition: "center", flex: "0 0 56px" }}></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="serif" style={{ fontSize: 14 }}>{loc.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{loc.addr} · {loc.distance} mi</div>
                </div>
                <button className="btn btn-sm" onClick={() => setLocPickerOpen(true)}>Change</button>
              </div>
            ) : (
              <button className="btn" onClick={() => setLocPickerOpen(true)}><Icon name="map" /> Pick location</button>
            )}
          </div>

          <div className="field"><label>Description</label><textarea className="textarea" rows={3} value={draft.description} onChange={e => set({ description: e.target.value })} placeholder="What scouts should bring, who's leading, etc." /></div>

          <div className="row mt-1" style={{ gap: 14, color: "var(--muted)", fontSize: 12.5 }}>
            <span><input type="checkbox" defaultChecked /> Notify members</span>
            <span><input type="checkbox" defaultChecked /> Show on public calendar</span>
            <span><input type="checkbox" /> Collect RSVPs</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn">Save as draft</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="check" /> {isNew ? "Create event" : "Save"}</button>
        </div>
      </div>

      {locPickerOpen && (
        <LocationPicker
          locations={locations}
          onPick={id => { set({ locationId: id }); setLocPickerOpen(false); }}
          onClose={() => setLocPickerOpen(false)}
          selected={draft.locationId}
        />
      )}
    </div>
  );
};

const LocationPicker = ({ locations, onPick, onClose, selected }) => {
  const [q, setQ] = React.useState("");
  const filtered = locations.filter(l => !q || l.name.toLowerCase().includes(q.toLowerCase()) || l.addr.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 250 }}>
      <div className="modal" style={{ width: "min(560px, 96vw)" }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Pick a location</h3>
          <span className="spacer"></span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ background: "var(--bg)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "0 10px", height: 34, gap: 8 }}>
            <Icon name="search" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} style={{ border: 0, outline: 0, background: "transparent", flex: 1, fontSize: 13 }} placeholder="Search saved locations…" />
          </div>
        </div>
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {filtered.map(l => (
            <div key={l.id} onClick={() => onPick(l.id)} className="row" style={{
              padding: 10, gap: 10, cursor: "pointer",
              borderBottom: "1px solid var(--line)",
              background: selected === l.id ? "var(--accent-soft)" : "transparent"
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 6, backgroundImage: `url(${l.photo})`, backgroundSize: "cover", backgroundPosition: "center" }}></div>
              <div style={{ flex: 1 }}>
                <div className="serif" style={{ fontSize: 14 }}>{l.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{l.type} · {l.distance} mi · {l.addr}</div>
              </div>
              {selected === l.id && <Icon name="check" />}
            </div>
          ))}
          {filtered.length === 0 && <div className="empty" style={{ margin: 16 }}>No matches</div>}
        </div>
        <div className="modal-foot">
          <span style={{ marginRight: "auto", fontSize: 12, color: "var(--muted)" }}>Can't find it?</span>
          <button className="btn btn-primary" onClick={() => { onClose(); setTimeout(() => window.dispatchEvent(new CustomEvent("open-new-location")), 50); }}>
            <Icon name="plus" /> Create new location
          </button>
        </div>
      </div>
    </div>
  );
};

window.EventsAdmin = EventsAdmin;
window.SAMPLE_EVENTS = SAMPLE_EVENTS;
