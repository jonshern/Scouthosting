// Other screens — pages list, media library, settings, history, publish modal

const PagesList = ({ onOpen, onNewPage }) => {
  const pages = [
    { name: "Home", slug: "/", status: "live", updated: "2h ago", views: "1.2k", nav: "yes" },
    { name: "Our History", slug: "/p/history", status: "live", updated: "yesterday", views: "184", nav: "yes" },
    { name: "Forms & Documents", slug: "/p/forms-and-documents", status: "live", updated: "3 days ago", views: "412", nav: "yes" },
    { name: "FAQ", slug: "/p/faq", status: "draft", updated: "5 min ago", views: "—", nav: "yes" },
    { name: "Our Leaders", slug: "/p/our-leaders", status: "live", updated: "last week", views: "298", nav: "yes" },
    { name: "Resource Links", slug: "/p/resources", status: "live", updated: "last week", views: "127", nav: "yes" },
    { name: "Eagle Project Archive", slug: "/p/eagles", status: "private", updated: "Apr 12", views: "—", nav: "no" },
  ];

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Site</span>
        <h1>Pages</h1>
        <p className="lede">Each page lives at a unique URL. The home page is always your hero + canvas; custom pages can be linked from the nav.</p>
      </div>
      <div style={{ padding: "0 28px 40px" }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="row" style={{ background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "0 10px", height: 32, gap: 8, width: 280 }}>
            <Icon name="search" />
            <input style={{ border: 0, outline: 0, background: "transparent", flex: 1, fontSize: 13 }} placeholder="Search pages…" />
          </div>
          <div className="seg">
            <button className="on">All</button>
            <button>Live</button>
            <button>Drafts</button>
            <button>Private</button>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-primary" onClick={onNewPage}><Icon name="plus" /> New page</button>
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <table className="pages-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Updated</th>
                <th>30d views</th>
                <th>In nav</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, i) => (
                <tr key={i}>
                  <td><span className="name">{p.name}</span></td>
                  <td><span className="slug">{p.slug}</span></td>
                  <td><span className={"pill " + p.status}><span className="dot"></span>{p.status[0].toUpperCase() + p.status.slice(1)}</span></td>
                  <td style={{ color: "var(--muted)" }}>{p.updated}</td>
                  <td style={{ color: "var(--muted)" }}>{p.views}</td>
                  <td style={{ color: p.nav === "yes" ? "var(--ink)" : "var(--muted-2)" }}>{p.nav === "yes" ? <Icon name="check" /> : <Icon name="minus" />}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-sm" onClick={onOpen}><Icon name="edit" /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 row" style={{ color: "var(--muted)", fontSize: 12 }}>
          <Icon name="info" />
          <span>Custom page URLs live at <span className="mono" style={{ background: "var(--bg-2)", padding: "1px 5px", borderRadius: 3 }}>/p/&lt;slug&gt;</span>. Toggle visibility from each page's settings.</span>
        </div>
      </div>
    </>
  );
};

