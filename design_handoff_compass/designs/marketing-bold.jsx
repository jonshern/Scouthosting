// BOLD — Evergreen & Chartreuse. Dark hero, modern, asymmetric.
const MarketingBold = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const dark = p.surfaceDark || p.surfaceAlt;
  return (
    <div style={{ width: 1200, minHeight: 2400, background: p.bg, color: p.ink, fontFamily: T.ui, position: 'relative' }}>
      {/* Hero — dark, full-bleed */}
      <div style={{ background: dark, color: '#fff', padding: '24px 56px 88px', position: 'relative', overflow: 'hidden' }}>
        <TopoBg color={p.accent} opacity={0.1}/>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SHWordmark p={p} size={20} light/>
            <div style={{ display: 'flex', gap: 28, fontSize: 13, color: '#cdd0c8' }}>
              <span>Product</span><span>Why us</span><span>Pricing</span><span>Docs</span>
            </div>
            <button style={{ background: p.accent, color: p.ink, border: 'none', padding: '10px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>Start free →</button>
          </div>

          <div style={{ marginTop: 88, maxWidth: 880 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'rgba(200,233,74,0.12)', border: `1px solid ${p.accent}`, borderRadius: 999, fontSize: 12, color: p.accent, marginBottom: 28, fontWeight: 500 }}>
              <span style={{ width: 6, height: 6, background: p.accent, borderRadius: '50%' }}/>
              The TroopWebHost replacement, built for 2026
            </div>
            <h1 style={{ fontFamily: T.display, fontSize: 104, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.035em', margin: 0, color: '#fff' }}>
              Software<br/>that earns its<br/>
              <span style={{ color: p.accent, fontStyle: 'italic' }}>merit badge.</span>
            </h1>
            <p style={{ fontSize: 19, lineHeight: 1.5, color: '#cdd0c8', margin: '32px 0 36px', maxWidth: 600 }}>
              Modern calendar, troop website, photo library, and family communications. Plays nice with Scoutbook. Doesn't look like 2008.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button style={{ background: p.accent, color: p.ink, border: 'none', padding: '16px 26px', borderRadius: 8, fontSize: 16, fontWeight: 600, fontFamily: T.ui, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                Start free trial <Icon name="arrowRight" size={18}/>
              </button>
              <button style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '16px 26px', borderRadius: 8, fontSize: 16 }}>
                Book a demo
              </button>
            </div>
          </div>
        </div>

        {/* Floating product card */}
        <div style={{ position: 'relative', marginTop: 64, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: -120 }}>
          <div style={{ background: '#fff', color: p.ink, borderRadius: 12, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${p.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500 }}>This week</div>
              <Chip p={p} tone="primary">3 events</Chip>
            </div>
            {[
              { day: 'TUE', date: '4', name: 'PLC meeting', time: '6:30 PM', going: 8, total: 12, c: p.sky },
              { day: 'SAT', date: '9', name: 'Boundary Waters', time: '6:00 AM', going: 18, total: 22, c: p.ember },
              { day: 'MON', date: '11', name: 'Court of Honor', time: '7:00 PM', going: 34, total: 42, c: p.raspberry },
            ].map((e, i) => (
              <div key={i} style={{ padding: '14px 16px', borderBottom: i < 2 ? `1px solid ${p.lineSoft}` : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, textAlign: 'center', background: e.c, color: '#fff', borderRadius: 6, padding: '4px 0' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em' }}>{e.day}</div>
                  <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, lineHeight: 1 }}>{e.date}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: p.inkSoft }}>{e.time} · {e.going}/{e.total} going</div>
                </div>
                <div style={{ width: 60, height: 4, background: p.lineSoft, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(e.going/e.total)*100}%`, height: '100%', background: e.c }}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', color: p.ink, borderRadius: 12, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${p.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500 }}>Send to families</div>
              <Chip p={p} tone="default">Draft</Chip>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, marginBottom: 4 }}>To · 42 families</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${p.lineSoft}` }}>Reminder: High-Adventure gear check Friday 7pm</div>
              <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.6 }}>
                Hi all — quick reminder we'll do a final gear check this Friday at 7 in the church basement. Bring your packed pack. If you can't make it, find a buddy to bring yours…
              </div>
              <button style={{ marginTop: 14, width: '100%', background: p.primary, color: '#fff', border: 'none', padding: '10px 0', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>Send to 42 families →</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 130 }}/>

      {/* Big number / "why" */}
      <div style={{ padding: '64px 56px' }}>
        <div style={{ fontSize: 12, color: p.primary, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>The honest pitch</div>
        <h2 style={{ fontFamily: T.display, fontSize: 72, fontWeight: 400, lineHeight: 1.02, letterSpacing: '-0.025em', margin: '0 0 32px', maxWidth: 980 }}>
          You're a volunteer. Your software should respect that.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 56 }}>
          {[
            { stat: '90s', label: 'to publish a new event with permission slip', c: p.ember },
            { stat: '1 click', label: 'to email all 42 families', c: p.sky },
            { stat: '0', label: 'PDFs you have to make yourself', c: p.raspberry },
          ].map((s, i) => (
            <div key={i} style={{ borderTop: `3px solid ${s.c}`, paddingTop: 20 }}>
              <div style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, color: p.ink, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.stat}</div>
              <div style={{ fontSize: 14, color: p.inkSoft, marginTop: 12, lineHeight: 1.45 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature checklist + screenshot */}
      <div style={{ padding: '64px 56px', display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 40, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 40 }}>
          <h3 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, lineHeight: 1.1, margin: '0 0 24px' }}>
            What's in the box.
          </h3>
          <div style={{ display: 'grid', gap: 4 }}>
            {[
              ['Calendar', 'Drag-drop, RSVPs, payments, carpools', p.sky],
              ['Public website', 'Six templates, custom subdomain', p.ember],
              ['Email & SMS', 'Threaded replies, family inbox', p.raspberry],
              ['Photo library', 'Auto-organize, blur on request', p.plum],
              ['Roster', 'Members, parents, contacts, denial-list', p.teal],
              ['Forms', 'Permission slips, medical, signed online', p.butter],
              ['Scoutbook sync', 'Attendance + roster, both ways', p.primary],
              ['Reports', 'CSV export of anything', p.accent],
            ].map(([k, v, c], i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '12px 140px 1fr', gap: 14, padding: '12px 0', borderBottom: `1px solid ${p.line}`, fontSize: 14, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                <div style={{ fontWeight: 600, color: p.ink }}>{k}</div>
                <div style={{ color: p.inkSoft }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Big mock product screenshot */}
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.2)', border: `1px solid ${p.line}` }}>
          <div style={{ background: dark, color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SHMark size={20} color="#fff" accent={p.accent}/>
              <div style={{ fontFamily: T.ui, fontSize: 13, fontWeight: 500 }}>Troop 12 · admin</div>
            </div>
            <Chip p={p} tone="accent">Live</Chip>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr' }}>
            <div style={{ background: p.bg, padding: 14, fontSize: 12, borderRight: `1px solid ${p.line}` }}>
              {['Dashboard', 'Calendar', 'Roster', 'Messages', 'Photos', 'Forms', 'Reports'].map((it, i) => (
                <div key={i} style={{
                  padding: '7px 10px', borderRadius: 5, marginBottom: 2,
                  background: i === 1 ? p.surfaceAlt : 'transparent',
                  color: i === 1 ? '#fff' : p.ink,
                  fontWeight: i === 1 ? 500 : 400,
                }}>{it}</div>
              ))}
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, marginBottom: 14 }}>May 2026</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} style={{ textAlign: 'center', fontSize: 9, color: p.inkMuted, padding: 4 }}>{d}</div>)}
                {Array.from({length: 35}).map((_, i) => {
                  const day = i - 4;
                  const events = { 4: ['PLC', p.sky], 9: ['High-Adventure', p.ember], 11: ['CoH', p.accent], 15: ['Camp', p.plum], 22: ['☆', p.butter], 26: ['Mtg', p.teal], 28: ['Eagle', p.raspberry] };
                  const e = events[day];
                  return (
                    <div key={i} style={{ aspectRatio: '1', background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 4, padding: 4, fontSize: 10 }}>
                      <div style={{ color: day > 0 && day < 32 ? p.ink : 'transparent' }}>{day > 0 && day < 32 ? day : '·'}</div>
                      {e && <div style={{ background: e[1], color: (e[1] === p.accent || e[1] === p.butter) ? p.ink : '#fff', borderRadius: 2, padding: '1px 3px', fontSize: 8, marginTop: 2, fontWeight: 500 }}>{e[0]}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA — chartreuse band */}
      <div style={{ margin: '64px 56px 0', background: p.accent, color: p.ink, borderRadius: 16, padding: '64px 56px', display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: 40, alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: '0 0 16px' }}>
            $12. One number. Whole troop.
          </h2>
          <p style={{ fontSize: 16, opacity: 0.85, margin: 0 }}>
            Every feature. Unlimited members. Free for troops under 10 scouts. Cancel anytime, take your data with you.
          </p>
        </div>
        <button style={{ background: p.ink, color: p.accent, border: 'none', padding: '20px 32px', borderRadius: 10, fontSize: 18, fontWeight: 600, fontFamily: T.ui }}>Start free trial →</button>
      </div>

      <div style={{ padding: '40px 56px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: p.inkMuted, marginTop: 32 }}>
        <SHWordmark p={p} size={16}/>
        <div>© 2026 Compass · Independent · Not affiliated with Scouting America</div>
      </div>
    </div>
  );
};

window.MarketingBold = MarketingBold;
