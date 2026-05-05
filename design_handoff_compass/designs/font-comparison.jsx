// Font pairing comparison — five options shown with the same Compass content
// so the user can pick visually.

const FONT_PAIRS = [
  {
    id: 'chosen',
    name: 'Newsreader + Inter Tight',
    note: 'Selected direction. Editorial serif headlines + neutral sans for UI. Warm, trustworthy, not trendy.',
    display: '"Newsreader", Georgia, serif',
    ui: '"Inter Tight", system-ui, sans-serif',
    displayItalic: true,
  },
];

const FontSpecimen = ({ pair, p }) => {
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 14, borderBottom: `1px solid ${p.lineSoft}` }}>
        <div>
          <div style={{ fontFamily: pair.ui, fontSize: 11, color: p.inkMuted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Option · {pair.id}</div>
          <div style={{ fontFamily: pair.ui, fontSize: 16, fontWeight: 600, color: p.ink }}>{pair.name}</div>
        </div>
        <div style={{ fontFamily: pair.ui, fontSize: 11, color: p.inkMuted, fontVariantNumeric: 'tabular-nums' }}>aA · 1234567890</div>
      </div>

      {/* Big display headline */}
      <div>
        <div style={{
          fontFamily: pair.display,
          fontSize: 64,
          lineHeight: 0.95,
          letterSpacing: '-0.025em',
          fontWeight: pair.displayWeight || 400,
          color: p.ink,
        }}>
          Your troop's<br/>
          <span style={{ fontStyle: pair.displayItalic ? 'italic' : 'normal', color: p.primary }}>home base.</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ fontFamily: pair.ui, fontSize: 14, lineHeight: 1.6, color: p.inkSoft, maxWidth: 520 }}>
        Compass is the calendar, troop website, photo library, and parent communications — all in one place. Scoutbook handles advancement; we handle everything else.
      </div>

      {/* UI sample row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontFamily: pair.ui }}>
        <button style={{ background: p.primary, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: pair.ui }}>Start free trial</button>
        <button style={{ background: 'transparent', color: p.ink, border: `1px solid ${p.line}`, padding: '10px 16px', borderRadius: 8, fontSize: 14, fontFamily: pair.ui }}>See features</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: p.surfaceAlt === '#1a1f1a' ? p.bg : p.surfaceAlt, borderRadius: 999, fontSize: 12, color: p.inkSoft }}>
          <span style={{ width: 6, height: 6, background: p.success, borderRadius: '50%' }}/>
          1,247 troops · SOC 2
        </span>
      </div>

      {/* Mock event row */}
      <div style={{ background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', gap: 14, fontFamily: pair.ui }}>
        <div style={{ width: 48, textAlign: 'center', background: p.surface, border: `1px solid ${p.line}`, borderRadius: 6, padding: '4px 0' }}>
          <div style={{ fontFamily: pair.ui, fontSize: 9, fontWeight: 700, color: p.primary, letterSpacing: '0.06em' }}>SAT</div>
          <div style={{ fontFamily: pair.display, fontSize: 18, fontWeight: 500, lineHeight: 1, color: p.ink }}>9</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: p.ink }}>Boundary Waters Trek</div>
          <div style={{ fontSize: 12, color: p.inkSoft, fontVariantNumeric: 'tabular-nums' }}>6:00 AM · Ely, MN · 18 of 22 going</div>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.inkMuted }}>$85.00</div>
      </div>

      {/* Description */}
      <div style={{ fontFamily: pair.ui, fontSize: 12, color: p.inkMuted, lineHeight: 1.5, paddingTop: 14, borderTop: `1px solid ${p.lineSoft}`, fontStyle: 'italic' }}>
        {pair.note}
      </div>
    </div>
  );
};

const FontComparison = ({ palette: p }) => {
  return (
    <div style={{ width: 1600, padding: 40, background: p.bg, color: p.ink, fontFamily: '"Inter Tight", system-ui, sans-serif' }}>
      <div style={{ marginBottom: 32, maxWidth: 720 }}>
        <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Type direction · selected</div>
        <h1 style={{ fontFamily: 'Newsreader, serif', fontSize: 48, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
          Newsreader + Inter Tight. <span style={{ fontStyle: 'italic', color: p.accent }}>Locked in.</span>
        </h1>
        <p style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.55, margin: 0 }}>
          Editorial serif for headlines, neutral sans for UI. Warm but not trendy — the pair is already in use across every Compass design on this canvas.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, maxWidth: 780 }}>
        {FONT_PAIRS.map(pair => <FontSpecimen key={pair.id} pair={pair} p={p}/>)}
      </div>
    </div>
  );
};

window.FontComparison = FontComparison;
