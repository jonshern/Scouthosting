// Public site preview component (lives inside the editor)

const PHOTO_URLS = [
  "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&q=70",
  "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=400&q=70",
  "https://images.unsplash.com/photo-1533873984035-25970ab07461?w=400&q=70",
  "https://images.unsplash.com/photo-1515224526905-51c7d77c6c34?w=400&q=70",
  "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?w=400&q=70",
  "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&q=70",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=70",
  "https://images.unsplash.com/photo-1496080174650-637e3f22fa03?w=400&q=70",
];

const PreviewBlock = ({ block }) => {
  switch (block.type) {
    case "text":
      return (
        <section className="pub-section">
          {block.heading && <h2>{block.heading}</h2>}
          <p style={{ whiteSpace: "pre-line" }}>{block.body}</p>
        </section>
      );
    case "events":
      return (
        <section className="pub-section">
          <h2>Upcoming events</h2>
          <div className="pub-events">
            {[
              { m: "May", d: "11", t: "Court of Honor", w: "Wed · 7:00 PM" },
              { m: "May", d: "15", t: "Spring Camporee", w: "Sun · 4:00 PM" },
              { m: "May", d: "23", t: "Place flags · Ft. Snelling", w: "Sat · 3:00 PM" },
              { m: "Jun", d: "01", t: "Committee Meeting", w: "Mon · 7:00 PM" },
            ].map((e, i) => (
              <div className="pub-event" key={i}>
                <div className="date"><div className="m">{e.m}</div><div className="d">{e.d}</div></div>
                <div className="ev-body">{e.t}<div className="who">{e.w}</div></div>
              </div>
            ))}
          </div>
        </section>
      );
    case "photos":
      return (
        <section className="pub-section">
          <h2>Recent photos</h2>
          <div className="pub-photos">
            {PHOTO_URLS.slice(0, 8).map((u, i) => (
              <div key={i} className="p" style={{ backgroundImage: `url(${u})` }}></div>
            ))}
          </div>
        </section>
      );
    case "posts":
      return (
        <section className="pub-section">
          <h2>From the troop</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { t: "Philmont 2026 — interest meeting", d: "Apr 28" },
              { t: "Welcome our new ASMs", d: "Apr 14" },
            ].map((p, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px dashed #f0eadb", fontFamily: "var(--sans)", fontSize: 13 }}>
                <strong>{p.t}</strong> <span style={{ color: "var(--muted)" }}>· {p.d}</span>
              </div>
            ))}
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="pub-cta">
          <h3>{block.heading}</h3>
          <p>{block.body}</p>
          <a href={block.href}>{block.label}</a>
        </section>
      );
    case "image":
      return (
        <section className="pub-section">
          <div style={{
            aspectRatio: "16/7",
            backgroundImage: `url(${block.url || PHOTO_URLS[0]})`,
            backgroundSize: "cover", backgroundPosition: "center",
            borderRadius: 10
          }}></div>
          {block.caption && <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>{block.caption}</div>}
        </section>
      );
    case "contact":
      return (
        <section className="pub-section">
          <h2>Contact</h2>
          <p>Scoutmaster · scoutmaster@example.org<br/>Meets Mondays · 7 PM · Example Charter Hall</p>
        </section>
      );
    default:
      return null;
  }
};

const PublicPreview = ({ hero, blocks }) => (
  <div className="pub">
    <nav className="pub-nav">
      <span className="pub-brand">{hero.unit || "Sample Troop 100"}</span>
      <a>Calendar</a><a>Photos</a><a>Posts</a><a>Our History</a><a>Forms</a>
    </nav>
    <header className="pub-hero">
      <h1>{hero.headline}</h1>
      <p>{hero.subhead}</p>
    </header>
    {blocks.map((b, i) => <PreviewBlock key={b.id} block={b} />)}
  </div>
);

window.PublicPreview = PublicPreview;
window.PreviewBlock = PreviewBlock;
window.PHOTO_URLS = PHOTO_URLS;
