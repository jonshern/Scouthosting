// Compass Front Page Builder v2 — designed FOR volunteer parents, not designers
//
// Thesis: don't give them a "blank canvas with a color picker." That's how you get the
// Troop 8888 page (chaotic typography, polaroids on a busy green bg, three uneven
// columns). Instead: curated themes, a rich library of pre-designed blocks, AI
// assist, smart layouts, live data tie-ins.
//
// 4 artboards:
//   1. Theme picker (start here — pick the look, not the colors)
//   2. Block library (20+ specific blocks, not generic "hero")
//   3. AI-assisted block (parent types intent, gets a finished section)
//   4. The finished page (compelling default, not a mess)

const PBV2 = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─── Shared topbar (slimmer than v1) ───────────────────────────
const PBV2Topbar = ({ p, T, step = 1, label = 'Pick a theme' }) => (
  <div style={{
    height: 56, borderBottom: `1px solid ${p.line}`, background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <SHMark size={22} color={p.surfaceDark} accent={p.ember}/>
      <div style={{ height: 22, width: 1, background: p.line }}/>
      <div>
        <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Site builder · Troop 567</div>
        <div style={{ fontSize: 13, color: p.ink, fontWeight: 500 }}>{label}</div>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Step pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: p.inkMuted }}>
        {['Theme', 'Content', 'Polish', 'Publish'].map((s, i) => (
          <React.Fragment key={i}>
            <div style={{
              padding: '4px 10px', borderRadius: 12,
              background: i + 1 === step ? p.ink : (i + 1 < step ? p.success + '22' : 'transparent'),
              color: i + 1 === step ? '#fff' : (i + 1 < step ? p.success : p.inkMuted),
              fontWeight: i + 1 === step ? 600 : 500,
              border: i + 1 === step || i + 1 < step ? 'none' : `1px solid ${p.line}`,
            }}>{i + 1 < step ? '✓ ' : ''}{s}</div>
            {i < 3 && <div style={{ width: 14, height: 1, background: p.line }}/>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ height: 22, width: 1, background: p.line, margin: '0 4px' }}/>
      <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: p.ink }}>Save & exit</button>
      <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Continue →</button>
    </div>
  </div>
);

