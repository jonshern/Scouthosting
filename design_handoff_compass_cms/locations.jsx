// Locations admin — list + drawer to add/edit, with map preview

const SAMPLE_LOCATIONS = [
  { id: "l1", name: "St. Paul Lutheran Church",   addr: "850 Wilcox Ave, New Hope, MN 55427",        type: "Meeting",   distance: 0.8,  phone: "(763) 555-0100", website: "https://stpaul-newhope.org",       lat: "45.038", lng: "-93.387", photo: PHOTO_URLS[6], tags: ["weekly", "primary"] },
  { id: "l2", name: "Tomahawk Scout Reservation", addr: "Birchwood, WI 54817",                       type: "Camp",      distance: 145,  phone: "(715) 555-0144", website: "https://tomahawk.northernstar.org", lat: "45.665", lng: "-91.557", photo: PHOTO_URLS[0], tags: ["summer", "council"] },
  { id: "l3", name: "Boundary Waters — Entry 38", addr: "Sawbill Lake, MN 55613",                    type: "Trailhead", distance: 220,  phone: "—",              website: "https://recreation.gov",            lat: "47.860", lng: "-90.886", photo: PHOTO_URLS[1], tags: ["high adventure"] },
  { id: "l4", name: "Phalen Park Pavilion",       addr: "1615 Phalen Dr, St. Paul, MN 55106",        type: "Outdoor",   distance: 12,   phone: "(651) 555-0186", website: "—",                                lat: "44.991", lng: "-93.061", photo: PHOTO_URLS[2], tags: ["day-use"] },
  { id: "l5", name: "Fort Snelling Nat'l Cem.",   addr: "7601 34th Ave S, Minneapolis, MN 55450",    type: "Service",   distance: 18,   phone: "(612) 555-0140", website: "—",                                lat: "44.881", lng: "-93.198", photo: PHOTO_URLS[3], tags: ["service", "memorial day"] },
  { id: "l6", name: "Philmont Scout Ranch",       addr: "17 Deer Run Rd, Cimarron, NM 87714",        type: "High Adv.", distance: 1180, phone: "(575) 555-1818", website: "https://philmontscoutranch.org",   lat: "36.461", lng: "-104.940", photo: PHOTO_URLS[4], tags: ["high adventure"] },
  { id: "l7", name: "Camp Wilderness",            addr: "27538 Boy Scout Camp Rd, Park Rapids, MN",  type: "Camp",      distance: 196,  phone: "(218) 555-0177", website: "—",                                lat: "47.034", lng: "-95.034", photo: PHOTO_URLS[5], tags: ["winter ok"] },
];

const LocationsAdmin = ({ locations, setLocations, openDrawer, setOpenDrawer }) => {
  const [filter, setFilter] = React.useState("All");
  const types = ["All", "Meeting", "Camp", "Outdoor", "Service", "Trailhead", "High Adv."];
  const filtered = locations.filter(l => filter === "All" || l.type === filter);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Calendar</span>
        <h1>Event locations</h1>
        <p className="lede">Save the places your unit returns to. Once a location exists here, it auto-completes when you schedule events.</p>
      </div>
      <div style={{ padding: "0 28px 40px" }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="row" style={{ background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "0 10px", height: 32, gap: 8, width: 280 }}>
            <Icon name="search" />
            <input style={{ border: 0, outline: 0, background: "transparent", flex: 1, fontSize: 13 }} placeholder="Search locations…" />
          </div>
          <div className="seg">
            {types.map(t => (
              <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
            ))}
          </div>
          <span className="spacer"></span>
          <button className="btn"><Icon name="map" /> Map view</button>
          <button className="btn btn-primary" onClick={() => setOpenDrawer({ mode: "new" })}>
            <Icon name="plus" /> New location
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(l => (
            <div key={l.id} className="card" style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => setOpenDrawer({ mode: "edit", id: l.id })}>
              <div style={{ height: 120, backgroundImage: `url(${l.photo})`, backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
                <span className="pill" style={{ position: "absolute", top: 10, left: 10, background: "rgba(255,255,255,0.92)" }}>
                  <Icon name="map" size={11} /> {l.type}
                </span>
                <span className="tag mono" style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)" }}>
                  {l.distance < 1 ? "<1 mi" : `${l.distance} mi`}
                </span>
              </div>
              <div className="card-body" style={{ padding: 14 }}>
                <div className="serif" style={{ fontSize: 17, marginBottom: 4 }}>{l.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8, lineHeight: 1.4 }}>{l.addr}</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                  {l.tags.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            </div>
          ))}
          <div className="empty" style={{ minHeight: 220, display: "grid", placeItems: "center", cursor: "pointer" }} onClick={() => setOpenDrawer({ mode: "new" })}>
            <div>
              <Icon name="plus" size={20} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Add a location</div>
            </div>
          </div>
        </div>

        <div className="mt-3 row" style={{ color: "var(--muted)", fontSize: 12 }}>
          <Icon name="info" />
          <span>Locations also appear in the public site's map widget. Pin a location to your nav from its detail page.</span>
        </div>
      </div>

      {openDrawer && (
        <LocationDrawer
          mode={openDrawer.mode}
          location={openDrawer.id ? locations.find(l => l.id === openDrawer.id) : null}
          onClose={() => setOpenDrawer(null)}
          onSave={loc => {
            if (openDrawer.mode === "new") setLocations([...locations, { ...loc, id: "l" + Math.random().toString(36).slice(2, 6) }]);
            else setLocations(locations.map(l => l.id === loc.id ? loc : l));
            setOpenDrawer(null);
          }}
          onDelete={id => { setLocations(locations.filter(l => l.id !== id)); setOpenDrawer(null); }}
        />
      )}
    </>
  );
};