const MediaLibrary = () => {
  const photos = PHOTO_URLS.concat(PHOTO_URLS).concat(PHOTO_URLS).slice(0, 18);
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">§ Site</span>
        <h1>Media</h1>
        <p className="lede">142 files · 38 MB used of 5 GB. Drag and drop to upload. Editor blocks pull from this library.</p>
      </div>
      <div style={{ padding: "0 28px 40px" }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="seg">
            <button className="on">All</button>
            <button>Photos</button>
            <button>Documents</button>
            <button>Videos</button>
          </div>
          <span className="spacer"></span>
          <button className="btn"><Icon name="image" /> Upload</button>
          <button className="btn btn-primary"><Icon name="plus" /> New album</button>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 14, borderStyle: "dashed", background: "var(--bg-2)" }}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Icon name="image" size={20} />
            <div className="serif" style={{ fontSize: 16, marginTop: 8 }}>Drop files here</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>JPG, PNG, GIF, MP4, PDF · up to 100 MB each</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {photos.map((u, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, backgroundImage: `url(${u})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--line)", overflow: "hidden" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 8px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.6))", color: "#fff", fontSize: 10.5, fontFamily: "var(--mono)" }}>
                IMG_{(2810 + i).toString().padStart(4, "0")}.jpg
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const SiteSettings = () => (
  <>
    <div className="page-head">
      <span className="eyebrow">§ Site</span>
      <h1>Site editor</h1>
      <p className="lede">Site-wide settings — branding, navigation, theme, and what shows in your top menu.</p>
    </div>
    <div style={{ padding: "0 28px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-head"><h3>Brand</h3><span className="spacer"></span><span className="tag">unit-level</span></div>
        <div className="card-body">
          <div className="field"><label>Unit name</label><input className="input" defaultValue="Sample Troop 100" /></div>
          <div className="field"><label>Tagline</label><input className="input" defaultValue="Adventure, leadership, and the outdoors" /></div>
          <div className="field"><label>Charter org</label><input className="input" defaultValue="Example Charter Organization" /></div>
          <div className="field">
            <label>Logo</label>
            <div className="row">
              <div style={{ width: 56, height: 56, borderRadius: 12, background: "radial-gradient(circle at 30% 30%, #d8c98a, #c19a3a 60%, #6e4f12)", border: "1px solid var(--line)" }}></div>
              <button className="btn btn-sm">Replace</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Theme</h3></div>
        <div className="card-body">
          <div className="field">
            <label>Accent color</label>
            <div className="row" style={{ gap: 6 }}>
              {["#1d3a8a", "#0f5132", "#7a1e1e", "#5b3b87", "#c19a3a", "#1f1f1f"].map(c => (
                <div key={c} style={{ width: 28, height: 28, borderRadius: 6, background: c, border: c === "#1d3a8a" ? "2px solid #14171c" : "1px solid var(--line)", cursor: "pointer" }}></div>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Display font</label>
            <select className="select"><option>Source Serif 4</option><option>Crimson Pro</option><option>Newsreader</option><option>Fraunces</option></select>
          </div>
          <div className="field">
            <label>Body font</label>
            <select className="select"><option>Inter Tight</option><option>System UI</option><option>Söhne</option></select>
          </div>
          <div className="field">
            <label>Header style</label>
            <div className="seg" style={{ width: "fit-content" }}>
              <button className="on">Solid</button>
              <button>Photo banner</button>
              <button>Centered logo</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head"><h3>Navigation</h3><span className="spacer"></span><button className="btn btn-sm"><Icon name="plus" /> Add link</button></div>
        <div className="card-body">
          {["Calendar", "Photos", "Posts", "Our History", "Forms & Documents", "FAQ", "Our Leaders", "Resource Links"].map((l, i) => (
            <div key={i} className="row" style={{ padding: "8px 0", borderBottom: "1px dashed var(--line)" }}>
              <Icon name="drag" />
              <span style={{ fontFamily: "var(--serif)", fontSize: 14, width: 200 }}>{l}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>/{l.toLowerCase().replace(/\s+/g, "-").replace("&", "and")}</span>
              <span className="pill live"><span className="dot"></span>Visible</span>
              <button className="btn btn-sm btn-ghost btn-icon"><Icon name="more" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  </>
);

const PublishModal = ({ onClose, onPublish }) => (
  <div className="modal-bg" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <h3>Publish home page</h3>
        <span className="spacer"></span>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="modal-body">
        <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 13.5 }}>
          You're about to publish 7 changes to <span className="mono" style={{ color: "var(--ink)" }}>troop100.compass.host</span>. Visitors will see them within ~10 seconds.
        </p>
        <div className="card" style={{ background: "var(--bg)" }}>
          <div className="card-body">
            <div style={{ fontFamily: "var(--serif)", fontSize: 14, marginBottom: 8 }}>Changes since last publish</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.8 }}>
              <li>Hero subhead updated</li>
              <li>About Sample Troop 100 — text block reworded</li>
              <li>New CTA block: "Curious? Come visit."</li>
              <li>Photos block reordered (was #2, now #3)</li>
              <li>Events block — layout switched to 2-column grid</li>
              <li>3 new images added to media library</li>
            </ul>
          </div>
        </div>
        <div className="row mt-2" style={{ gap: 12 }}>
          <input type="checkbox" defaultChecked id="notify" />
          <label htmlFor="notify" style={{ fontSize: 13, color: "var(--ink-2)" }}>Notify committee chair when published</label>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn">Schedule…</button>
        <button className="btn btn-primary" onClick={onPublish}><Icon name="publish" /> Publish now</button>
      </div>
    </div>
  </div>
);

window.PagesList = PagesList;
window.MediaLibrary = MediaLibrary;
window.SiteSettings = SiteSettings;
window.PublishModal = PublishModal;