// ───────────────────────────────────────────────────────────────
// Mini theme preview — shrunk version of a hero rendered in the theme's style
// ───────────────────────────────────────────────────────────────
const ThemeCard = ({ theme, selected, p, T }) => (
  <div style={{
    border: selected ? `2px solid ${p.ember}` : `1px solid ${p.line}`,
    background: '#fff',
    borderRadius: 14, overflow: 'hidden',
    boxShadow: selected ? `0 0 0 4px ${p.ember}1a` : '0 1px 2px rgba(0,0,0,0.04)',
    cursor: 'pointer', position: 'relative',
  }}>
    {/* Hero preview — uses theme's actual visual language */}
    <div style={{
      aspectRatio: '4/3',
      background: theme.bg,
      color: theme.fg,
      padding: 18,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      position: 'relative', overflow: 'hidden',
      backgroundImage: theme.bgImage,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      {theme.overlay && <div style={{ position: 'absolute', inset: 0, background: theme.overlay }}/>}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 8, fontWeight: 600, opacity: 0.8 }}>
        <span>TROOP 567</span>
        <div style={{ display: 'flex', gap: 6, fontSize: 7 }}>
          <span>About</span><span>Calendar</span><span>Photos</span>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: theme.displayFont, fontSize: theme.headlineSize, fontWeight: theme.headlineWeight, lineHeight: 1.05, letterSpacing: theme.headlineSpacing, fontStyle: theme.headlineStyle || 'normal' }}>
          {theme.headline}
        </div>
        <div style={{ fontSize: 8, marginTop: 6, opacity: 0.85, fontFamily: theme.bodyFont || T.ui }}>{theme.sub}</div>
        <div style={{ display: 'inline-block', marginTop: 8, padding: '4px 8px', background: theme.btnBg, color: theme.btnFg, fontSize: 8, fontWeight: 600, borderRadius: theme.btnRadius }}>{theme.cta}</div>
      </div>
    </div>
    {/* Body strip — shows secondary block style */}
    <div style={{ padding: 14, background: theme.body || '#fff', borderTop: `1px solid ${p.lineSoft}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontFamily: T.ui, fontSize: 13, fontWeight: 600, color: p.ink }}>{theme.name}</div>
        {selected && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: p.ember, color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l4 4L19 7"/></svg>
            Selected
          </div>
        )}
      </div>
      <div style={{ fontFamily: T.ui, fontSize: 11, color: p.inkSoft, lineHeight: 1.4 }}>{theme.desc}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        {theme.swatches.map((s, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: s, border: '1px solid rgba(0,0,0,0.06)' }}/>
        ))}
      </div>
    </div>
  </div>
);

// ─── Artboard 1: Theme picker ────────────────────────────────
const PageBuilderThemes = () => {
  const p = PBV2.p(); const T = PBV2.T();

  const themes = [
    {
      key: 'heritage', name: 'Heritage Patch',
      desc: 'Classic scout gravitas. Serif display, warm cream paper, evergreen.',
      headline: 'Troop 567', sub: 'New Hope, Minnesota · Chartered 1962',
      cta: 'Join us',
      bg: '#1a3d2e', fg: '#f5f0e0',
      displayFont: T.display, headlineSize: 28, headlineWeight: 500, headlineSpacing: '-0.02em', headlineStyle: 'italic',
      btnBg: '#e89556', btnFg: '#fff', btnRadius: 4,
      body: '#f9f4e8',
      swatches: ['#1a3d2e', '#e89556', '#f5f0e0', '#7a8674', '#2d2a26'],
    },
    {
      key: 'modern', name: 'Modern Trail',
      desc: 'Clean editorial. Big sans headlines, generous whitespace, single accent.',
      headline: 'A modern troop, since 1962.', sub: 'Adventure & character in New Hope, MN',
      cta: 'Get started →',
      bg: '#fafafa', fg: '#0d0d0d',
      displayFont: 'Inter Tight', headlineSize: 22, headlineWeight: 700, headlineSpacing: '-0.02em',
      btnBg: '#0d0d0d', btnFg: '#fff', btnRadius: 8,
      body: '#fff',
      swatches: ['#0d0d0d', '#e85d3f', '#fafafa', '#737373', '#fff'],
    },
    {
      key: 'campfire', name: 'Campfire',
      desc: 'Outdoorsy and warm. Dusk gradient hero, photo-forward, hand-drawn accents.',
      headline: 'Where adventure starts.', sub: 'Troop 567 · weekly Tuesdays at 7',
      cta: 'See what we do',
      bg: 'linear-gradient(180deg, #2d3a4a 0%, #c47a3a 110%)', fg: '#fff',
      displayFont: T.display, headlineSize: 22, headlineWeight: 500, headlineSpacing: '-0.015em',
      btnBg: '#fff', btnFg: '#2d3a4a', btnRadius: 20,
      body: '#fff',
      bgImage: 'radial-gradient(ellipse at 50% 90%, rgba(255,200,100,0.4), transparent 60%)',
      swatches: ['#2d3a4a', '#c47a3a', '#f4d8a8', '#7d2c1a', '#fff'],
    },
    {
      key: 'civic', name: 'Civic Hall',
      desc: 'Official, trustworthy, parent-friendly. Navy + gold, structured grids.',
      headline: 'BSA Troop 567', sub: 'Serving New Hope families since 1962',
      cta: 'Join the troop',
      bg: '#0f2a52', fg: '#fff',
      displayFont: 'IBM Plex Serif', headlineSize: 22, headlineWeight: 500, headlineSpacing: '-0.01em',
      btnBg: '#d4a849', btnFg: '#0f2a52', btnRadius: 0,
      body: '#fff',
      swatches: ['#0f2a52', '#d4a849', '#fff', '#1f4080', '#e5e5e5'],
    },
    {
      key: 'almanac', name: 'Almanac',
      desc: 'Newspaper-y. Wide masthead, serif throughout, monochrome with one ink color.',
      headline: 'The Troop 567 Almanac', sub: 'Vol. 62, No. 4 · March 15, 2025',
      cta: 'Read this week →',
      bg: '#f6efe1', fg: '#1a1a1a',
      displayFont: 'Newsreader', headlineSize: 22, headlineWeight: 500, headlineSpacing: '-0.02em', headlineStyle: 'italic',
      btnBg: '#7a1d2a', btnFg: '#f6efe1', btnRadius: 0,
      body: '#fefcf6',
      swatches: ['#7a1d2a', '#1a1a1a', '#f6efe1', '#a8a191', '#fff'],
    },
    {
      key: 'kraft', name: 'Kraft & Spark',
      desc: 'Friendly hand-made. Kraft paper textures, marker-drawn accents, scrapbook energy.',
      headline: 'Troop 567', sub: 'Hike, camp, build, lead — together',
      cta: 'Come find us',
      bg: '#d9c19a', fg: '#3a2a1a',
      displayFont: T.display, headlineSize: 22, headlineWeight: 500, headlineSpacing: '-0.015em',
      btnBg: '#3a2a1a', btnFg: '#fff8e8', btnRadius: 30,
      body: '#fff8e8',
      bgImage: 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(0,0,0,0.03) 8px 9px)',
      swatches: ['#d9c19a', '#3a2a1a', '#c95c3a', '#5a7a3a', '#fff8e8'],
    },
    {
      key: 'minimalist', name: 'Minimalist',
      desc: 'Mostly type. Almost no color. The opposite of the troopwebhost look.',
      headline: 'TROOP 567.', sub: 'New Hope, MN. Since 1962.',
      cta: 'Learn more',
      bg: '#fff', fg: '#000',
      displayFont: 'Inter Tight', headlineSize: 26, headlineWeight: 700, headlineSpacing: '-0.04em',
      btnBg: 'transparent', btnFg: '#000', btnRadius: 0,
      body: '#fff',
      swatches: ['#000', '#fff', '#d4d4d4', '#737373', '#0066ff'],
    },
    {
      key: 'eagle', name: 'Eagle Pride',
      desc: 'Achievement-forward. Bold reds, eagle iconography, badge-themed sections.',
      headline: 'Soar with Troop 567', sub: '34 Eagle Scouts · 63 years strong',
      cta: 'Become an Eagle',
      bg: '#7a1d2a', fg: '#fff',
      displayFont: T.display, headlineSize: 22, headlineWeight: 500, headlineSpacing: '-0.015em',
      btnBg: '#f5d878', btnFg: '#7a1d2a', btnRadius: 4,
      body: '#fff',
      bgImage: 'radial-gradient(circle at 80% 20%, rgba(245,216,120,0.2), transparent 50%)',
      swatches: ['#7a1d2a', '#f5d878', '#1a1a1a', '#fff', '#3a3a3a'],
    },
  ];

  const [selected, setSelected] = React.useState('heritage');

  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'flex', flexDirection: 'column' }}>
      <PBV2Topbar p={p} T={T} step={1} label="Pick a theme to start"/>

      <div style={{ flex: 1, overflow: 'auto', padding: '32px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24, maxWidth: 1280 }}>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Step 1 of 4 · 5 minutes</div>
            <h1 style={{ fontFamily: T.display, fontSize: 38, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0, color: p.ink }}>
              Pick a look. <em style={{ color: p.ember, fontStyle: 'italic' }}>We handle the rest.</em>
            </h1>
            <p style={{ fontSize: 15, color: p.inkSoft, margin: '8px 0 0', maxWidth: 620, lineHeight: 1.55 }}>
              Each theme is a complete design system: fonts, colors, spacing, and section styles that work together. You don't pick fonts or hex codes — you pick a vibe. <strong style={{ color: p.ink }}>Switch themes anytime.</strong>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.inkSoft, padding: '8px 12px', background: '#fff', border: `1px solid ${p.line}`, borderRadius: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span>Wondering which? Try <strong style={{ color: p.ink }}>Heritage Patch</strong> — it's our most-loved.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, maxWidth: 1280 }}>
          {themes.map((t) => (
            <div key={t.key} onClick={() => setSelected(t.key)}>
              <ThemeCard theme={t} selected={t.key === selected} p={p} T={T}/>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 28, padding: 18, background: '#fff', border: `1px dashed ${p.line}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: p.ember + '22', color: p.ember, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, color: p.ink, fontWeight: 600 }}>Want more? We have 12 more themes built with Eagle Scout designers.</div>
              <div style={{ fontSize: 12, color: p.inkSoft }}>Browse the full library — including district-, council-, and venturing-themed sets.</div>
            </div>
          </div>
          <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: p.ink }}>See all 20 themes →</button>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────
