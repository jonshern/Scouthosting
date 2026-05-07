// Compass front page builder — drag-and-drop site editor for volunteer leaders
// 3 artboards: main builder, section editing state, template picker

const PB = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─── Shared chrome ───────────────────────────────────────────
const BuilderTopbar = ({ p, T, mode = 'design' }) => (
  <div style={{
    height: 56, borderBottom: `1px solid ${p.line}`, background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <SHMark size={22} color={p.surfaceDark} accent={p.ember}/>
      <div style={{ height: 22, width: 1, background: p.line }}/>
      <div>
        <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Front page · Troop 567</div>
        <div style={{ fontSize: 13, color: p.ink, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          troop567.compass.app
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M4 12l5 5L20 6"/></svg>
          <span style={{ fontSize: 11, color: p.success, fontWeight: 600 }}>Saved · 12s ago</span>
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', background: p.bg, border: `1px solid ${p.line}`, borderRadius: 7, padding: 2, fontSize: 12 }}>
        {[
          { l: 'Desktop', i: 'M2 4h20v12H2zM8 20h8' },
          { l: 'Mobile', i: 'M7 2h10v20H7z' },
        ].map((v, i) => (
          <div key={i} style={{
            padding: '5px 10px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 6,
            background: i === 0 ? '#fff' : 'transparent',
            color: i === 0 ? p.ink : p.inkMuted,
            fontWeight: i === 0 ? 600 : 500,
            boxShadow: i === 0 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            cursor: 'pointer',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={v.i}/></svg>
            {v.l}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', background: p.bg, border: `1px solid ${p.line}`, borderRadius: 7, padding: 2, fontSize: 12 }}>
        {['Design', 'Preview'].map((v, i) => (
          <div key={i} style={{
            padding: '5px 12px', borderRadius: 5,
            background: (mode === 'design' && i === 0) || (mode === 'preview' && i === 1) ? '#fff' : 'transparent',
            color: (mode === 'design' && i === 0) || (mode === 'preview' && i === 1) ? p.ink : p.inkSoft,
            fontWeight: 600,
            boxShadow: (mode === 'design' && i === 0) || (mode === 'preview' && i === 1) ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            cursor: 'pointer',
          }}>{v}</div>
        ))}
      </div>
      <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: p.ink }}>Share preview</button>
      <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Publish →</button>
      <div style={{ width: 30, height: 30, borderRadius: 15, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11 }}>ES</div>
    </div>
  </div>
);

// Section library (left rail)
const SECTION_TYPES = [
  { id: 'hero', label: 'Hero', sub: 'Big photo + headline', icon: 'hero' },
  { id: 'next', label: 'Next event', sub: 'Auto-syncs from calendar', icon: 'cal' },
  { id: 'about', label: 'About us', sub: 'Story + meeting info', icon: 'about' },
  { id: 'gallery', label: 'Photo gallery', sub: 'Recent troop photos', icon: 'grid' },
  { id: 'leaders', label: 'Leadership', sub: 'Adult volunteer cards', icon: 'people' },
  { id: 'eagle', label: 'Eagle wall', sub: 'Honor roll of Eagles', icon: 'star' },
  { id: 'join', label: 'How to join', sub: 'CTA + visit info', icon: 'door' },
  { id: 'sponsors', label: 'Charter & sponsors', sub: 'Logos + thanks', icon: 'flag' },
  { id: 'feed', label: 'Latest news', sub: 'Posts from your feed', icon: 'feed' },
  { id: 'contact', label: 'Contact form', sub: 'Inquiry → email + log', icon: 'mail' },
  { id: 'video', label: 'Video', sub: 'YouTube embed', icon: 'play' },
  { id: 'faq', label: 'FAQ', sub: 'Q&A accordion', icon: 'help' },
];

const ICON_PATH = {
  hero: 'M3 5h18v14H3z M3 5l9 8 9-8',
  cal: 'M7 3v2M17 3v2M4 8h16 M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  about: 'M4 6h16M4 12h16M4 18h10',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  people: 'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
  star: 'M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  door: 'M4 21V3h12v18H4z M16 12h4 M19 9v6',
  flag: 'M4 21V4l8 3 8-3v11l-8 3-8-3z',
  feed: 'M4 6h12M4 12h16M4 18h8',
  mail: 'M3 7l9 6 9-6 M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-9 6L3 7z',
  play: 'M8 5l11 7-11 7z',
  help: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 17v.01',
};

const SectionLibrary = ({ p, T, draggingId }) => (
  <div style={{ width: 280, background: p.surface, borderRight: `1px solid ${p.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
    <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${p.lineSoft}` }}>
      <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Add section</div>
      <div style={{ fontFamily: T.display, fontSize: 16, color: p.ink, fontWeight: 500 }}>Drag any block to your page</div>
    </div>
    <div style={{ padding: '14px 12px', overflow: 'auto', flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SECTION_TYPES.map((s, i) => (
          <div key={i} style={{
            background: '#fff',
            border: `1px solid ${draggingId === s.id ? p.ember : p.line}`,
            borderRadius: 8, padding: '12px 10px', cursor: 'grab',
            transition: 'transform 0.1s',
            transform: draggingId === s.id ? 'rotate(-2deg) scale(1.02)' : 'none',
            boxShadow: draggingId === s.id ? `0 8px 20px ${p.ember}33` : 'none',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: p.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: p.inkSoft, marginBottom: 8,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON_PATH[s.icon]}/>
              </svg>
            </div>
            <div style={{ fontSize: 12, color: p.ink, fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: p.inkMuted, lineHeight: 1.35 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${p.lineSoft}`, fontSize: 11, color: p.inkMuted, lineHeight: 1.5, background: '#fff' }}>
      Need help? <span style={{ color: p.accent, fontWeight: 600 }}>Watch 90-sec tutorial →</span>
    </div>
  </div>
);

// Page outline (right rail in main builder)
const PageOutline = ({ p, T, selected }) => (
  <div style={{ width: 300, background: '#fff', borderLeft: `1px solid ${p.line}`, padding: 16, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'auto' }}>
    <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Page outline</div>
    {[
      { id: 's1', l: 'Hero', sub: 'Photo · Welcome to Troop 567', drag: true },
      { id: 's2', l: 'Next event', sub: 'Linked: Spring Campout', auto: true },
      { id: 's3', l: 'About us', sub: 'Story + meeting times', drag: true },
      { id: 's4', l: 'Photo gallery', sub: '12 photos · auto-rotates', auto: true },
      { id: 's5', l: 'Leadership', sub: '6 adult leaders', auto: true },
      { id: 's6', l: 'Eagle wall', sub: '34 Eagles since 1962', drag: true },
      { id: 's7', l: 'How to join', sub: 'CTA → contact form', drag: true },
      { id: 's8', l: 'Sponsors', sub: '3 logos · footer', drag: true },
    ].map((s, i, arr) => (
      <div key={i} style={{
        padding: '8px 10px', marginBottom: 4, borderRadius: 6,
        border: selected === s.id ? `1.5px solid ${p.ember}` : `1px solid transparent`,
        background: selected === s.id ? p.ember + '0d' : 'transparent',
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: p.ink, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: p.inkMuted, fontFamily: T.mono, fontSize: 10 }}>{(i + 1).toString().padStart(2, '0')}</span>
            {s.l}
            {s.auto && <span style={{ fontSize: 9, padding: '1px 5px', background: p.success + '22', color: p.success, borderRadius: 3, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live</span>}
          </div>
          <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </div>
    ))}

    {/* Theme */}
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${p.lineSoft}` }}>
      <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Theme</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[p.ember, p.accent, p.teal, p.plum, p.raspberry, '#1a4d3a'].map((c, i) => (
          <div key={i} style={{
            width: 28, height: 28, borderRadius: 14, background: c,
            border: i === 0 ? `2px solid ${p.ink}` : `2px solid #fff`,
            boxShadow: '0 0 0 1px ' + p.line, cursor: 'pointer',
          }}/>
        ))}
      </div>
      <div style={{ fontSize: 11, color: p.inkSoft, marginBottom: 6 }}>Display font</div>
      <div style={{ padding: '8px 10px', border: `1px solid ${p.line}`, borderRadius: 6, fontSize: 13, fontFamily: T.display, color: p.ink, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Newsreader Serif
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>

    {/* Site settings */}
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${p.lineSoft}` }}>
      <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Site settings</div>
      {[
        { l: 'Site name', v: 'Troop 567 · New Hope' },
        { l: 'Custom domain', v: 'troop567.org', sub: '✓ Connected' },
        { l: 'SEO description', v: 'A boy-led troop in New Hope, MN…' },
        { l: 'Visibility', v: 'Public', sub: 'Photos blurred for unverified visitors' },
      ].map((s, i) => (
        <div key={i} style={{ padding: '8px 0', borderTop: i ? `1px solid ${p.lineSoft}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 11, color: p.inkMuted, flexShrink: 0, paddingTop: 1 }}>{s.l}</div>
          <div style={{ fontSize: 12, color: p.ink, textAlign: 'right' }}>
            {s.v}
            {s.sub && <div style={{ fontSize: 10, color: p.success, fontWeight: 600, marginTop: 1 }}>{s.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Live preview canvas ─────────────────────────────────────
// Renders mini-versions of sections inside a "browser frame"
const PreviewSection = ({ p, T, kind, selected, hover, locked }) => {
  const border = selected ? `2px solid ${p.ember}`
              : hover ? `1.5px dashed ${p.accent}`
              : `1px solid transparent`;
  return (
    <div style={{ position: 'relative', border, borderRadius: 4, margin: '0 4px' }}>
      {selected && <SelectedBadge p={p} T={T} kind={kind}/>}
      {hover && <HoverBadge p={p} T={T} kind={kind}/>}
      {locked && (
        <div style={{ position: 'absolute', top: 8, right: 8, padding: '3px 7px', background: '#fff', border: `1px solid ${p.line}`, borderRadius: 4, fontSize: 10, color: p.inkMuted, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, zIndex: 5 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          Auto from calendar
        </div>
      )}
      <SectionRenderer p={p} T={T} kind={kind}/>
    </div>
  );
};

const SelectedBadge = ({ p, T, kind }) => (
  <>
    <div style={{ position: 'absolute', top: -10, left: -2, padding: '2px 8px', background: p.ember, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 3, zIndex: 5 }}>{kind} · selected</div>
    {/* Resize handles */}
    {[
      { top: -3, left: -3 }, { top: -3, right: -3 },
      { bottom: -3, left: -3 }, { bottom: -3, right: -3 },
    ].map((s, i) => (
      <div key={i} style={{ position: 'absolute', ...s, width: 6, height: 6, background: '#fff', border: `1.5px solid ${p.ember}`, borderRadius: 1, zIndex: 5 }}/>
    ))}
  </>
);
const HoverBadge = ({ p, T, kind }) => (
  <div style={{ position: 'absolute', top: -10, left: -2, padding: '2px 8px', background: p.accent, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 3, zIndex: 5 }}>{kind}</div>
);

// ─── Section renderers (compact for builder canvas) ──────────
const SectionRenderer = ({ p, T, kind }) => {
  switch (kind) {
    case 'hero': return <HeroSection p={p} T={T}/>;
    case 'next-event': return <NextEventSection p={p} T={T}/>;
    case 'about': return <AboutSection p={p} T={T}/>;
    case 'gallery': return <GallerySection p={p} T={T}/>;
    case 'leaders': return <LeadersSection p={p} T={T}/>;
    case 'eagle': return <EagleSection p={p} T={T}/>;
    case 'join': return <JoinSection p={p} T={T}/>;
    default: return null;
  }
};

const HeroSection = ({ p, T }) => (
  <div style={{
    height: 360, background: `linear-gradient(135deg, ${p.surfaceDark} 40%, ${p.plum} 100%)`,
    color: '#fff', padding: '40px 60px', position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
  }}>
    {/* photo backdrop */}
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 70% 30%, ${p.ember}66 0%, transparent 60%)` }}/>
    <div style={{ position: 'absolute', top: 24, left: 60, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Boy Scouts of America · Chartered 1962</div>
    <div style={{ position: 'relative' }}>
      <h1 style={{ fontFamily: T.display, fontSize: 60, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0 }}>
        Adventure starts <em style={{ fontStyle: 'italic', color: p.ember }}>here.</em>
      </h1>
      <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', maxWidth: 540, margin: '14px 0 22px', lineHeight: 1.5 }}>
        Troop 567 New Hope — boy-led, family-supported, since 1962. Visit any Tuesday at 7 PM.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ background: p.ember, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>Visit a meeting →</button>
        <button style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>Watch 90s intro</button>
      </div>
    </div>
  </div>
);

const NextEventSection = ({ p, T }) => (
  <div style={{ background: p.bg, padding: '50px 60px', borderTop: `1px solid ${p.lineSoft}`, borderBottom: `1px solid ${p.lineSoft}` }}>
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 30, alignItems: 'center' }}>
      <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 16, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>May</div>
        <div style={{ fontFamily: T.display, fontSize: 44, fontWeight: 500, color: p.ink, lineHeight: 1 }}>15</div>
        <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>Fri 5 PM</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Up next · campout</div>
        <h2 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: p.ink }}>Spring Camporee — Tomahawk SR</h2>
        <p style={{ fontSize: 14, color: p.inkSoft, margin: '6px 0 0', lineHeight: 1.5, maxWidth: 520 }}>
          A weekend of merit badges, fishing, and patrol cooking. Open to scouts and families. 24 of 28 spots taken.
        </p>
      </div>
      <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '14px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>RSVP →</button>
    </div>
  </div>
);

const AboutSection = ({ p, T }) => (
  <div style={{ padding: '60px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center', background: '#fff' }}>
    <div>
      <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Our troop</div>
      <h2 style={{ fontFamily: T.display, fontSize: 40, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0, color: p.ink }}>
        Boy-led. <em style={{ fontStyle: 'italic', color: p.ember }}>Family-supported.</em> Since 1962.
      </h2>
      <p style={{ fontSize: 15, color: p.inkSoft, lineHeight: 1.6, margin: '18px 0 0' }}>
        We meet Tuesdays at 7 PM at Christ Lutheran Church. Camp once a month. Plan our calendar at the Patrol Leaders' Council. We've sent 34 Eagles to college since the troop began.
      </p>
      <div style={{ display: 'flex', gap: 28, marginTop: 28 }}>
        {[
          { n: '42', l: 'Active scouts' },
          { n: '34', l: 'Eagles' },
          { n: '64', l: 'Years' },
        ].map((s, i) => (
          <div key={i}>
            <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 500, color: p.ink, lineHeight: 1 }}>{s.n}</div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ aspectRatio: '4/3', background: `linear-gradient(135deg, ${p.teal}33, ${p.ember}22)`, borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, padding: 8 }}>
        {[p.teal, p.ember, p.plum, p.accent].map((c, i) => (
          <div key={i} style={{ background: c, borderRadius: 8, opacity: 0.85 }}/>
        ))}
      </div>
    </div>
  </div>
);

const GallerySection = ({ p, T }) => (
  <div style={{ padding: '50px 60px', background: p.bg }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
      <h2 style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: p.ink }}>Recent adventures</h2>
      <div style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>See all 248 photos →</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
      {[p.teal, p.ember, p.plum, p.accent, p.raspberry, p.mustard].map((c, i) => (
        <div key={i} style={{ aspectRatio: '1/1', background: `linear-gradient(135deg, ${c}, ${c}99)`, borderRadius: 6, position: 'relative' }}>
          {i === 5 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: T.display, fontSize: 22, fontWeight: 500 }}>+243</div>
          )}
        </div>
      ))}
    </div>
  </div>
);

const LeadersSection = ({ p, T }) => (
  <div style={{ padding: '50px 60px', background: '#fff', borderTop: `1px solid ${p.lineSoft}` }}>
    <h2 style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 22px', color: p.ink }}>The grown-ups behind the troop</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {[
        { i: 'ES', n: 'Eric Schulz', r: 'Scoutmaster', c: p.plum },
        { i: 'WP', n: 'Will Patel', r: 'Asst. Scoutmaster', c: p.accent },
        { i: 'JT', n: 'Jenn Tahir', r: 'Treasurer', c: p.teal },
        { i: 'BL', n: 'Ben Lo', r: 'Comm. Chair', c: p.ember },
      ].map((l, i) => (
        <div key={i} style={{ background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: l.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>{l.i}</div>
          <div>
            <div style={{ fontSize: 13, color: p.ink, fontWeight: 600 }}>{l.n}</div>
            <div style={{ fontSize: 11, color: p.inkMuted }}>{l.r}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const EagleSection = ({ p, T }) => (
  <div style={{ padding: '50px 60px', background: p.surfaceDark, color: '#fff' }}>
    <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Honor roll</div>
    <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>34 Eagles. <em style={{ fontStyle: 'italic', color: p.ember }}>And counting.</em></h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginTop: 24 }}>
      {[...Array(16)].map((_, i) => (
        <div key={i} style={{ aspectRatio: '3/4', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 8, fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 4 }}/>
          {['Eli M.', 'Owen P.', 'Daksh R.', 'Will H.', 'Sam K.', 'Ben Y.', 'Aiden L.', 'Theo R.'][i % 8]}
        </div>
      ))}
    </div>
  </div>
);

const JoinSection = ({ p, T }) => (
  <div style={{ padding: '60px', background: p.ember, color: '#fff', textAlign: 'center' }}>
    <h2 style={{ fontFamily: T.display, fontSize: 40, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Curious? Come visit.</h2>
    <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', maxWidth: 540, margin: '14px auto 24px', lineHeight: 1.5 }}>
      We meet Tuesdays at 7 PM. Bring your scout. No commitment, no signup. Just show up.
    </p>
    <button style={{ background: '#fff', color: p.ember, border: 'none', padding: '14px 28px', borderRadius: 8, fontSize: 14, fontWeight: 700 }}>Get directions & say hi →</button>
  </div>
);

const PreviewBrowserChrome = ({ p, T, children }) => (
  <div style={{ background: p.bg, padding: 24, height: '100%', overflow: 'auto' }}>
    <div style={{
      maxWidth: 1100, margin: '0 auto',
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 12px 30px rgba(0,0,0,0.08)',
      border: `1px solid ${p.line}`,
    }}>
      {/* Browser bar */}
      <div style={{ height: 40, background: p.surface, borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => <div key={i} style={{ width: 11, height: 11, borderRadius: 6, background: c }}/>)}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 5, padding: '4px 16px', fontSize: 11, color: p.inkSoft, fontFamily: T.mono, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="2.5"><path d="M6 11V7a6 6 0 0 1 12 0v4 M5 11h14v10H5z"/></svg>
            troop567.compass.app
          </div>
        </div>
      </div>
      {children}
    </div>
  </div>
);

// ─── Artboard 1: Main builder ────────────────────────────────
const FrontPageBuilder = () => {
  const p = PB.p(); const T = PB.T();
  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'flex', flexDirection: 'column' }}>
      <BuilderTopbar p={p} T={T} mode="design"/>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SectionLibrary p={p} T={T} draggingId="leaders"/>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <PreviewBrowserChrome p={p} T={T}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <PreviewSection p={p} T={T} kind="hero"/>
              <PreviewSection p={p} T={T} kind="next-event" locked/>

              {/* Drop indicator before About */}
              <div style={{ height: 6, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 4, right: 4, top: 1, height: 4, background: p.ember, borderRadius: 2 }}/>
                <div style={{ position: 'absolute', left: -2, top: -2, width: 10, height: 10, borderRadius: 5, background: p.ember, border: '2px solid #fff' }}/>
                <div style={{ position: 'absolute', right: 12, top: -22, padding: '2px 8px', background: p.ember, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 3 }}>Drop "Leadership" here</div>
              </div>

              <PreviewSection p={p} T={T} kind="about" hover/>
              <PreviewSection p={p} T={T} kind="gallery"/>
            </div>
          </PreviewBrowserChrome>

          {/* Floating quick actions on canvas */}
          <div style={{ position: 'absolute', bottom: 24, left: 24, display: 'flex', gap: 8 }}>
            <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: p.inkSoft, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
              <span>Auto-save · 12s ago</span>
              <span style={{ color: p.line }}>·</span>
              <span style={{ color: p.accent, fontWeight: 600, cursor: 'pointer' }}>Undo</span>
            </div>
          </div>
        </div>
        <PageOutline p={p} T={T} selected={null}/>
      </div>
    </div>
  );
};

// ─── Artboard 2: Editing a hero section ──────────────────────
const FrontPageBuilderEditing = () => {
  const p = PB.p(); const T = PB.T();
  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'flex', flexDirection: 'column' }}>
      <BuilderTopbar p={p} T={T} mode="design"/>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SectionLibrary p={p} T={T}/>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <PreviewBrowserChrome p={p} T={T}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <PreviewSection p={p} T={T} kind="hero" selected/>
              <div style={{ opacity: 0.5 }}>
                <PreviewSection p={p} T={T} kind="next-event" locked/>
              </div>
            </div>
          </PreviewBrowserChrome>
        </div>

        {/* Inspector — replaces page outline when section selected */}
        <div style={{ width: 320, background: '#fff', borderLeft: `1px solid ${p.line}`, padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Editing</div>
              <div style={{ fontFamily: T.display, fontSize: 18, color: p.ink, fontWeight: 500 }}>Hero section</div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ width: 28, height: 28, background: 'transparent', border: `1px solid ${p.line}`, borderRadius: 6, color: p.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15V3h12"/></svg>
              </button>
              <button style={{ width: 28, height: 28, background: 'transparent', border: `1px solid ${p.line}`, borderRadius: 6, color: p.ember, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>
              </button>
            </div>
          </div>

          {/* Layout variants */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, marginBottom: 8 }}>Layout</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  aspectRatio: '4/3', borderRadius: 6, padding: 6,
                  background: p.bg, border: `1.5px solid ${i === 0 ? p.ember : p.lineSoft}`,
                  position: 'relative',
                }}>
                  <div style={{ width: '100%', height: '60%', background: i === 0 ? `linear-gradient(135deg, ${p.surfaceDark}, ${p.plum})` : i === 1 ? p.line : p.bg, borderRadius: 3, position: 'relative' }}>
                    {i === 1 && <div style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translateY(-50%)', width: '50%', height: 5, background: p.inkSoft, borderRadius: 2 }}/>}
                  </div>
                  <div style={{ width: '70%', height: 3, background: p.inkSoft, borderRadius: 1, marginTop: 4 }}/>
                  <div style={{ width: '50%', height: 3, background: p.line, borderRadius: 1, marginTop: 2 }}/>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4, fontSize: 10, color: p.inkMuted, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: p.ember }}>Photo + text</div>
              <div>Split</div>
              <div>Centered</div>
            </div>
          </div>

          {/* Headline */}
          <Field p={p} T={T} label="Eyebrow">
            <input defaultValue="Boy Scouts of America · Chartered 1962" style={inputStyle(p)}/>
          </Field>

          <Field p={p} T={T} label="Headline" hint="Use *italics* for emphasis">
            <textarea defaultValue="Adventure starts *here.*" rows={2} style={{ ...inputStyle(p), resize: 'none', fontFamily: T.display, fontSize: 15 }}/>
          </Field>

          <Field p={p} T={T} label="Subheadline">
            <textarea defaultValue="Troop 567 New Hope — boy-led, family-supported, since 1962. Visit any Tuesday at 7 PM." rows={3} style={{ ...inputStyle(p), resize: 'none' }}/>
          </Field>

          {/* Background image */}
          <Field p={p} T={T} label="Background">
            <div style={{ border: `1px dashed ${p.line}`, borderRadius: 8, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 60, height: 40, borderRadius: 4, background: `linear-gradient(135deg, ${p.surfaceDark}, ${p.plum})`, flexShrink: 0 }}/>
              <div style={{ flex: 1, fontSize: 12, color: p.ink }}>
                <div style={{ fontWeight: 600 }}>campout-2025-fall.jpg</div>
                <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 1 }}>From troop photos · 2.4 MB</div>
              </div>
              <span style={{ fontSize: 11, color: p.accent, fontWeight: 600, cursor: 'pointer' }}>Replace</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: p.inkSoft }}>
                <input type="checkbox" defaultChecked/> Darken overlay
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: p.inkSoft }}>
                <input type="checkbox"/> Parallax
              </label>
            </div>
          </Field>

          {/* Buttons */}
          <Field p={p} T={T} label="Buttons">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <BtnRow p={p} label="Visit a meeting" sub="→ #contact" primary/>
              <BtnRow p={p} label="Watch 90s intro" sub="→ /about#video"/>
              <button style={{ background: 'transparent', border: `1px dashed ${p.line}`, color: p.inkMuted, fontSize: 12, padding: 8, borderRadius: 6, fontWeight: 600 }}>+ Add button</button>
            </div>
          </Field>

          {/* Style accordion */}
          <div style={{ marginTop: 8, padding: 12, background: p.bg, borderRadius: 8, border: `1px solid ${p.lineSoft}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: 12, color: p.ink, fontWeight: 600 }}>Advanced styling</div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 4 }}>Padding · text alignment · custom CSS</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ p, T, label, hint, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: p.inkMuted, fontStyle: 'italic' }}>{hint}</div>}
    </div>
    {children}
  </div>
);

const inputStyle = (p) => ({
  width: '100%', padding: '8px 10px', border: `1px solid ${p.line}`,
  borderRadius: 6, fontSize: 13, color: p.ink,
  fontFamily: 'inherit', background: '#fff', outline: 'none',
});

const BtnRow = ({ p, label, sub, primary }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#fff', border: `1px solid ${p.line}`, borderRadius: 6 }}>
    <div style={{ width: 14, height: 14, borderRadius: 3, background: primary ? p.ember : 'transparent', border: `1.5px solid ${primary ? p.ember : p.inkSoft}`, flexShrink: 0 }}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: p.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 10, color: p.inkMuted, fontFamily: 'monospace' }}>{sub}</div>
    </div>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
  </div>
);

// ─── Artboard 3: Template picker ─────────────────────────────
const FrontPageBuilderTemplates = () => {
  const p = PB.p(); const T = PB.T();
  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'flex', flexDirection: 'column' }}>
      <BuilderTopbar p={p} T={T}/>
      <div style={{ flex: 1, padding: '40px 60px', overflow: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Step 1 of 3 · Choose a template</div>
            <h1 style={{ fontFamily: T.display, fontSize: 38, fontWeight: 400, letterSpacing: '-0.02em', margin: 0, color: p.ink }}>
              Pick a starting point. <em style={{ color: p.ember }}>Customize anything.</em>
            </h1>
            <p style={{ fontSize: 14, color: p.inkSoft, margin: '12px 0 0', maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
              Each template is built by Compass for real troops. Swap photos, change colors, rewrite copy — your site goes live in 20 minutes, not 20 hours.
            </p>
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
            {['All 18', 'Boy Scouts', 'Cub Pack', 'Crew · Venturing', 'Sea Scouts', 'Minimal', 'Heritage', 'Bold'].map((c, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 18,
                background: i === 0 ? p.ink : '#fff',
                color: i === 0 ? '#fff' : p.ink,
                border: i === 0 ? 'none' : `1px solid ${p.line}`,
                fontSize: 12, fontWeight: 600,
              }}>{c}</div>
            ))}
          </div>

          {/* Template grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {TEMPLATES.map((t, i) => (
              <TemplateCard key={i} t={t} p={p} T={T} featured={i === 0}/>
            ))}
          </div>

          {/* Or start blank */}
          <div style={{ textAlign: 'center', marginTop: 36, paddingTop: 28, borderTop: `1px solid ${p.lineSoft}` }}>
            <div style={{ fontSize: 13, color: p.inkSoft }}>
              Want full control? <span style={{ color: p.accent, fontWeight: 600 }}>Start with a blank page →</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TEMPLATES = [
  { name: 'Heritage Troop', sub: 'Boy Scouts · Serif, photo-led', tag: 'Most popular', accent: '#3a4d2e', bg: 'linear-gradient(135deg,#1a2818,#3a4d2e)' },
  { name: 'Cub Pack Friendly', sub: 'Cub Pack · Bright, family-first',  tag: 'New', accent: '#1976d2', bg: 'linear-gradient(135deg,#1976d2,#42a5f5)' },
  { name: 'Modern Minimal',  sub: 'Boy Scouts · Sans, clean',     accent: '#0a0a0a', bg: 'linear-gradient(135deg,#1a1a1a,#3a3a3a)' },
  { name: 'Adventure Bold',  sub: 'Venturing · Big type, ember',  accent: '#c14d2e', bg: 'linear-gradient(135deg,#3a1f12,#c14d2e)' },
  { name: 'Cabin & Compass', sub: 'Boy Scouts · Forest tones',    accent: '#2c4a3a', bg: 'linear-gradient(135deg,#1f3329,#476559)' },
  { name: 'Coastal Crew',    sub: 'Sea Scouts · Navy & sand',     accent: '#1a3a5c', bg: 'linear-gradient(135deg,#1a3a5c,#3a6a96)' },
];

const TemplateCard = ({ t, p, T, featured }) => (
  <div style={{
    background: '#fff', border: `1px solid ${featured ? p.ember : p.line}`,
    borderRadius: 12, overflow: 'hidden',
    boxShadow: featured ? `0 0 0 3px ${p.ember}22, 0 8px 24px rgba(0,0,0,0.06)` : '0 1px 2px rgba(0,0,0,0.03)',
    cursor: 'pointer', position: 'relative',
  }}>
    {t.tag && (
      <div style={{ position: 'absolute', top: 12, right: 12, padding: '3px 8px', background: featured ? p.ember : p.ink, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4, zIndex: 2 }}>{t.tag}</div>
    )}

    {/* Preview thumb */}
    <div style={{ aspectRatio: '4/3', background: t.bg, position: 'relative', overflow: 'hidden', padding: 16, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Troop 567 · Sample</div>
      <div>
        <div style={{ fontFamily: t.name === 'Modern Minimal' ? 'Inter Tight, sans-serif' : 'Newsreader, serif', fontSize: 22, fontWeight: t.name === 'Modern Minimal' ? 700 : 400, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
          Adventure starts <em style={{ fontStyle: 'italic', color: t.accent === '#0a0a0a' ? '#fff' : 'rgba(255,255,255,0.85)' }}>here.</em>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <div style={{ width: 50, height: 12, background: t.accent === '#0a0a0a' ? '#fff' : t.accent, borderRadius: 2 }}/>
          <div style={{ width: 38, height: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }}/>
        </div>
      </div>
      {/* Mini sections */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: 'rgba(0,0,0,0.3)' }}/>
    </div>

    {/* Meta */}
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 500, color: p.ink, letterSpacing: '-0.01em' }}>{t.name}</div>
        <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 500 }}>8 sections</div>
      </div>
      <div style={{ fontSize: 12, color: p.inkSoft }}>{t.sub}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button style={{ flex: 1, background: featured ? p.ink : 'transparent', color: featured ? '#fff' : p.ink, border: featured ? 'none' : `1px solid ${p.line}`, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Use template</button>
        <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: p.inkSoft, cursor: 'pointer' }}>Preview</button>
      </div>
    </div>
  </div>
);

window.FrontPageBuilder = FrontPageBuilder;
window.FrontPageBuilderEditing = FrontPageBuilderEditing;
window.FrontPageBuilderTemplates = FrontPageBuilderTemplates;
