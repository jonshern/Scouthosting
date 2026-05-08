// Advanced editor — block palette + canvas + inspector

const PALETTE = [
  { id: "text", label: "Text", icon: "type" },
  { id: "image", label: "Image", icon: "image" },
  { id: "events", label: "Events", icon: "events" },
  { id: "photos", label: "Photos", icon: "photos" },
  { id: "posts", label: "Posts", icon: "posts" },
  { id: "cta", label: "CTA", icon: "cta" },
  { id: "contact", label: "Contact", icon: "mail" },
  { id: "faq", label: "FAQ", icon: "faq" },
  { id: "columns", label: "Columns", icon: "columns" },
  { id: "spacer", label: "Spacer", icon: "spacer" },
  { id: "divider", label: "Divider", icon: "divider" },
  { id: "video", label: "Video", icon: "video" },
  { id: "map", label: "Map", icon: "map" },
  { id: "html", label: "HTML", icon: "code" },
];

const AdvancedEditor = ({ hero, setHero, blocks, setBlocks, selectedId, setSelectedId, frame, toast }) => {
  const selected = selectedId === "hero"
    ? { type: "hero", ...hero }
    : blocks.find(b => b.id === selectedId);

  const updateSelected = patch => {
    if (selectedId === "hero") setHero({ ...hero, ...patch });
    else setBlocks(blocks.map(b => b.id === selectedId ? { ...b, ...patch } : b));
  };

  const remove = () => {
    if (selectedId === "hero") return;
    setBlocks(blocks.filter(b => b.id !== selectedId));
    setSelectedId(null);
    toast("Block deleted");
  };

  const duplicate = () => {
    if (selectedId === "hero") return;
    const i = blocks.findIndex(b => b.id === selectedId);
    if (i < 0) return;
    const copy = { ...blocks[i], id: "b" + Math.random().toString(36).slice(2, 7) };
    const next = blocks.slice();
    next.splice(i + 1, 0, copy);
    setBlocks(next);
    setSelectedId(copy.id);
    toast("Block duplicated");
  };

  const dropOnCanvas = type => {
    const id = "b" + Math.random().toString(36).slice(2, 7);
    const presets = {
      text: { heading: "New section", body: "Drag to reorder. Click to edit." },
      image: { url: PHOTO_URLS[1], caption: "" },
      cta: { heading: "Join us", body: "Drop in to a Monday meeting.", label: "Email", href: "mailto:scoutmaster@example.org" },
      faq: { items: [{ q: "Question?", a: "Answer." }] },
      columns: { cols: 2 }, spacer: { h: 40 }, divider: {}, video: { url: "" }, map: {}, html: { code: "<!-- HTML -->" },
      events: {}, photos: {}, posts: {}, contact: {},
    };
    setBlocks([...blocks, { id, type, ...presets[type] }]);
    setSelectedId(id);
    toast(`Added ${type}`);
  };

  return (
    <div className="adv-shell">
      {/* Palette */}
      <div className="adv-side">
        <div className="row" style={{ marginBottom: 10, padding: "0 4px" }}>
          <div className="serif" style={{ fontSize: 14 }}>Blocks</div>
          <span className="spacer"></span>
          <span className="tag">drag</span>
        </div>
        <div className="pal">
          {PALETTE.map(p => (
            <div key={p.id} className="pal-item" onClick={() => dropOnCanvas(p.id)} title={`Add ${p.label}`}>
              <Icon name={p.icon} size={18} />
              {p.label}
            </div>
          ))}
        </div>

        <h4 style={{ marginTop: 18 }}>Layers</h4>
        <div>
          <div className={"layer" + (selectedId === "hero" ? " active" : "")} onClick={() => setSelectedId("hero")}>
            <Icon name="site" /> Hero
          </div>
          {blocks.map((b) => {
            const meta = blockMeta(b.type);
            return (
              <div key={b.id} className={"layer" + (selectedId === b.id ? " active" : "")} onClick={() => setSelectedId(b.id)}>
                <Icon name={meta.icon} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.heading || meta.label}
                </span>
              </div>
            );
          })}
        </div>

        <h4 style={{ marginTop: 18 }}>Theme</h4>
        <div className="col" style={{ padding: "0 4px" }}>
          <div className="row"><span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>Accent</span><span className="swatch"><span className="sw" style={{ background: "#1d3a8a" }}></span>#1d3a8a</span></div>
          <div className="row"><span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>Display</span><span className="swatch" style={{ fontFamily: "var(--serif)", fontSize: 12 }}>Source Serif</span></div>
          <div className="row"><span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>Body</span><span className="swatch" style={{ fontSize: 12 }}>Inter Tight</span></div>
        </div>
      </div>

      {/* Canvas */}
      <div className="adv-canvas-wrap" onClick={() => setSelectedId(null)}>
        <div
          className="adv-canvas"
          style={{ maxWidth: frame === "mobile" ? 380 : frame === "tablet" ? 768 : 1100 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="adv-rule">
            <span>0</span><span>{frame === "mobile" ? 380 : frame === "tablet" ? 768 : 1100}px</span>
          </div>

          <div
            className={"adv-block" + (selectedId === "hero" ? " selected" : "")}
            data-label="Hero"
            onClick={() => setSelectedId("hero")}
          >
            <div className="handle"><Icon name="drag" /></div>
            <header className="pub-hero">
              <h1
                contentEditable={selectedId === "hero"}
                suppressContentEditableWarning
                onBlur={e => setHero({ ...hero, headline: e.currentTarget.textContent })}
              >{hero.headline}</h1>
              <p
                contentEditable={selectedId === "hero"}
                suppressContentEditableWarning
                onBlur={e => setHero({ ...hero, subhead: e.currentTarget.textContent })}
              >{hero.subhead}</p>
            </header>
          </div>

          {blocks.map(b => {
            const meta = blockMeta(b.type);
            return (
              <div
                key={b.id}
                className={"adv-block" + (selectedId === b.id ? " selected" : "")}
                data-label={meta.label}
                onClick={e => { e.stopPropagation(); setSelectedId(b.id); }}
              >
                <div className="handle"><Icon name="drag" /></div>
                <PreviewBlock block={b} />
              </div>
            );
          })}

          {/* Drop zone at end */}
          <div style={{
            margin: "12px 24px 24px",
            padding: 18,
            border: "1.5px dashed var(--line-2)",
            borderRadius: 10,
            textAlign: "center",
            color: "var(--muted)",
            fontSize: 12.5,
            fontFamily: "var(--sans)",
          }}>
            Drag a block from the left, or click to add ↓
            <div className="adders" style={{ justifyContent: "center", marginTop: 10 }}>
              {["text", "image", "cta", "events"].map(t => (
                <button key={t} className="btn btn-sm" onClick={() => dropOnCanvas(t)}>
                  <Icon name={blockMeta(t).icon} /> {blockMeta(t).label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Inspector */}
      <div className="adv-insp">
        {!selected && (
          <div className="empty" style={{ marginTop: 30 }}>
            <Icon name="compass" size={20} />
            <div style={{ marginTop: 10, fontSize: 12.5 }}>Select a block to inspect.</div>
          </div>
        )}
        {selected && <Inspector key={selectedId} block={selected} onChange={updateSelected} onDelete={remove} onDuplicate={duplicate} />}
      </div>
    </div>
  );
};

const Inspector = ({ block, onChange, onDelete, onDuplicate }) => {
  const meta = blockMeta(block.type);
  const isHero = block.type === "hero";

  return (
    <div>
      <div className="row">
        <div>
          <span className="eyebrow">§ {isHero ? "Hero" : "Block"}</span>
          <h4 style={{ marginTop: 2 }}>{meta.label}</h4>
        </div>
        <span className="spacer"></span>
        {!isHero && (
          <>
            <button className="btn btn-sm btn-ghost btn-icon" onClick={onDuplicate} title="Duplicate"><Icon name="copy" /></button>
            <button className="btn btn-sm btn-ghost btn-icon" onClick={onDelete} title="Delete"><Icon name="trash" /></button>
          </>
        )}
      </div>

      <div className="divider" style={{ margin: "10px 0" }}></div>

      {(block.type === "hero" || block.type === "text" || block.type === "cta") && (
        <>
          <div className="insp-row"><label>Heading</label><input className="input" value={block.headline ?? block.heading ?? ""} onChange={e => onChange(isHero ? { headline: e.target.value } : { heading: e.target.value })} /></div>
          <div className="insp-row"><label>{isHero ? "Subhead" : "Body"}</label><textarea className="textarea" rows={3} value={block.subhead ?? block.body ?? ""} onChange={e => onChange(isHero ? { subhead: e.target.value } : { body: e.target.value })} /></div>
        </>
      )}

      {block.type === "cta" && (
        <>
          <div className="insp-row"><label>Button label</label><input className="input" value={block.label || ""} onChange={e => onChange({ label: e.target.value })} /></div>
          <div className="insp-row"><label>Link</label><input className="input mono" value={block.href || ""} onChange={e => onChange({ href: e.target.value })} /></div>
        </>
      )}

      {block.type === "image" && (
        <>
          <div className="insp-row"><label>Source</label>
            <div className="col">
              <div style={{ height: 80, backgroundImage: `url(${block.url})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: 6, border: "1px solid var(--line)" }}></div>
              <div className="row"><button className="btn btn-sm">Replace</button><button className="btn btn-sm btn-ghost">Browse media</button></div>
            </div>
          </div>
          <div className="insp-row"><label>Caption</label><input className="input" value={block.caption || ""} onChange={e => onChange({ caption: e.target.value })} /></div>
          <div className="insp-row"><label>Aspect</label>
            <select className="select"><option>16 : 7 (banner)</option><option>16 : 9</option><option>4 : 3</option><option>1 : 1</option></select>
          </div>
        </>
      )}

      {block.type === "events" && (
        <>
          <div className="insp-row"><label>Show</label>
            <select className="select"><option>Next 6 events</option><option>This month</option><option>Next 30 days</option></select>
          </div>
          <div className="insp-row"><label>Layout</label>
            <select className="select"><option>2-column grid</option><option>Stacked list</option><option>Compact list</option></select>
          </div>
          <div className="insp-row"><label>Group by</label>
            <select className="select"><option>None</option><option>Month</option><option>Activity type</option></select>
          </div>
        </>
      )}

      {block.type === "photos" && (
        <>
          <div className="insp-row"><label>Album</label><select className="select"><option>All recent</option><option>Spring Camporee 2026</option><option>Pinewood Derby</option></select></div>
          <div className="insp-row"><label>Count</label><input className="input" type="number" defaultValue={8} /></div>
          <div className="insp-row"><label>Layout</label><select className="select"><option>Grid · 4 wide</option><option>Masonry</option><option>Slideshow</option></select></div>
        </>
      )}

      {block.type === "faq" && (
        <div className="insp-row" style={{ gridTemplateColumns: "1fr" }}>
          <label>Items ({(block.items || []).length})</label>
          <button className="btn btn-sm" onClick={() => onChange({ items: [...(block.items || []), { q: "New question", a: "" }] })}><Icon name="plus" /> Add</button>
        </div>
      )}

      {block.type === "html" && (
        <div className="insp-row" style={{ gridTemplateColumns: "1fr" }}>
          <label>Custom HTML</label>
          <textarea className="textarea code" style={{ fontFamily: "var(--mono)", fontSize: 12, minHeight: 140 }} value={block.code || ""} onChange={e => onChange({ code: e.target.value })} />
        </div>
      )}

      <div className="divider"></div>

      <h4>Layout</h4>
      <div className="insp-row"><label>Padding</label>
        <div className="row"><input className="input mono" defaultValue="40px" style={{ width: 80 }} /><span style={{ color: "var(--muted)", fontSize: 11 }}>top/bot</span></div>
      </div>
      <div className="insp-row"><label>Width</label>
        <select className="select"><option>Contained (1100)</option><option>Wide (1280)</option><option>Full bleed</option></select>
      </div>
      <div className="insp-row"><label>Background</label>
        <div className="row" style={{ gap: 6 }}>
          <span className="swatch"><span className="sw" style={{ background: "#ffffff" }}></span>White</span>
          <button className="btn btn-sm btn-ghost btn-icon"><Icon name="more" /></button>
        </div>
      </div>

      <div className="divider"></div>

      <h4>Visibility</h4>
      <div className="insp-row"><label>Devices</label>
        <div className="seg" style={{ borderRadius: 6 }}>
          <button className="on"><Icon name="desktop" /></button>
          <button className="on"><Icon name="tablet" /></button>
          <button className="on"><Icon name="phone" /></button>
        </div>
      </div>
      <div className="insp-row"><label>Audience</label>
        <select className="select"><option>Public</option><option>Members only</option><option>Leaders only</option></select>
      </div>
    </div>
  );
};

window.AdvancedEditor = AdvancedEditor;