// Block library — shows real, specific blocks, not "hero / text / image"
// ───────────────────────────────────────────────────────────────
const BlockTile = ({ block, p, T, hot }) => (
  <div style={{
    background: '#fff', border: hot ? `1.5px solid ${p.ember}` : `1px solid ${p.line}`,
    borderRadius: 10, padding: 12, cursor: 'grab', position: 'relative',
    boxShadow: hot ? `0 0 0 3px ${p.ember}1a` : 'none',
  }}>
    {hot && <div style={{ position: 'absolute', top: -7, right: 10, padding: '2px 7px', background: p.ember, color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4 }}>Popular</div>}
    {/* Mini visual preview */}
    <div style={{
      height: 80, background: block.preview, borderRadius: 6, marginBottom: 8,
      backgroundSize: 'cover', backgroundPosition: 'center',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600,
      backgroundImage: block.previewGfx,
      position: 'relative', overflow: 'hidden',
    }}>
      {block.previewKids}
    </div>
    <div style={{ fontSize: 12, color: p.ink, fontWeight: 600 }}>{block.name}</div>
    <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1, lineHeight: 1.35 }}>{block.desc}</div>
    {block.live && (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, padding: '2px 6px', background: p.success + '15', color: p.success, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 3 }}>
        <div style={{ width: 4, height: 4, borderRadius: 2, background: p.success }}/>
        Live data
      </div>
    )}
  </div>
);

