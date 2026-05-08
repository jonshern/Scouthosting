// Root App — routing modeled on actual Compass: primary tab × admin tab

const { useState, useEffect, useRef } = React;

const INITIAL_HERO = {
  unit: "Sample Troop 100",
  headline: "Adventure, leadership, and the outdoors — since 2010.",
  subhead: "Welcome to Sample Troop 100 — based in Anytown, USA. We're a Troop unit chartered by Example Charter Organization.",
};

const INITIAL_BLOCKS = [
  { id: "b1", type: "text", heading: "About Sample Troop 100", body: "Sample Troop 100 is sponsored by Example Charter Organization in Anytown, USA. We've been serving Scout-aged youth since 2010, with weekly meetings on Mondays at 7 PM and at least one outing every month. Scouting is youth-led — adults coach, scouts lead." },
  { id: "b2", type: "events" },
  { id: "b3", type: "photos" },
  { id: "b4", type: "posts" },
  { id: "b5", type: "cta", heading: "Curious? Come visit.", body: "Any Scout-aged youth is welcome to drop in to a meeting. Email the leader and we'll save you a seat.", label: "Email the leader", href: "mailto:scoutmaster@example.org" },
  { id: "b6", type: "contact" },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfy",
  "accent": "#1d3a8a",
  "showInlineCoach": true
}/*EDITMODE-END*/;

// Resolve which screen to render from (primary, admin) pair.
// "admin" applies when primary === "overview"; for other primary tabs we route
// to that tab's own admin surface (Calendar -> Events / Locations, etc).
const resolveScreen = (primary, admin) => {
  if (primary === "overview") {
    // admin sub-mode chooses which Site admin surface
    return { kind: admin || "site" }; // site, pages, security, domain
  }
  if (primary === "calendar") {
    return { kind: admin === "locations" ? "locations" : "events" };
  }
  if (primary === "roster") return { kind: "roster" };
  if (primary === "messages") return { kind: "messages" };
  if (primary === "photos") return { kind: "photos" };
  if (primary === "forms") return { kind: "forms" };
  if (primary === "money") return { kind: "money" };
  return { kind: "site" };
};

