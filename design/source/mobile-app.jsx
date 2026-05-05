// Compass mobile parent app — 8 screens
// Uses balanced/Slate-Sky palette by default. p.accent is sky-blue.
// All screens are 402×874 (iPhone 16). Each is wrapped in IOSDevice.

const M = {
  // shorthand to grab palette
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─────────────────────────────────────────────────────────────
// Tab bar (bottom nav, glassy)
// ─────────────────────────────────────────────────────────────
const MobileTabBar = ({ active = 'home', p }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V11z' },
    { id: 'cal', label: 'Calendar', icon: 'M7 3v2M17 3v2M4 8h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
    { id: 'msg', label: 'Messages', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z' },
    { id: 'photo', label: 'Photos', icon: 'M3 7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    { id: 'me', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 12,
      height: 64, borderRadius: 28,
      background: 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: '0.5px solid rgba(0,0,0,0.06)',
      boxShadow: '0 4px 20px rgba(15,23,42,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '0 8px',
    }}>
      {tabs.map(t => (
        <div key={t.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          color: t.id === active ? p.accent : p.inkMuted,
          flex: 1,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={t.id === active ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon}/>
          </svg>
          <div style={{ fontSize: 10, fontWeight: t.id === active ? 600 : 500 }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 1 — Home
// ─────────────────────────────────────────────────────────────
const MobileHome = () => {
  const p = M.p(); const T = M.T();
  return (
    <IOSDevice width={402} height={874} title="Compass · Your Troop">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        {/* Header */}
        <div style={{ padding: '8px 20px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: p.inkMuted, fontWeight: 500 }}>Tuesday, March 18</div>
              <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 400, letterSpacing: '-0.02em', color: p.ink, lineHeight: 1.1 }}>Hi, Alex.</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>SK</div>
          </div>

          {/* Next-up card */}
          <div style={{ background: p.surfaceDark, color: '#fff', borderRadius: 18, padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: p.accent, opacity: 0.2 }}/>
            <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Next up · This Friday</div>
            <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', marginBottom: 6 }}>Spring Campout —<br/>Birch Lake State Park</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 14 }}>Fri 5:30 PM departure · Sun 11:00 AM return</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'rgba(245,158,11,0.18)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.4)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
              <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 500, lineHeight: 1.3 }}>Permission slip + $35 due by Thursday 9 PM</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 28 }}>
          {[
            { l: 'RSVP\n& pay', c: p.accent, i: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
            { l: 'Message\nleaders', c: p.ember, i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z' },
            { l: 'Drop\nphotos', c: p.teal, i: 'M3 7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
          ].map((a, i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: a.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.i}/></svg>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.ink, lineHeight: 1.2, whiteSpace: 'pre-line' }}>{a.l}</div>
            </div>
          ))}
        </div>

        {/* Activity feed */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ fontSize: 12, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Recently</div>
          {[
            { t: 'Mr. Avery posted 47 photos from Klondike Derby', sub: '2h ago · Photos', c: p.teal, ic: 'M3 7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
            { t: 'Eagle Court of Honor scheduled — May 4', sub: 'Yesterday · Calendar', c: p.accent, ic: 'M7 3v2M17 3v2M4 8h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
            { t: 'Treasurer: Popcorn payouts processed', sub: '2 days ago · Finance', c: p.ember, ic: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
          ].map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < 2 ? `1px solid ${p.lineSoft}` : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: a.c + '22', color: a.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.ic}/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: p.ink, fontWeight: 500, lineHeight: 1.3 }}>{a.t}</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <MobileTabBar active="home" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 2 — Calendar (list view)
// ─────────────────────────────────────────────────────────────
const MobileCalendar = () => {
  const p = M.p(); const T = M.T();
  const events = [
    { mo: 'MAR', d: '21', t: 'Spring Campout', sub: 'Birch Lake State Park', meta: '2 nights · 18 going · permission slip + $35', c: p.ember, status: 'rsvp' },
    { mo: 'MAR', d: '25', t: 'Troop Meeting', sub: "St. Mark's · 7:00 PM", meta: 'Patrol meetings · Knot relay', c: p.accent, status: 'going' },
    { mo: 'APR', d: '04', t: 'Eagle Project — Jamie', sub: 'Riverside Park · 9:00 AM', meta: 'Trail repair · Bring work gloves', c: p.teal, status: 'maybe' },
    { mo: 'APR', d: '12', t: 'PLC Meeting', sub: 'Online · 8:00 PM', meta: 'PL & APL only', c: p.plum, status: 'going' },
    { mo: 'APR', d: '26', t: 'High-Adventure Trip Briefing', sub: "St. Mark's · 7:00 PM", meta: 'Required for High-Adventure crew', c: p.raspberry, status: 'rsvp' },
    { mo: 'MAY', d: '04', t: 'Eagle Court of Honor', sub: "St. Mark's Hall · 2:00 PM", meta: 'Three new Eagles · Reception after', c: p.accent, status: 'going' },
  ];
  const statusBadge = (s) => {
    if (s === 'going') return { l: 'Going', bg: p.success + '22', fg: p.success };
    if (s === 'maybe') return { l: 'Maybe', bg: p.ember + '22', fg: p.ember };
    return { l: 'RSVP', bg: p.accent, fg: '#fff' };
  };
  return (
    <IOSDevice width={402} height={874} title="Compass · Calendar">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        {/* Header */}
        <div style={{ padding: '8px 20px 16px', position: 'sticky', top: 0, background: p.bg, zIndex: 10, borderBottom: `1px solid ${p.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Calendar</h1>
            <span style={{ fontSize: 12, color: p.inkMuted, fontWeight: 500 }}>March 2026</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['All', 'My RSVPs', 'Outings', 'Meetings'].map((f, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: i === 0 ? p.ink : p.surface,
                color: i === 0 ? '#fff' : p.inkSoft,
                border: i === 0 ? 'none' : `1px solid ${p.line}`,
              }}>{f}</div>
            ))}
          </div>
        </div>

        {/* Events */}
        <div style={{ padding: '12px 20px' }}>
          {events.map((e, i) => {
            const b = statusBadge(e.status);
            return (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: i < events.length - 1 ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{
                  width: 52, flexShrink: 0, textAlign: 'center', borderRadius: 10,
                  background: e.c + '18', color: e.c, padding: '6px 0',
                  border: `1px solid ${e.c}33`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>{e.mo}</div>
                  <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, lineHeight: 1, marginTop: 1 }}>{e.d}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: p.ink, lineHeight: 1.3 }}>{e.t}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: b.bg, color: b.fg, flexShrink: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{b.l}</div>
                  </div>
                  <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 2 }}>{e.sub}</div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 4, lineHeight: 1.3 }}>{e.meta}</div>
                </div>
              </div>
            );
          })}
        </div>

        <MobileTabBar active="cal" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 3 — Event detail / RSVP
// ─────────────────────────────────────────────────────────────
const MobileEvent = () => {
  const p = M.p(); const T = M.T();
  return (
    <IOSDevice width={402} height={874} title="Compass · Event">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 120, fontFamily: T.ui }}>
        {/* Hero photo */}
        <div style={{ height: 220, background: `linear-gradient(135deg, ${p.surfaceDark}, ${p.accent})`, position: 'relative', overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 402 220" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <linearGradient id="evgr" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#0f172a" stopOpacity="0.1"/>
                <stop offset="1" stopColor="#0f172a" stopOpacity="0.6"/>
              </linearGradient>
            </defs>
            <polygon points="0,160 60,120 120,150 180,90 260,140 340,100 402,130 402,220 0,220" fill="#0f172a" opacity="0.5"/>
            <polygon points="0,180 80,150 160,170 240,130 320,160 402,140 402,220 0,220" fill="#0f172a" opacity="0.7"/>
            <rect x="0" y="0" width="402" height="220" fill="url(#evgr)"/>
          </svg>
          <div style={{ position: 'absolute', top: 12, left: 16, width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={p.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </div>
          <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, color: '#fff' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: p.accent, marginBottom: 6 }}>Outing · 2 nights</div>
            <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.015em' }}>Spring Campout —<br/>Birch Lake State Park</div>
          </div>
        </div>

        {/* Key facts */}
        <div style={{ padding: '20px', borderBottom: `1px solid ${p.line}` }}>
          {[
            { l: 'When', v: 'Fri Mar 21, 5:30 PM —\nSun Mar 23, 11:00 AM' },
            { l: 'Where', v: 'Birch Lake State Park\n19041 County Hwy 7' },
            { l: 'Cost', v: '$35 per scout · covers food & site' },
            { l: 'Bring', v: 'Class B uniform, sleeping bag rated 30°F, mess kit, water bottle' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 16, padding: '10px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
              <div style={{ fontSize: 11, color: p.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, paddingTop: 2 }}>{row.l}</div>
              <div style={{ fontSize: 14, color: p.ink, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{row.v}</div>
            </div>
          ))}
        </div>

        {/* RSVP block */}
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>RSVP for</div>
          {[
            { name: 'Sam', sub: 'Scout · Hawk Patrol', going: true, slip: false },
            { name: 'Max', sub: 'Scout · Hawk Patrol', going: true, slip: false },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: p.accent + '22', color: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>{s.name.split(' ').map(n => n[0]).join('')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>{s.name}</div>
                <div style={{ fontSize: 11, color: p.inkMuted }}>{s.sub}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Yes', 'No', 'Maybe'].map((b, j) => (
                  <div key={j} style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: j === 0 ? p.success : p.surface,
                    color: j === 0 ? '#fff' : p.inkSoft,
                    border: j === 0 ? 'none' : `1px solid ${p.line}`,
                  }}>{b}</div>
                ))}
              </div>
            </div>
          ))}

          {/* Permission slip + payment summary */}
          <div style={{ marginTop: 16, padding: 16, background: p.ember + '12', border: `1px solid ${p.ember}55`, borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={p.ember} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8"/></svg>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>Permission slip + $70 due Thursday</div>
            </div>
            <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.5, marginBottom: 12 }}>
              One slip per scout. We'll pre-fill what we know. Sign with your finger; we'll countersign before departure.
            </div>
            <button style={{ width: '100%', background: p.ink, color: '#fff', border: 'none', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Sign & pay $70 →</button>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 4 — Payment confirmation
// ─────────────────────────────────────────────────────────────
const MobilePayment = () => {
  const p = M.p(); const T = M.T();
  return (
    <IOSDevice width={402} height={874} title="Compass · Pay">
      <div style={{ background: p.bg, minHeight: '100%', fontFamily: T.ui, paddingBottom: 40 }}>
        <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: p.surface, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </div>
          <div style={{ fontSize: 12, color: p.inkMuted, fontWeight: 500, padding: '10px 0' }}>Step 2 of 2</div>
          <div style={{ width: 36 }}/>
        </div>

        <div style={{ padding: '24px 20px 20px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: p.accent, marginBottom: 8 }}>Spring Campout · Whitewater</div>
          <h1 style={{ fontFamily: T.display, fontSize: 30, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 16px', lineHeight: 1.05 }}>Pay $70 to confirm.</h1>

          {/* Summary */}
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            {[
              { l: 'Sam — campout fee', v: '$35.00' },
              { l: 'Max — campout fee', v: '$35.00' },
              { l: 'Processing fee', v: '$2.33', muted: true },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 2 ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{ fontSize: 13, color: row.muted ? p.inkMuted : p.ink }}>{row.l}</div>
                <div style={{ fontSize: 13, color: row.muted ? p.inkMuted : p.ink, fontVariantNumeric: 'tabular-nums' }}>{row.v}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: `1.5px solid ${p.ink}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>Total</div>
              <div style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, color: p.ink, fontVariantNumeric: 'tabular-nums' }}>$72.33</div>
            </div>
          </div>

          {/* Payment method */}
          <div style={{ fontSize: 11, color: p.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>Payment</div>
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 30, borderRadius: 5, background: '#1a1f36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.1em' }}>VISA</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>Visa ending 4242</div>
              <div style={{ fontSize: 11, color: p.inkMuted }}>Default · expires 09/28</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
          <div style={{ fontSize: 11, color: p.inkMuted, textAlign: 'center', marginTop: 10, marginBottom: 18 }}>
            Powered by Stripe · receipts emailed to alex@example.com
          </div>

          <button style={{ width: '100%', background: p.ink, color: '#fff', border: 'none', padding: '16px', borderRadius: 12, fontSize: 15, fontWeight: 600, fontFamily: T.ui }}>Pay $72.33</button>
          <button style={{ width: '100%', background: 'transparent', color: p.inkSoft, border: 'none', padding: '12px', fontSize: 13, fontWeight: 500, marginTop: 6 }}>Pay with Apple Pay</button>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 5 — Messages list
// ─────────────────────────────────────────────────────────────
const MobileMessages = () => {
  const p = M.p(); const T = M.T();
  const threads = [
    { name: 'Spring Campout — drivers needed', last: 'Mr. Avery: Got two more spots covered.', t: '14m', n: 3, c: p.ember, pin: true },
    { name: 'Hawk Patrol', last: 'Henry: knot-tying tonight at 7?', t: '1h', n: 1, c: p.accent },
    { name: 'Mr. Avery (Scoutmaster)', last: 'Quick note about Eli\'s rank conf…', t: '3h', n: 0, c: p.plum, twoDeep: true },
    { name: 'Treasurer · Ms. Carter', last: 'Popcorn payouts processed.', t: 'Yest', n: 0, c: p.teal },
    { name: 'All Parents', last: 'Kelly: Anyone driving from across town?', t: 'Yest', n: 0, c: p.ink },
    { name: 'Eagle Project — Jamie', last: 'Liam: thanks for signing up!', t: '2d', n: 0, c: p.raspberry },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Messages">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        <div style={{ padding: '8px 20px 12px', borderBottom: `1px solid ${p.line}`, background: p.bg, position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Messages</h1>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </div>
          </div>
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <div style={{ fontSize: 13, color: p.inkMuted }}>Search threads</div>
          </div>
        </div>
        <div style={{ padding: '0 20px' }}>
          {threads.map((th, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: i < threads.length - 1 ? `1px solid ${p.lineSoft}` : 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: th.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                {th.name.split(' ').filter(w => w[0] && w[0].match(/[A-Z]/)).slice(0, 2).map(w => w[0]).join('') || th.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {th.pin && <svg width="11" height="11" viewBox="0 0 24 24" fill={p.accent}><path d="M12 2l2 7h7l-5.5 4 2 7-5.5-4-5.5 4 2-7L3 9h7z"/></svg>}
                    <div style={{ fontSize: 14, fontWeight: 600, color: p.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{th.name}</div>
                  </div>
                  <div style={{ fontSize: 11, color: p.inkMuted, flexShrink: 0 }}>{th.t}</div>
                </div>
                {th.twoDeep && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: p.success, fontWeight: 600, marginTop: 3, padding: '2px 6px', background: p.success + '18', borderRadius: 4 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    TWO-DEEP · MR. PARK CC'd
                  </div>
                )}
                <div style={{ fontSize: 13, color: p.inkSoft, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{th.last}</div>
              </div>
              {th.n > 0 && (
                <div style={{ minWidth: 20, height: 20, padding: '0 6px', background: p.accent, color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>{th.n}</div>
              )}
            </div>
          ))}
        </div>
        <MobileTabBar active="msg" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 6 — Message thread (with two-deep banner)
// ─────────────────────────────────────────────────────────────
const MobileThread = () => {
  const p = M.p(); const T = M.T();
  const msgs = [
    { who: 'Mr. Avery', role: 'Scoutmaster', side: 'l', text: 'Hi Alex — quick note. Eli\'s rank conference is set for next Tuesday during the meeting. Should take 20 min.', t: '2:14 PM' },
    { who: 'Mr. Brooks', role: 'Asst. Scoutmaster', side: 'l', text: 'Looping in as second adult per YPT.', t: '2:15 PM', meta: true },
    { who: 'Sarah', role: '', side: 'r', text: 'Great, thanks both. Anything Eli should bring/prep?', t: '2:31 PM' },
    { who: 'Mr. Avery', role: 'Scoutmaster', side: 'l', text: 'Just his handbook with sign-offs through Star. We\'ll go over the SM conf items together.', t: '2:34 PM' },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Thread">
      <div style={{ background: p.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.ui }}>
        {/* Top bar */}
        <div style={{ padding: '6px 16px 12px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', gap: 10, background: p.surface }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>MH</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>Mr. Avery</div>
            <div style={{ fontSize: 11, color: p.inkMuted }}>Scoutmaster · Troop 12</div>
          </div>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="1.8"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </div>

        {/* Two-deep banner */}
        <div style={{ padding: '10px 16px', background: p.success + '12', borderBottom: `1px solid ${p.success}33`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="2" style={{ marginTop: 1 }}><path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z M9 12l2 2 4-4"/></svg>
          <div style={{ fontSize: 11, color: p.success, lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>TWO-DEEP LEADERSHIP · YPT compliant</div>
            <div style={{ color: p.inkSoft, fontWeight: 500 }}>This thread is auto-CC'd to Mr. Brooks (ASM) and logged for review. Required for any 1:1 with a youth or parent.</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.side === 'r' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%' }}>
                {m.side === 'l' && !m.meta && (
                  <div style={{ fontSize: 10, color: p.inkMuted, marginBottom: 3, marginLeft: 12, fontWeight: 600 }}>{m.who} · {m.role}</div>
                )}
                {m.meta ? (
                  <div style={{ fontSize: 10, color: p.success, fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>↳ {m.who} ({m.role}) added by YPT auto-cc</div>
                ) : (
                  <div style={{
                    background: m.side === 'r' ? p.accent : p.surface,
                    color: m.side === 'r' ? '#fff' : p.ink,
                    border: m.side === 'r' ? 'none' : `1px solid ${p.line}`,
                    borderRadius: 18,
                    borderBottomRightRadius: m.side === 'r' ? 6 : 18,
                    borderBottomLeftRadius: m.side === 'l' ? 6 : 18,
                    padding: '10px 14px',
                    fontSize: 14,
                    lineHeight: 1.4,
                  }}>{m.text}</div>
                )}
                {!m.meta && <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 3, textAlign: m.side === 'r' ? 'right' : 'left', marginLeft: 12, marginRight: 12 }}>{m.t}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Compose */}
        <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${p.line}`, background: p.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.bg, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <div style={{ flex: 1, background: p.bg, border: `1px solid ${p.line}`, borderRadius: 18, padding: '8px 14px', fontSize: 13, color: p.inkMuted }}>Reply…</div>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/></svg>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 7 — Photos grid
// ─────────────────────────────────────────────────────────────
const MobilePhotos = () => {
  const p = M.p(); const T = M.T();
  const groups = [
    { title: 'Klondike Derby', sub: 'Mar 1 · 47 photos · by Mr. Avery', tiles: [p.accent, p.ember, p.teal, p.plum, p.raspberry, p.butter] },
    { title: 'Eagle Project — Jamie', sub: 'Feb 22 · 18 photos · by Jamie', tiles: [p.teal, p.accent, p.ember] },
    { title: 'Court of Honor', sub: 'Jan 19 · 32 photos · by Ms. Carter', tiles: [p.plum, p.butter, p.accent, p.ember] },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Photos">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        <div style={{ padding: '8px 20px 12px', position: 'sticky', top: 0, background: p.bg, zIndex: 10, borderBottom: `1px solid ${p.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Photos</h1>
            <div style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>+ Drop</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['By event', 'By scout', 'My uploads'].map((f, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: i === 0 ? p.ink : p.surface,
                color: i === 0 ? '#fff' : p.inkSoft,
                border: i === 0 ? 'none' : `1px solid ${p.line}`,
              }}>{f}</div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {groups.map((g, i) => (
            <div key={i} style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em', color: p.ink }}>{g.title}</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{g.sub}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {g.tiles.map((c, j) => (
                  <div key={j} style={{
                    aspectRatio: '1',
                    background: `linear-gradient(135deg, ${c}, ${c}99)`,
                    borderRadius: 6,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
                      <polygon points={`0,${60 + j*3} 30,${40 + j*4} 60,${55 - j*2} 100,${45 + j*3} 100,100 0,100`} fill="#0f172a"/>
                    </svg>
                    {j === g.tiles.length - 1 && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 600 }}>+{i === 0 ? 41 : i === 1 ? 15 : 28}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <MobileTabBar active="photo" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 8 — Photo permissions
// ─────────────────────────────────────────────────────────────
const MobilePhotoPerms = () => {
  const p = M.p(); const T = M.T();
  const Toggle = ({ on, color }) => (
    <div style={{
      width: 44, height: 26, borderRadius: 13, background: on ? (color || p.success) : p.line,
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 22, height: 22, borderRadius: 11, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}/>
    </div>
  );
  return (
    <IOSDevice width={402} height={874} title="Compass · Privacy">
      <div style={{ background: p.bg, minHeight: '100%', fontFamily: T.ui, paddingBottom: 40 }}>
        <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ fontSize: 14, color: p.accent, fontWeight: 500 }}>Settings</div>
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Privacy</div>
          <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 8px', lineHeight: 1.1 }}>Photo permissions</h1>
          <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.5, margin: '0 0 20px' }}>
            Set what's allowed for each scout in your family. These rules apply everywhere — public site, parent feed, and any leader exports. We never train on your photos.
          </p>

          {[
            { name: 'Sam', sub: 'Hawk Patrol · age 14' },
            { name: 'Max', sub: 'Hawk Patrol · age 12' },
          ].map((s, si) => (
            <div key={si} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 4, borderBottom: `1px solid ${p.lineSoft}` }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: p.accent + '22', color: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>{s.name.split(' ').map(n => n[0]).join('')}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: p.ink }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: p.inkMuted }}>{s.sub}</div>
                </div>
              </div>
              {[
                { l: 'Show on public troop site', sub: 'compass.app/troop567', on: si === 0, color: null },
                { l: 'Show in parent-only feed', sub: 'Visible to verified families', on: true, color: null },
                { l: 'Allow tagging by name', sub: 'Leaders can tag scout in captions', on: si === 0, color: null },
                { l: 'Auto-blur face on public', sub: 'Recommended for non-public', on: si === 1, color: p.accent },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < 3 ? `1px solid ${p.lineSoft}` : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: p.ink, fontWeight: 500 }}>{row.l}</div>
                    <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{row.sub}</div>
                  </div>
                  <Toggle on={row.on} color={row.color}/>
                </div>
              ))}
            </div>
          ))}

          <div style={{ background: p.ember + '12', border: `1px solid ${p.ember}55`, borderRadius: 12, padding: 14, fontSize: 12, color: p.inkSoft, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: p.ink, fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.ember} strokeWidth="2.2"><path d="M12 8v4M12 16h.01"/><circle cx="12" cy="12" r="10"/></svg>
              Per-photo override
            </div>
            Long-press any photo to request a blur or removal. Leaders are notified within an hour.
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

window.MobileHome = MobileHome;
window.MobileCalendar = MobileCalendar;
window.MobileEvent = MobileEvent;
window.MobilePayment = MobilePayment;
window.MobileMessages = MobileMessages;
window.MobileThread = MobileThread;
window.MobilePhotos = MobilePhotos;
window.MobilePhotoPerms = MobilePhotoPerms;