const LocationDrawer = ({ mode, location, onClose, onSave, onDelete }) => {
  const [draft, setDraft] = React.useState(location || {
    name: "", type: "Camp", addr: "", phone: "", website: "", lat: "", lng: "", distance: 0, tags: [], photo: PHOTO_URLS[7]
  });
  const set = patch => setDraft({ ...draft, ...patch });
  const isNew = mode === "new";

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: "min(880px, 96vw)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">§ Calendar / Locations</span>
            <h3 style={{ marginTop: 2 }}>{isNew ? "New location" : draft.name}</h3>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body" style={{ overflow: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <div className="field"><label>Location name</label><input className="input" value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Tomahawk Scout Reservation" /></div>
            <div className="field"><label>Type</label>
              <select className="select" value={draft.type} onChange={e => set({ type: e.target.value })}>
                <option>Meeting</option><option>Camp</option><option>Outdoor</option><option>Service</option><option>Trailhead</option><option>High Adv.</option>
              </select>
            </div>
            <div className="field"><label>Description</label><textarea className="textarea" rows={3} value={draft.description || ""} onChange={e => set({ description: e.target.value })} placeholder="A few sentences about this place — what makes it useful for your unit?" /></div>
            <div className="field"><label>Address</label><input className="input" value={draft.addr} onChange={e => set({ addr: e.target.value })} /></div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Phone</label><input className="input" value={draft.phone} onChange={e => set({ phone: e.target.value })} /></div>
              <div className="field" style={{ flex: 1 }}><label>Distance (mi)</label><input className="input mono" type="number" value={draft.distance} onChange={e => set({ distance: Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label>Website</label><input className="input mono" value={draft.website} onChange={e => set({ website: e.target.value })} /></div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Latitude</label><input className="input mono" value={draft.lat} onChange={e => set({ lat: e.target.value })} /></div>
              <div className="field" style={{ flex: 1 }}><label>Longitude</label><input className="input mono" value={draft.lng} onChange={e => set({ lng: e.target.value })} /></div>
            </div>
            <button className="btn btn-sm"><Icon name="map" /> Find map location</button>
          </div>
          <div>
            <div className="field"><label>Photo</label>
              <div style={{ height: 160, backgroundImage: `url(${draft.photo})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: 8, border: "1px solid var(--line)" }}></div>
              <div className="row mt-1"><button className="btn btn-sm">Replace</button><button className="btn btn-sm btn-ghost">Browse media</button></div>
            </div>
            <div className="field"><label>Map preview</label>
              <div style={{
                height: 200, borderRadius: 8, border: "1px solid var(--line)",
                background: "linear-gradient(135deg, #e6efe1 0%, #d9e8d3 100%)",
                position: "relative", overflow: "hidden",
              }}>
                {/* Stylized topo */}
                <svg viewBox="0 0 200 100" width="100%" height="100%" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, opacity: 0.4 }}>
                  {[...Array(10)].map((_, i) => (
                    <path key={i} d={`M 0 ${50 + Math.sin(i) * 20} Q 50 ${30 + i * 4} 100 ${50 + Math.cos(i) * 18} T 200 ${50 + Math.sin(i + 1) * 20}`} fill="none" stroke="#5b7a4a" strokeWidth="0.4" />
                  ))}
                </svg>
                <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)" }}>
                  <svg width="28" height="34" viewBox="0 0 28 34"><path d="M14 0 C6 0 0 6 0 14 C0 24 14 34 14 34 C14 34 28 24 28 14 C28 6 22 0 14 0 Z" fill="#1d3a8a"/><circle cx="14" cy="13" r="5" fill="#fff"/></svg>
                </div>
                <div className="mono" style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(255,255,255,0.85)", padding: "2px 6px", borderRadius: 4, fontSize: 10.5, color: "var(--ink-2)" }}>
                  {draft.lat || "—"}, {draft.lng || "—"}
                </div>
              </div>
            </div>
            <div className="field"><label>Tags</label>
              <div className="row" style={{ flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {(draft.tags || []).map(t => (
                  <span key={t} className="tag" onClick={() => set({ tags: draft.tags.filter(x => x !== t) })} style={{ cursor: "pointer" }}>
                    {t} <Icon name="x" size={9} className="ico" style={{ marginLeft: 4 }} />
                  </span>
                ))}
              </div>
              <input className="input" placeholder="Add tag, press Enter" onKeyDown={e => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  set({ tags: [...(draft.tags || []), e.currentTarget.value.trim()] });
                  e.currentTarget.value = "";
                }
              }} />
            </div>
            <div className="field">
              <label>Show on public site</label>
              <div className="seg" style={{ width: "fit-content" }}>
                <button className="on">Yes</button>
                <button>No</button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {!isNew && <button className="btn btn-ghost" style={{ color: "#a33", marginRight: "auto" }} onClick={() => onDelete(draft.id)}><Icon name="trash" /> Delete</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)}><Icon name="save" /> {isNew ? "Create location" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
};

window.LocationsAdmin = LocationsAdmin;
window.LocationDrawer = LocationDrawer;
window.SAMPLE_LOCATIONS = SAMPLE_LOCATIONS;