const App = () => {
  const [primary, setPrimary] = useState("overview");
  const [admin, setAdmin] = useState("site");
  const [calendarTab, setCalendarTab] = useState("events"); // events | locations
  const [mode, setMode] = useState("simple");
  const [frame, setFrame] = useState("desktop");
  const [hero, setHero] = useState(INITIAL_HERO);
  const [blocks, setBlocks] = useState(INITIAL_BLOCKS);
  const [expandedId, setExpandedId] = useState("b5");
  const [selectedId, setSelectedId] = useState("hero");
  const [showPublish, setShowPublish] = useState(false);
  const [toast, setToast] = useState(null);
  const [locations, setLocations] = useState(SAMPLE_LOCATIONS);
  const [events, setEvents] = useState(SAMPLE_EVENTS);
  const [openLocationDrawer, setOpenLocationDrawer] = useState(null);
  const [openEvent, setOpenEvent] = useState(null);

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    document.documentElement.style.fontSize = t.density === "compact" ? "13px" : "14px";
  }, [t]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => setToast(null), 1800);
  };

  // Cross-screen deep link: from event drawer to "create new location"
  useEffect(() => {
    const fn = () => {
      setPrimary("calendar");
      setCalendarTab("locations");
      setOpenLocationDrawer({ mode: "new" });
    };
    window.addEventListener("open-new-location", fn);
    return () => window.removeEventListener("open-new-location", fn);
  }, []);

  const onAction = (a) => {
    if (a === "publish") setShowPublish(true);
    if (a === "preview") showToast("Public preview opened in new tab");
  };

  const handlePrimary = (id) => {
    setPrimary(id);
    if (id === "overview") setAdmin("site");
    setSelectedId("hero");
  };

  // For Calendar primary, the right-side tabs become Events / Locations
  const calendarAdminTabs = primary === "calendar"
    ? [{ id: "events", label: "Events" }, { id: "locations", label: "Locations" }]
    : null;

  // Crumbs depend on current screen
  const screen = primary === "overview"
    ? admin
    : primary === "calendar" ? calendarTab
    : primary;

  const crumbs = (() => {
    switch (screen) {
      case "site":     return ["Overview", "Site editor"];
      case "pages":    return ["Overview", "Pages"];
      case "security": return ["Overview", "Security"];
      case "domain":   return ["Overview", "Domain"];
      case "events":   return ["Calendar", "Events"];
      case "locations":return ["Calendar", "Event locations"];
      case "roster":   return ["Roster"];
      case "messages": return ["Messages"];
      case "photos":   return ["Photos"];
      case "forms":    return ["Forms"];
      case "money":    return ["Money"];
      default:         return [primary];
    }
  })();

  // Action bar (publish/preview/mode toggle) only shows on the home editor
  const showEditorActionBar = screen === "site" && admin === "site";

  // Override AdminBar's right-side tabs when on Calendar
  const customAdminTabsBar = primary === "calendar" ? (
    <CalendarTabsBar tabs={calendarAdminTabs} active={calendarTab} onChange={setCalendarTab} />
  ) : null;

  return (
    <div className="app">
      <PublicSiteBar unit={hero.unit} />
      <AdminBar
        primary={primary}
        onPrimary={handlePrimary}
        admin={admin}
        onAdmin={setAdmin}
      />

      <main className="main">
        {customAdminTabsBar}

        {showEditorActionBar && (
          <ActionBar
            crumbs={crumbs}
            mode={mode}
            onMode={setMode}
            onAction={onAction}
            status={{ kind: "draft", label: "Draft · 7 changes" }}
            mobileFrame={mode === "simple" ? frame : null}
            onFrame={mode === "simple" ? setFrame : null}
          />
        )}

        {!showEditorActionBar && screen !== "site" && (
          <ActionBar
            crumbs={crumbs}
            onAction={onAction}
            status={primary === "overview" ? { kind: "live", label: "Live · troop100.compass.host" } : null}
          />
        )}

        {/* === Overview · Site editor (home page) === */}
        {screen === "site" && mode === "simple" && (
          <div className="work">
            <div className="editor-col">
              <SimpleEditor
                hero={hero} setHero={setHero}
                blocks={blocks} setBlocks={setBlocks}
                expandedId={expandedId} setExpandedId={setExpandedId}
                onOpenAdvanced={() => setMode("advanced")}
                toast={showToast}
              />
            </div>
            <div className="preview-col">
              <div className="preview-toolbar">
                <span className="tag">Live preview</span>
                <div className="url"><Icon name="lock" className="ico lock" /> troop100.compass.host</div>
              </div>
              <div className={"frame " + frame}>
                <PublicPreview hero={hero} blocks={blocks} />
              </div>
            </div>
          </div>
        )}
        {screen === "site" && mode === "advanced" && (
          <AdvancedEditor
            hero={hero} setHero={setHero}
            blocks={blocks} setBlocks={setBlocks}
            selectedId={selectedId} setSelectedId={setSelectedId}
            frame={frame}
            toast={showToast}
          />
        )}

        {/* === Overview · Pages, Security, Domain === */}
        {screen === "pages" && <PagesList onOpen={() => { setAdmin("site"); }} onNewPage={() => showToast("Creating new page…")} />}
        {screen === "security" && <SecurityAdmin toast={showToast} />}
        {screen === "domain" && <ComingSoon area="Overview" title="Domain" lede="Connect a custom domain to your unit's public site." />}

        {/* === Calendar === */}
        {screen === "events" && (
          <EventsAdmin
            locations={locations}
            openEvent={openEvent} setOpenEvent={setOpenEvent}
            events={events} setEvents={setEvents}
          />
        )}
        {screen === "locations" && (
          <LocationsAdmin
            locations={locations} setLocations={setLocations}
            openDrawer={openLocationDrawer} setOpenDrawer={setOpenLocationDrawer}
          />
        )}

        {/* === Other primary tabs === */}
        {screen === "roster"   && <RosterAdmin toast={toast} />}
        {screen === "messages" && <ComingSoon area="Messages" title="Messages" lede="Email and push the troop, a patrol, or a custom audience." />}
        {screen === "photos"   && <ComingSoon area="Photos"   title="Photo albums" lede="Albums per event. Upload, caption, and publish to the public site." />}
        {screen === "forms"    && <ComingSoon area="Forms"    title="Forms"    lede="Permission slips, RSVPs, and signups — all in one place." />}
        {screen === "money"    && <ComingSoon area="Money"    title="Money"    lede="Troop accounts, scout balances, and reimbursements." />}
      </main>

      {showPublish && (
        <PublishModal
          onClose={() => setShowPublish(false)}
          onPublish={() => { setShowPublish(false); showToast("Published to troop100.compass.host"); }}
        />
      )}

      {toast && <div className="toast"><Icon name="check" /> {toast}</div>}

      <TweaksPanel>
        <TweakSection label="Display" />
        <TweakRadio label="Density" value={t.density} options={["comfy", "compact"]} onChange={v => setTweak("density", v)} />
        <TweakColor label="Accent" value={t.accent} onChange={v => setTweak("accent", v)} options={["#1d3a8a", "#0f5132", "#7a1e1e", "#5b3b87", "#c19a3a", "#1f1f1f"]} />
        <TweakToggle label="Inline coach hints" value={t.showInlineCoach} onChange={v => setTweak("showInlineCoach", v)} />
        <TweakSection label="Jump to" />
        <TweakButton onClick={() => { setPrimary("overview"); setAdmin("site"); setMode("simple"); }}>Site · Simple editor</TweakButton>
        <TweakButton onClick={() => { setPrimary("overview"); setAdmin("site"); setMode("advanced"); }}>Site · Advanced editor</TweakButton>
        <TweakButton onClick={() => { setPrimary("overview"); setAdmin("pages"); }}>Pages list</TweakButton>
        <TweakButton onClick={() => { setPrimary("calendar"); setCalendarTab("events"); }}>Calendar · Events</TweakButton>
        <TweakButton onClick={() => { setPrimary("calendar"); setCalendarTab("locations"); }}>Calendar · Locations</TweakButton>
        <TweakButton onClick={() => setShowPublish(true)}>Publish modal</TweakButton>
      </TweaksPanel>
    </div>
  );
};

// Calendar gets its own secondary tabs between admin bar and content
const CalendarTabsBar = ({ tabs, active, onChange }) => (
  <div className="cal-tabs">
    {tabs.map(t => (
      <button
        key={t.id}
        className={"cal-tab" + (active === t.id ? " active" : "")}
        onClick={() => onChange(t.id)}
      >
        {t.label}
      </button>
    ))}
  </div>
);

const ComingSoon = ({ area, title, lede }) => (
  <>
    <div className="page-head">
      <span className="eyebrow">§ {area}</span>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </div>
    <div style={{ padding: "0 28px 60px" }}>
      <div className="empty" style={{ padding: 36, textAlign: "center" }}>
        <Icon name="compass" size={20} />
        <div className="serif" style={{ fontSize: 16, marginTop: 8 }}>Not yet wired up in this prototype</div>
        <div style={{ fontSize: 12.5, marginTop: 4, color: "var(--muted)" }}>The fully designed sections in this build: Overview (Site, Pages), Calendar (Events, Locations).</div>
      </div>
    </div>
  </>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