const PageBuilderBlocks = () => {
  const p = PBV2.p(); const T = PBV2.T();

  const categories = [
    { id: 'header', label: 'Headers & heroes', count: 6, active: true },
    { id: 'about',   label: 'About & welcome', count: 4 },
    { id: 'events',  label: 'Events & calendar', count: 5 },
    { id: 'people',  label: 'People & leadership', count: 4 },
    { id: 'photos',  label: 'Photos & media', count: 5 },
    { id: 'achieve', label: 'Achievements', count: 5 },
    { id: 'recruit', label: 'Recruiting & CTAs', count: 4 },
    { id: 'fund',    label: 'Fundraising', count: 3 },
    { id: 'comm',    label: 'Community & sponsors', count: 3 },
    { id: 'footer',  label: 'Footers', count: 3 },
  ];

  // A subset of the catalog (8-10 visible). All "live data" tied to Compass.
  const blocks = [
    { name: 'Big serif hero', desc: 'Massive italic headline, photo right.', live: false,
      previewGfx: `linear-gradient(135deg, #1a3d2e, #2d5a40)`,
      previewKids: <div style={{ fontFamily: T.display, fontSize: 13, fontStyle: 'italic', fontWeight: 500, color: '#f5f0e0', letterSpacing: '-0.02em' }}>Troop 567.</div>,
      hot: true },
    { name: 'Photo-bleed hero', desc: 'Full-bleed photo, headline overlay, semi-transparent nav.', live: false,
      previewGfx: `linear-gradient(135deg, #4a5d3a, #2d4a3a), radial-gradient(circle at 30% 30%, rgba(255,200,100,0.4), transparent 50%)`,
      previewKids: <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 9, color: '#fff', fontWeight: 600 }}>Where adventure starts.</div> },
    { name: 'Welcome statement', desc: 'Short paragraph + 4 quick facts. AI can draft this.', live: false,
      previewGfx: '#fff',
      previewKids: <div style={{ padding: '0 10px', fontSize: 7, color: '#444', lineHeight: 1.6 }}>
        <div style={{ fontFamily: T.display, fontSize: 9, fontWeight: 500, color: '#1a3d2e', marginBottom: 4 }}>Welcome to Troop 567</div>
        <div style={{ height: 2, background: '#e0e0e0', marginBottom: 2 }}/>
        <div style={{ height: 2, background: '#e0e0e0', marginBottom: 2, width: '85%' }}/>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {['1962', '34 🦅', '52 SCOUTS', 'TUE 7PM'].map((f, i) => (
            <div key={i} style={{ flex: 1, padding: 1, background: '#fafaf7', fontSize: 5, textAlign: 'center', color: '#1a3d2e', fontWeight: 700 }}>{f}</div>
          ))}
        </div>
      </div> },
    { name: 'Next-event countdown', desc: 'Live: pulls next event from Compass calendar.', live: true,
      previewGfx: 'linear-gradient(135deg, #e89556, #c47a3a)',
      previewKids: <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 2 }}>Spring Camporee</div>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          {[{ n: '04', l: 'D' }, { n: '12', l: 'H' }, { n: '38', l: 'M' }].map((u, i) => (
            <div key={i}>
              <div style={{ fontFamily: T.display, fontSize: 11, fontWeight: 500 }}>{u.n}</div>
              <div style={{ fontSize: 5, opacity: 0.8, fontWeight: 700, letterSpacing: '0.1em' }}>{u.l}</div>
            </div>
          ))}
        </div>
      </div>,
      hot: true },
    { name: 'Calendar grid', desc: 'Live: 6 upcoming events as cards.', live: true,
      previewGfx: '#fff',
      previewKids: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, padding: '6px 8px', width: '100%' }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ background: '#f4ede0', padding: '3px 4px', borderRadius: 2, fontSize: 5 }}>
            <div style={{ color: '#e89556', fontWeight: 700 }}>MAR {15 + i}</div>
            <div style={{ color: '#1a3d2e', fontWeight: 600 }}>Meeting</div>
          </div>
        ))}
      </div> },
    { name: 'Eagle wall', desc: 'Live: every Eagle Scout from Scoutbook, ranked by year.', live: true,
      previewGfx: '#7a1d2a',
      previewKids: <div style={{ width: '100%', padding: '4px 8px' }}>
        <div style={{ fontFamily: T.display, fontSize: 8, fontStyle: 'italic', color: '#f5d878', marginBottom: 3 }}>34 Eagles &amp; counting</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 1.5 }}>
          {Array.from({length: 16}).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1/1', borderRadius: '50%', background: '#f5d878', opacity: 0.4 + Math.random() * 0.5 }}/>
          ))}
        </div>
      </div>,
      hot: true },
    { name: 'Leadership grid', desc: 'Live: pulls leaders from Compass People with two-deep highlighted.',
      live: true, previewGfx: '#fff',
      previewKids: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, padding: '6px 8px', width: '100%' }}>
        {['ES','NA','AC','AL'].map((init, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: ['#7a1d2a','#1a3d2e','#0f2a52','#c47a3a'][i], color: '#fff', fontSize: 6, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{init}</div>
            <div style={{ fontSize: 5, color: '#555', marginTop: 1, fontWeight: 600 }}>{['SM','ASM','ASM','ASM'][i]}</div>
          </div>
        ))}
      </div> },
    { name: 'Photo collage (auto)', desc: 'Drop 6–24 photos, get a balanced layout.',
      previewGfx: '#fff',
      previewKids: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '12px', gap: 1.5, padding: '5px 8px', width: '100%' }}>
        {[
          { c: '#5a7a3a', sp: '2/2' }, { c: '#c47a3a', sp: '1/1' }, { c: '#1a3d2e', sp: '1/1' },
          { c: '#e89556', sp: '1/1' }, { c: '#7a1d2a', sp: '1/2' }, { c: '#0f2a52', sp: '2/1' },
        ].map((cell, i) => (
          <div key={i} style={{ background: cell.c, gridColumn: `span ${cell.sp.split('/')[0]}`, gridRow: `span ${cell.sp.split('/')[1]}` }}/>
        ))}
      </div> },
    { name: 'Fundraising thermometer', desc: 'Live: pulls progress from Compass Finance.', live: true,
      previewGfx: '#fff',
      previewKids: <div style={{ width: '100%', padding: '0 12px' }}>
        <div style={{ fontFamily: T.display, fontSize: 8, fontWeight: 500, color: '#1a3d2e', marginBottom: 3 }}>Philmont 2026 Trek</div>
        <div style={{ height: 8, background: '#f0e8d8', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: '64%', height: '100%', background: 'linear-gradient(90deg, #e89556, #c47a3a)', borderRadius: 4 }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6, color: '#555', marginTop: 2 }}>
          <span><strong>$8,400</strong> raised</span>
          <span>of $13,000</span>
        </div>
      </div> },
    { name: 'Achievement ticker', desc: 'Live: latest ranks, badges, awards as a stream.', live: true,
      previewGfx: '#1a3d2e',
      previewKids: <div style={{ width: '100%', padding: '0 8px' }}>
        {[
          { who: 'Eli M.', what: 'earned Eagle Scout', t: '3d' },
          { who: 'Theo R.', what: 'joined the troop', t: '1w' },
          { who: 'Sam K.', what: 'earned Cooking MB', t: '2w' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6, color: '#f5f0e0', padding: '1px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
            <span><strong>{row.who}</strong> {row.what}</span>
            <span style={{ opacity: 0.6 }}>{row.t}</span>
          </div>
        ))}
      </div> },
    { name: '"Join us" recruiter', desc: 'AI-written recruiting paragraph + RSVP-to-visit form.',
      previewGfx: 'linear-gradient(135deg, #f4ede0, #e9d9b5)',
      previewKids: <div style={{ textAlign: 'center', padding: '0 8px' }}>
        <div style={{ fontFamily: T.display, fontSize: 9, fontStyle: 'italic', color: '#1a3d2e', marginBottom: 3 }}>Curious about scouting?</div>
        <div style={{ padding: '2px 8px', background: '#1a3d2e', color: '#fff', fontSize: 6, fontWeight: 600, borderRadius: 2, display: 'inline-block' }}>Visit a meeting →</div>
      </div>,
      hot: true },
    { name: 'Sponsor strip', desc: 'Logos of chartering org & local sponsors.',
      previewGfx: '#fff',
      previewKids: <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 8px', width: '100%', gap: 6 }}>
        {['BSA', '1st U.M.C.', 'Hy-Vee', 'New Hope'].map((s, i) => (
          <div key={i} style={{ fontSize: 5, color: '#777', fontWeight: 700, letterSpacing: '0.05em' }}>{s}</div>
        ))}
      </div> },
    { name: 'Weather-aware campout banner', desc: 'Shows when a campout is within 7 days.', live: true,
      previewGfx: 'linear-gradient(135deg, #4682b4, #87ceeb)',
      previewKids: <div style={{ width: '100%', padding: '0 8px', color: '#fff' }}>
        <div style={{ fontSize: 6, fontWeight: 700, opacity: 0.85 }}>SAT MAR 22 · 4 DAYS</div>
        <div style={{ fontFamily: T.display, fontSize: 9, fontWeight: 500 }}>Spring Camporee</div>
        <div style={{ fontSize: 6, marginTop: 1 }}>52° / 38° · 20% rain · pack rain jacket</div>
      </div> },
    { name: 'Troop history timeline', desc: 'Vertical or horizontal. Auto-pulls milestones.', live: true,
      previewGfx: '#fff',
      previewKids: <div style={{ width: '100%', padding: '6px 8px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, left: 8, right: 8, height: 1, background: '#1a3d2e' }}/>
        {[1962, 1985, 2003, 2024].map((y, i) => (
          <div key={i} style={{ position: 'absolute', top: 4, left: `${10 + i * 25}%`, fontSize: 5, color: '#1a3d2e', fontWeight: 700 }}>
            <div style={{ width: 4, height: 4, borderRadius: 2, background: '#e89556', marginLeft: 4 }}/>
            {y}
          </div>
        ))}
      </div> },
    { name: 'FAQ accordion', desc: '"How much does it cost?" "What about safety?" auto-suggests.',
      previewGfx: '#fff',
      previewKids: <div style={{ width: '100%', padding: '0 8px' }}>
        {['How much does it cost?', 'What\'s the time commitment?', 'Is my kid safe?'].map((q, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6, color: '#1a3d2e', padding: '2px 0', borderTop: i ? '1px solid #f0e8d8' : 'none', fontWeight: 600 }}>
            <span>{q}</span>
            <span style={{ color: '#999' }}>+</span>
          </div>
        ))}
      </div> },
    { name: 'Embedded slideshow', desc: 'Auto-plays latest 8 photos as a slideshow.', live: true,
      previewGfx: 'linear-gradient(135deg, #2d5a40, #1a3d2e)',
      previewKids: <div style={{ display: 'flex', gap: 2, padding: '0 8px' }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ width: 22, height: 32, background: ['#c47a3a','#5a7a3a','#7a1d2a'][i-1], borderRadius: 1, transform: i === 2 ? 'scale(1.05)' : '' }}/>
        ))}
      </div> },
  ];

  const [search, setSearch] = React.useState('');

  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'flex', flexDirection: 'column' }}>
      <PBV2Topbar p={p} T={T} step={2} label="Add content blocks"/>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr 380px', minHeight: 0 }}>
        {/* Categories */}
        <div style={{ borderRight: `1px solid ${p.line}`, background: '#fff', padding: '20px 14px', overflow: 'auto' }}>
          <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Categories</div>

          {categories.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', borderRadius: 7,
              background: c.active ? p.bg : 'transparent',
              color: c.active ? p.ink : p.inkSoft,
              fontSize: 13, fontWeight: c.active ? 600 : 500,
              cursor: 'pointer', marginBottom: 2,
            }}>
              <span>{c.label}</span>
              <span style={{ fontSize: 10, color: p.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
            </div>
          ))}

          <div style={{ marginTop: 22, padding: 14, background: p.ember + '0d', border: `1px solid ${p.ember}33`, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.ember} strokeWidth="2"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
              <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Ask Compass</div>
            </div>
            <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
              Describe what you want and we'll build the section. "Add a section that shows our most recent campout with photos."
            </div>
            <button style={{ width: '100%', background: p.ember, color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Try AI assist →</button>
          </div>
        </div>

        {/* Block grid */}
        <div style={{ overflow: 'auto', padding: '20px 24px', background: p.bg }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#fff', border: `1px solid ${p.line}`, borderRadius: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 42 blocks · try 'eagle' or 'photos'"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: T.ui, color: p.ink, background: 'transparent' }}/>
            </div>
            <div style={{ display: 'flex', background: '#fff', border: `1px solid ${p.line}`, borderRadius: 8, padding: 2, fontSize: 11 }}>
              {['All', 'Live data', 'Static'].map((f, i) => (
                <div key={i} style={{
                  padding: '6px 10px', borderRadius: 5,
                  background: i === 0 ? p.bg : 'transparent',
                  color: i === 0 ? p.ink : p.inkMuted,
                  fontWeight: i === 0 ? 600 : 500,
                }}>{f}</div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Headers & heroes · 6 blocks</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {blocks.slice(0, 3).map((b, i) => <BlockTile key={i} block={b} p={p} T={T} hot={b.hot}/>)}
          </div>

          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Events & calendar · 5 blocks · all live</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {blocks.slice(3, 6).map((b, i) => <BlockTile key={i} block={b} p={p} T={T} hot={b.hot}/>)}
          </div>

          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Achievements · 5 blocks · live from Scoutbook</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {blocks.slice(6, 9).map((b, i) => <BlockTile key={i} block={b} p={p} T={T} hot={b.hot}/>)}
          </div>

          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Recruiting & extras · 7 blocks</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {blocks.slice(9).map((b, i) => <BlockTile key={i} block={b} p={p} T={T} hot={b.hot}/>)}
          </div>
        </div>

        {/* Live mini-preview */}
        <div style={{ borderLeft: `1px solid ${p.line}`, background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${p.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your page so far</div>
              <div style={{ fontSize: 13, color: p.ink, fontWeight: 600 }}>5 sections · Heritage Patch theme</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: p.success }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: p.success }}/>
              Auto-saved
            </div>
          </div>

          {/* Mini preview of the page so far */}
          <div style={{ flex: 1, padding: 14, overflow: 'auto', background: p.bg }}>
            <div style={{ background: '#fff', borderRadius: 6, overflow: 'hidden', border: `1px solid ${p.line}`, transform: 'scale(0.88)', transformOrigin: 'top center' }}>
              <PageMiniPreview p={p} T={T}/>
            </div>
          </div>

          <div style={{ padding: 14, borderTop: `1px solid ${p.lineSoft}` }}>
            <button style={{ width: '100%', background: 'transparent', border: `1px solid ${p.line}`, padding: '8px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: p.ink, marginBottom: 6 }}>Open in full preview ↗</button>
            <button style={{ width: '100%', background: p.ink, color: '#fff', border: 'none', padding: '9px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Continue to Polish →</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tiny page preview shown in the right rail
const PageMiniPreview = ({ p, T }) => (
  <div style={{ fontFamily: T.ui }}>
    {/* Hero strip */}
    <div style={{ background: '#1a3d2e', color: '#f5f0e0', padding: '14px 12px' }}>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7 }}>NEW HOPE, MN · SINCE 1962</div>
      <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 4 }}>Troop 567.</div>
      <div style={{ fontSize: 8, marginTop: 4, opacity: 0.85 }}>Where adventure starts.</div>
    </div>
    {/* Countdown */}
    <div style={{ background: '#e89556', color: '#fff', padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em' }}>NEXT CAMPOUT · 4 DAYS</div>
      <div style={{ fontFamily: T.display, fontSize: 13, fontStyle: 'italic', fontWeight: 500 }}>Spring Camporee</div>
    </div>
    {/* Welcome */}
    <div style={{ padding: '14px 12px', background: '#fff' }}>
      <div style={{ fontFamily: T.display, fontSize: 13, fontWeight: 500, color: '#1a3d2e', marginBottom: 4 }}>Welcome to Troop 567</div>
      <div style={{ fontSize: 8, color: '#444', lineHeight: 1.55 }}>We're a 60-year-old troop in New Hope, Minnesota. We hike, camp, build, and lead — together. Every Tuesday at 7 PM, all year long.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 8 }}>
        {[{n:'1962',l:'EST'},{n:'34',l:'EAGLES'},{n:'52',l:'SCOUTS'},{n:'4',l:'PATROLS'}].map((s, i) => (
          <div key={i} style={{ background: '#fafaf7', padding: 4, textAlign: 'center', borderRadius: 2 }}>
            <div style={{ fontFamily: T.display, fontSize: 11, fontWeight: 500, color: '#1a3d2e' }}>{s.n}</div>
            <div style={{ fontSize: 5, color: '#888', fontWeight: 700, letterSpacing: '0.08em' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
    {/* Calendar grid mini */}
    <div style={{ padding: '14px 12px', background: '#faf6ed', borderTop: '1px solid #f0e8d8' }}>
      <div style={{ fontFamily: T.display, fontSize: 11, fontStyle: 'italic', color: '#1a3d2e', marginBottom: 6 }}>Upcoming</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
        {['Spring Camporee · Mar 22','Court of Honor · Apr 13','Park cleanup · Apr 19','Eagle BoR · Apr 27'].map((e, i) => (
          <div key={i} style={{ background: '#fff', padding: '5px 6px', borderRadius: 2, fontSize: 7, color: '#1a3d2e' }}>{e}</div>
        ))}
      </div>
    </div>
    {/* Eagle wall mini */}
    <div style={{ padding: '14px 12px', background: '#7a1d2a', color: '#f5d878' }}>
      <div style={{ fontFamily: T.display, fontSize: 11, fontStyle: 'italic', marginBottom: 6 }}>34 Eagles &amp; counting</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 1.5 }}>
        {Array.from({length: 30}).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1/1', borderRadius: '50%', background: '#f5d878', opacity: 0.4 + Math.random() * 0.5 }}/>
        ))}
      </div>
    </div>
  </div>
);

// ───────────────────────────────────────────────────────────────
// Artboard 3: AI Assist
// Parent describes what they want; Compass writes it
// ───────────────────────────────────────────────────────────────
const PageBuilderAI = () => {
  const p = PBV2.p(); const T = PBV2.T();

  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'flex', flexDirection: 'column' }}>
      <PBV2Topbar p={p} T={T} step={2} label="Ask Compass to build a section"/>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '420px 1fr', minHeight: 0 }}>
        {/* Left — chat */}
        <div style={{ background: '#fff', borderRight: `1px solid ${p.line}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${p.lineSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: p.ember, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>Compass · AI assist</div>
                <div style={{ fontSize: 11, color: p.inkMuted }}>Knows your troop's data, calendar, photos, scouts</div>
              </div>
            </div>
          </div>

          {/* Chat thread */}
          <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* AI greeting */}
            <Bubble who="ai" p={p} T={T}>
              <div style={{ fontSize: 13, color: p.ink, lineHeight: 1.5 }}>
                I can build a section, write copy, or pick photos. Try one of these:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {[
                  'Add a section showing our last campout with photos',
                  'Write a welcome paragraph for new families',
                  'Show all our Eagle Scouts since 1962',
                  'Build a "what to expect at your first meeting" guide',
                ].map((s, i) => (
                  <div key={i} style={{ padding: '7px 10px', background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 7, fontSize: 12, color: p.inkSoft, cursor: 'pointer' }}>
                    "{s}"
                  </div>
                ))}
              </div>
            </Bubble>

            {/* User */}
            <Bubble who="user" p={p} T={T}>
              <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.5 }}>
                Add a "Why join Troop 567" section. Make it feel warm, not salesy. We're a small troop, family-feel, lots of outdoors.
              </div>
            </Bubble>

            {/* AI thinking */}
            <Bubble who="ai" p={p} T={T}>
              <div style={{ fontSize: 13, color: p.ink, lineHeight: 1.6 }}>
                Drafted a "Why scouts choose 567" section using your <strong style={{ color: p.ink }}>last 14 photos</strong>, the <strong style={{ color: p.ink }}>Tuesday meeting cadence</strong>, and a quote from <strong style={{ color: p.ink }}>your last parent survey</strong>. Three angles — pick one:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {[
                  { l: 'Story-led', sub: 'Quote-first, single big photo.', on: true },
                  { l: 'Outdoors-led', sub: 'Photo collage + 3 short reasons.', on: false },
                  { l: 'Numbers-led', sub: '4 stats + scout testimonial.', on: false },
                ].map((opt, i) => (
                  <div key={i} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: opt.on ? p.ember + '12' : p.bg,
                    border: opt.on ? `1.5px solid ${p.ember}` : `1px solid ${p.lineSoft}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: p.ink, fontWeight: 600 }}>{opt.l}</span>
                      {opt.on && <span style={{ fontSize: 10, color: p.ember, fontWeight: 700 }}>✓ Previewing</span>}
                    </div>
                    <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1 }}>{opt.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Add to page</button>
                <button style={{ background: 'transparent', color: p.inkSoft, border: `1px solid ${p.line}`, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500 }}>↻ Regenerate</button>
                <button style={{ background: 'transparent', color: p.inkSoft, border: 'none', padding: '7px 6px', fontSize: 12, fontWeight: 500 }}>Edit text</button>
              </div>
            </Bubble>
          </div>

          {/* Input */}
          <div style={{ padding: '14px 18px', borderTop: `1px solid ${p.lineSoft}`, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: p.bg, borderRadius: 22 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
              <span style={{ fontSize: 13, color: p.inkMuted, flex: 1 }}>Try "tone it down" or "shorter, more dad-like"…</span>
              <button style={{ width: 28, height: 28, borderRadius: 14, background: p.ember, color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right — live preview of generated section */}
        <div style={{ overflow: 'auto', padding: '24px 32px', background: p.bg }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live preview · Story-led</div>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, marginTop: 2 }}>"Why scouts choose 567"</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ background: '#fff', border: `1px solid ${p.line}`, padding: '7px 10px', borderRadius: 7, fontSize: 11, color: p.inkSoft, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h20v12H2zM8 20h8"/></svg>
                Desktop
              </button>
              <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '7px 10px', borderRadius: 7, fontSize: 11, color: p.inkMuted, fontWeight: 600 }}>Mobile</button>
            </div>
          </div>

          {/* The actual generated section preview */}
          <div style={{ background: '#fdfaf2', border: `1px solid ${p.line}`, borderRadius: 10, padding: 48, position: 'relative' }}>
            {/* selection halo */}
            <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, color: p.ember, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: p.ember }}/>
              Generated · click to edit
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 40, alignItems: 'center', marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Why scouts choose 567</div>
                <h2 style={{ fontFamily: T.display, fontSize: 42, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0, color: '#1a3d2e' }}>
                  "I joined for the camping. I stayed for the&nbsp;people."
                </h2>
                <div style={{ marginTop: 16, fontSize: 13, color: p.inkSoft, fontFamily: T.display, fontStyle: 'italic' }}>
                  — Marcus L., 14, Eagle Scout candidate
                </div>
                <p style={{ fontSize: 15, color: p.inkSoft, lineHeight: 1.65, marginTop: 24, maxWidth: 420 }}>
                  We're a small, fifty-something troop in New Hope. Big enough to send patrols to Philmont, small enough that every scout's name gets called at every meeting. New scouts and their parents are welcome at any Tuesday at 7 PM — no commitment, just come see.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
                  <button style={{ background: '#1a3d2e', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>Visit a meeting →</button>
                  <span style={{ fontSize: 12, color: p.inkMuted }}>Tuesdays · 7 PM · 1st U.M.C.</span>
                </div>
              </div>
              <div style={{ position: 'relative', aspectRatio: '4/5', borderRadius: 8, overflow: 'hidden', background: 'linear-gradient(135deg, #2d5a40, #1a3d2e)' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 60% 40%, rgba(245,216,120,0.3), transparent 60%)' }}/>
                {/* Photo placeholder w/ hint */}
                <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M3 7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
                  Pulled from "Hartley Hike · Mar 8" gallery — replace from 213 troop photos
                </div>
              </div>
            </div>
          </div>

          {/* Source breadcrumb */}
          <div style={{ marginTop: 16, padding: 14, background: '#fff', border: `1px solid ${p.line}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Sources Compass used</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              {[
                { i: '💬', l: 'Spring 2024 parent survey', d: '"Marcus L. quote — 91% of families said community was the #1 reason."' },
                { i: '📸', l: 'Photo gallery · Hartley Hike', d: '14 photos · uploaded by Mr. Patel · highest engagement last 30d' },
                { i: '📅', l: 'Recurring event · Tuesday meeting', d: '7:00 PM at 1st U.M.C. New Hope' },
                { i: '👥', l: 'Roster · Compass People', d: '52 scouts · 11 leaders · last updated 2 days ago' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span>{s.i}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: p.ink, fontWeight: 600 }}>{s.l} </span>
                    <span style={{ color: p.inkMuted }}>· {s.d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Bubble = ({ who, children, p, T }) => (
  <div style={{
    alignSelf: who === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '92%',
    padding: '12px 14px',
    borderRadius: who === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    background: who === 'user' ? p.ink : p.bg,
    border: who === 'user' ? 'none' : `1px solid ${p.lineSoft}`,
  }}>
    {children}
  </div>
);

// ───────────────────────────────────────────────────────────────
// Artboard 4: The result — full finished page
// ───────────────────────────────────────────────────────────────
const PageBuilderResult = () => {
  const p = PBV2.p(); const T = PBV2.T();

  return (
    <div style={{ width: 1200, height: 2400, background: '#1a3d2e', fontFamily: T.ui, color: '#f5f0e0', position: 'relative' }}>
      {/* Browser chrome */}
      <div style={{ background: '#1a3d2e', padding: '24px 56px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SHMark size={26} color="#f5f0e0" accent="#e89556"/>
          <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, fontStyle: 'italic' }}>Troop 567</div>
        </div>
        <div style={{ display: 'flex', gap: 28, fontSize: 13, fontWeight: 500 }}>
          {['About', 'Calendar', 'Photos', 'Eagles', 'Join us', 'Members'].map((l, i) => (
            <span key={i} style={{ opacity: l === 'About' ? 1 : 0.7 }}>{l}</span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '70px 56px 80px', position: 'relative' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', opacity: 0.7, marginBottom: 18 }}>NEW HOPE, MN · CHARTERED 1962</div>
        <h1 style={{ fontFamily: T.display, fontSize: 144, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.04em', margin: 0, fontStyle: 'italic' }}>
          Troop 567.
        </h1>
        <div style={{ fontFamily: T.display, fontSize: 32, fontStyle: 'italic', opacity: 0.85, marginTop: 14, maxWidth: 700, fontWeight: 400, lineHeight: 1.2 }}>
          Where adventure starts —<br/>and where scouts grow up.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 36 }}>
          <button style={{ background: '#e89556', color: '#1a3d2e', border: 'none', padding: '14px 28px', borderRadius: 4, fontSize: 14, fontWeight: 700, letterSpacing: '0.04em' }}>Visit a meeting →</button>
          <span style={{ fontSize: 13, opacity: 0.85 }}>Tuesdays · 7 PM · 1st U.M.C.</span>
        </div>
      </div>

      {/* Countdown band */}
      <div style={{ background: '#e89556', color: '#1a3d2e', padding: '24px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Coming up · Spring Camporee</div>
          <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, fontStyle: 'italic', marginTop: 2 }}>Friday March 22 — Sunday March 24</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[{ n: '04', l: 'DAYS' }, { n: '12', l: 'HOURS' }, { n: '38', l: 'MIN' }].map((u, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: T.display, fontSize: 44, fontWeight: 500, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{u.n}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', marginTop: 4 }}>{u.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Welcome / stats */}
      <div style={{ background: '#fdfaf2', color: '#1a1a1a', padding: '80px 56px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 56 }}>
          <div>
            <div style={{ fontSize: 11, color: '#7a1d2a', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>Welcome to Troop 567</div>
            <h2 style={{ fontFamily: T.display, fontSize: 52, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0, fontStyle: 'italic' }}>
              "I joined for the camping. I stayed for the&nbsp;people."
            </h2>
            <div style={{ fontFamily: T.display, fontSize: 16, fontStyle: 'italic', color: '#5a5147', marginTop: 14 }}>— Marcus L., 14, Eagle Scout candidate</div>
            <p style={{ fontSize: 17, color: '#3a3530', lineHeight: 1.7, marginTop: 32, maxWidth: 480 }}>
              We're a 60-year-old troop in New Hope, Minnesota. Big enough to send patrols to Philmont and Sea Base, small enough that every scout's name gets called at every Tuesday meeting. We hike, camp, build, and lead — together.
            </p>
            <div style={{ marginTop: 32, padding: 24, background: '#fff', border: '1px solid #f0e8d8', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#5a5147', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Curious?</div>
              <div style={{ fontFamily: T.display, fontSize: 22, fontStyle: 'italic', fontWeight: 500, color: '#1a3d2e' }}>Come Tuesday at 7. No commitment.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignContent: 'center' }}>
            {[
              { n: '1962', l: 'Chartered' },
              { n: '34', l: 'Eagle Scouts' },
              { n: '52', l: 'Active scouts' },
              { n: '4', l: 'Patrols' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#1a3d2e', color: '#f5f0e0', padding: 32, borderRadius: 6 }}>
                <div style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', fontStyle: 'italic' }}>{s.n}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 8, opacity: 0.75 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Photo collage section */}
      <div style={{ background: '#1a3d2e', padding: '80px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 11, color: '#e89556', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>Last 30 days</div>
            <h2 style={{ fontFamily: T.display, fontSize: 52, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.02em', margin: 0 }}>What we've been up to.</h2>
          </div>
          <span style={{ fontSize: 13, opacity: 0.7 }}>See all 213 photos →</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: 130, gap: 6 }}>
          {[
            { c: 'linear-gradient(135deg, #5a7a3a, #2d4a3a)', sp: 'span 2 / span 2' },
            { c: 'linear-gradient(135deg, #c47a3a, #7a4a2a)', sp: 'span 1 / span 1' },
            { c: 'linear-gradient(135deg, #2d5a40, #1a3d2e)', sp: 'span 1 / span 1' },
            { c: 'linear-gradient(135deg, #7a1d2a, #4a0a14)', sp: 'span 1 / span 1' },
            { c: 'linear-gradient(135deg, #4682b4, #2d5a85)', sp: 'span 1 / span 1' },
            { c: 'linear-gradient(135deg, #c47a3a, #e89556)', sp: 'span 2 / span 1' },
            { c: 'linear-gradient(135deg, #5a7a3a, #2d4a3a)', sp: 'span 1 / span 1' },
            { c: 'linear-gradient(135deg, #2d3a4a, #1a2030)', sp: 'span 1 / span 1' },
            { c: 'linear-gradient(135deg, #7a1d2a, #4a0a14)', sp: 'span 1 / span 1' },
          ].map((cell, i) => (
            <div key={i} style={{ background: cell.c, gridArea: cell.sp, borderRadius: 4 }}/>
          ))}
        </div>
      </div>

      {/* Eagles wall */}
      <div style={{ background: '#7a1d2a', color: '#f5d878', padding: '80px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10, opacity: 0.85 }}>Since 1962</div>
            <h2 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.02em', margin: 0 }}>34 Eagles &amp; counting.</h2>
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, maxWidth: 320 }}>Every Eagle Scout in our 60-year history. Names, projects, and stories.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 }}>
          {Array.from({length: 34}).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1/1', borderRadius: '50%', background: '#f5d878', opacity: 0.5 + (i / 34) * 0.5, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a1d2a', fontWeight: 700, fontSize: 11, fontFamily: T.display }}>
              {String(1962 + i * 2).slice(2)}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#0f2a1e', padding: '40px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, opacity: 0.6 }}>
        <div>Troop 567 of New Hope, Minnesota · Chartered to 1st U.M.C.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SHMark size={12} color="#f5f0e0" accent="#e89556"/>
          <span>Site by <strong style={{ opacity: 0.9 }}>Compass</strong></span>
        </div>
      </div>

      {/* Floating "made in 22 minutes" badge */}
      <div style={{
        position: 'absolute', top: 24, right: 24,
        background: '#fff', color: '#1a3d2e',
        padding: '10px 14px', borderRadius: 22,
        fontSize: 11, fontWeight: 600,
        boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e89556" strokeWidth="2.5"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
        Built in <strong>22 minutes</strong> · zero design experience
      </div>
    </div>
  );
};

window.PageBuilderThemes = PageBuilderThemes;
window.PageBuilderBlocks = PageBuilderBlocks;
window.PageBuilderAI = PageBuilderAI;
window.PageBuilderResult = PageBuilderResult;
