// Simple editor — refined Compass-style form view of the page

const BLOCK_TYPES = [
  { id: "text",    label: "Text",     icon: "type",     summary: b => b.heading || (b.body || "").slice(0, 60) },
  { id: "image",   label: "Image",    icon: "image",    summary: b => b.caption || "Image block" },
  { id: "events",  label: "Events",   icon: "events",   summary: () => "Auto · upcoming 6 events from calendar" },
  { id: "photos",  label: "Photos",   icon: "photos",   summary: () => "Auto · most recent 8 photos" },
  { id: "posts",   label: "Posts",    icon: "posts",    summary: () => "Auto · 3 most recent posts" },
  { id: "cta",     label: "CTA",      icon: "cta",      summary: b => b.heading + " — " + (b.label || "") },
  { id: "contact", label: "Contact",  icon: "mail",     summary: () => "Scoutmaster · meeting time · address" },
  { id: "faq",     label: "FAQ",      icon: "faq",      summary: b => `${(b.items || []).length} questions` },
  { id: "divider", label: "Divider",  icon: "divider",  summary: () => "Horizontal rule" },
];

const blockMeta = id => BLOCK_TYPES.find(b => b.id === id) || { label: id, summary: () => "" };

const SimpleEditor = ({ hero, setHero, blocks, setBlocks, onOpenAdvanced, expandedId, setExpandedId, toast }) => {
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };
  const remove = i => {
    setBlocks(blocks.filter((_, k) => k !== i));
    toast("Block removed");
  };
  const update = (i, patch) => {
    const next = blocks.slice();
    next[i] = { ...next[i], ...patch };
    setBlocks(next);
  };
  const add = type => {
    const id = "b" + Math.random().toString(36).slice(2, 7);
    const presets = {
      text:    { heading: "New section", body: "Write something compelling here." },
      image:   { url: PHOTO_URLS[2], caption: "" },
      cta:     { heading: "Curious? Come visit.", body: "Any Scout-aged youth is welcome to drop in.", label: "Email the leader", href: "mailto:scoutmaster@example.org" },
      faq:     { items: [{ q: "When do you meet?", a: "Mondays at 7." }] },
      divider: {}, events: {}, photos: {}, posts: {}, contact: {},
    };
    setBlocks([...blocks, { id, type, ...presets[type] }]);
    setExpandedId(id);
    toast(`Added ${type}`);
  };

  return (
    <div>
      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <span className="eyebrow">§ Site</span>
        <h1>Site hero</h1>
        <p className="lede">The headline + subhead at the top of your unit's public site. Keep it short — most visitors only read this far.</p>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="field">
            <label>Headline</label>
            <input className="input" value={hero.headline} onChange={e => setHero({ ...hero, headline: e.target.value })} />
          </div>
          <div className="field">
            <label>Subhead</label>
            <textarea className="textarea" value={hero.subhead} onChange={e => setHero({ ...hero, subhead: e.target.value })} />
            <span className="hint">Visitors see this above the fold. Aim for 1–2 sentences.</span>
          </div>
          <div className="row">
            <button className="btn btn-primary"><Icon name="save" /> Save hero</button>
            <span className="tag">Auto-saved 14s ago</span>
          </div>
        </div>
      </div>

      <div className="page-head" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 30 }}>
        <h1 style={{ fontSize: 26 }}>Page canvas</h1>
        <p className="lede">Blocks render below the hero in this order. Click a block to edit; drag to reorder.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {blocks.map((b, i) => {
          const meta = blockMeta(b.type);
          const expanded = expandedId === b.id;
          return (
            <div key={b.id} className="card" style={{ padding: 0 }}>
              <div className="block-row" onClick={() => setExpandedId(expanded ? null : b.id)} style={{ border: "none", borderRadius: expanded ? "10px 10px 0 0" : "10px", cursor: "pointer" }}>
                <span className="grip" onClick={e => e.stopPropagation()}><Icon name="drag" /></span>
                <span className="b-type"><Icon name={meta.icon} size={11} className="ico" style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} /> {meta.label}</span>
                <span className="b-summary">{meta.summary(b)}</span>
                <div className="b-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm btn-ghost btn-icon" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><Icon name="up" /></button>
                  <button className="btn btn-sm btn-ghost btn-icon" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} title="Move down"><Icon name="down" /></button>
                  <button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(i)} title="Delete"><Icon name="trash" /></button>
                  <button className="btn btn-sm btn-ghost btn-icon" title={expanded ? "Collapse" : "Expand"}>
                    <Icon name={expanded ? "up" : "down"} />
                  </button>
                </div>
              </div>
              {expanded && (
                <div style={{ padding: "16px 18px", borderTop: "1px dashed var(--line)" }}>
                  <BlockEditor block={b} onChange={patch => update(i, patch)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3" style={{ background: "var(--surface)", border: "1px dashed var(--line-2)", borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontFamily: "var(--serif)", fontStyle: "italic" }}>+ add block</div>
        <div className="adders">
          {BLOCK_TYPES.map(t => (
            <button key={t.id} className="btn btn-sm" onClick={() => add(t.id)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="divider"></div>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn"><Icon name="save" /> Save draft</button>
        <button className="btn btn-accent"><Icon name="publish" /> Publish</button>
        <button className="btn btn-ghost"><Icon name="undo" /> Revert draft</button>
        <span className="spacer"></span>
        <button className="btn btn-ghost" onClick={onOpenAdvanced}>
          Open in advanced editor <Icon name="right" />
        </button>
      </div>
    </div>
  );
};

// Per-block editor — fields depend on type
const BlockEditor = ({ block, onChange }) => {
  switch (block.type) {
    case "text":
      return (
        <>
          <div className="field">
            <label>Heading <span className="tag" style={{ marginLeft: 6 }}>optional</span></label>
            <input className="input" value={block.heading || ""} onChange={e => onChange({ heading: e.target.value })} placeholder="e.g. About our troop" />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea className="textarea" rows={5} value={block.body || ""} onChange={e => onChange({ body: e.target.value })} />
            <span className="hint">Plain text + paragraph breaks. URLs auto-link.</span>
          </div>
        </>
      );
    case "image":
      return (
        <>
          <div className="field">
            <label>Image</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 88, height: 60, backgroundSize: "cover", backgroundPosition: "center", borderRadius: 6, backgroundImage: `url(${block.url})`, border: "1px solid var(--line)" }}></div>
              <button className="btn btn-sm"><Icon name="image" /> Replace</button>
              <button className="btn btn-sm btn-ghost"><Icon name="trash" /></button>
            </div>
          </div>
          <div className="field">
            <label>Caption</label>
            <input className="input" value={block.caption || ""} onChange={e => onChange({ caption: e.target.value })} />
          </div>
        </>
      );
    case "cta":
      return (
        <>
          <div className="field"><label>Heading</label><input className="input" value={block.heading || ""} onChange={e => onChange({ heading: e.target.value })} /></div>
          <div className="field"><label>Body</label><input className="input" value={block.body || ""} onChange={e => onChange({ body: e.target.value })} /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Button label</label><input className="input" value={block.label || ""} onChange={e => onChange({ label: e.target.value })} /></div>
            <div className="field" style={{ flex: 2 }}><label>Link</label><input className="input mono" value={block.href || ""} onChange={e => onChange({ href: e.target.value })} /></div>
          </div>
        </>
      );
    case "faq":
      return (
        <div>
          {(block.items || []).map((it, i) => (
            <div key={i} className="row" style={{ alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <div className="col" style={{ flex: 1 }}>
                <input className="input" value={it.q} onChange={e => {
                  const items = block.items.slice(); items[i] = { ...it, q: e.target.value }; onChange({ items });
                }} placeholder="Question" />
                <textarea className="textarea" rows={2} value={it.a} onChange={e => {
                  const items = block.items.slice(); items[i] = { ...it, a: e.target.value }; onChange({ items });
                }} placeholder="Answer" />
              </div>
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => onChange({ items: block.items.filter((_, k) => k !== i) })}><Icon name="trash" /></button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => onChange({ items: [...(block.items || []), { q: "", a: "" }] })}>
            <Icon name="plus" /> Add question
          </button>
        </div>
      );
    case "events":
    case "photos":
    case "posts":
    case "contact":
      return (
        <div className="empty" style={{ padding: 14, textAlign: "left", display: "flex", gap: 12, alignItems: "center" }}>
          <Icon name="info" />
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            This block pulls from your unit's <strong>{block.type}</strong> automatically. Manage the source content from the sidebar.
          </div>
        </div>
      );
    case "divider":
      return <div className="empty" style={{ padding: 10 }}>Renders a horizontal rule.</div>;
    default:
      return null;
  }
};

window.SimpleEditor = SimpleEditor;
window.BLOCK_TYPES = BLOCK_TYPES;
window.blockMeta = blockMeta;
