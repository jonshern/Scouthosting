// Compass admin shell — public-site bar + admin tabs (no left sidebar)

const PublicSiteBar = ({ unit }) => (
  <div className="psb">
    <div className="psb-inner">
      <span className="psb-brand">{unit}</span>
      <nav className="psb-nav">
        <a>Calendar</a>
        <a>Photos</a>
        <a>Posts</a>
        <a>Our History</a>
        <a>Forms &amp; Documents</a>
        <a>FAQ</a>
        <a>Our Leaders</a>
        <a>Resource Links</a>
        <a className="active">Admin</a>
      </nav>
    </div>
  </div>
);

const PRIMARY_TABS = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "calendar", label: "Calendar", icon: "events" },
  { id: "roster", label: "Roster", icon: "roster" },
  { id: "messages", label: "Messages", icon: "mail" },
  { id: "photos", label: "Photos", icon: "photos" },
  { id: "forms", label: "Forms", icon: "forms" },
  { id: "money", label: "Money", icon: "cta" },
];

const ADMIN_TABS = [
  { id: "site", label: "Site" },
  { id: "pages", label: "Pages" },
  { id: "security", label: "Security" },
  { id: "domain", label: "Domain" },
];

const AdminBar = ({ primary, onPrimary, admin, onAdmin }) => (
  <div className="adminbar">
    <div className="ab-left">
      <span className="ab-brand">Compass</span>
      <span className="ab-unit">TROOP 100</span>
      <nav className="ab-tabs">
        {PRIMARY_TABS.map(t => (
          <button
            key={t.id}
            className={"ab-tab" + (primary === t.id ? " active" : "")}
            onClick={() => onPrimary(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
    <div className="ab-right">
      <nav className="ab-admin">
        {ADMIN_TABS.map(t => (
          <button
            key={t.id}
            className={"ab-admin-tab" + (admin === t.id ? " active" : "")}
            onClick={() => onAdmin(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="ab-avatar">SC</div>
    </div>
  </div>
);

// Action bar — sits below the admin bars on edit screens
const ActionBar = ({ crumbs, mode, onMode, onAction, status, mobileFrame, onFrame }) => (
  <div className="actionbar">
    <div className="crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep">/</span>}
          <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
        </React.Fragment>
      ))}
    </div>

    {mode != null && (
      <div className="seg" style={{ marginLeft: 16 }}>
        <button className={mode === "simple" ? "on" : ""} onClick={() => onMode("simple")}>
          <Icon name="sliders" /> Simple
        </button>
        <button className={mode === "advanced" ? "on" : ""} onClick={() => onMode("advanced")}>
          <Icon name="zap" /> Advanced
        </button>
      </div>
    )}

    <div className="right">
      {onFrame && (
        <div className="seg">
          <button className={mobileFrame === "desktop" ? "on" : ""} onClick={() => onFrame("desktop")}><Icon name="desktop" /></button>
          <button className={mobileFrame === "tablet" ? "on" : ""} onClick={() => onFrame("tablet")}><Icon name="tablet" /></button>
          <button className={mobileFrame === "mobile" ? "on" : ""} onClick={() => onFrame("mobile")}><Icon name="phone" /></button>
        </div>
      )}
      {status && (
        <span className={"pill " + status.kind}>
          <span className="dot"></span>{status.label}
        </span>
      )}
      <button className="btn btn-ghost btn-icon" title="History"><Icon name="history" /></button>
      <button className="btn" onClick={() => onAction && onAction("preview")}>
        <Icon name="eye" /> Preview
      </button>
      <button className="btn btn-primary" onClick={() => onAction && onAction("publish")}>
        <Icon name="publish" /> Publish
      </button>
    </div>
  </div>
);

window.PublicSiteBar = PublicSiteBar;
window.AdminBar = AdminBar;
window.ActionBar = ActionBar;
window.PRIMARY_TABS = PRIMARY_TABS;
window.ADMIN_TABS = ADMIN_TABS;
