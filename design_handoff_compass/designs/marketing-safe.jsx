// Marketing landing pages — three artboards in distinct directions:
//   safe     — calm SaaS, photo-led, generous whitespace
//   balanced — editorial magazine, big serif, two-color
//   bold     — confident, dark hero, chartreuse accent, asymmetric
//
// All artboards: 1200×2400. Tells the same story (hero → trusted by →
// features → app preview → testimonial → CTA) in different visual languages.

// ─────────────────────────────────────────────────────────────
// SAFE — Pine & Brass. Modern SaaS, calm, photo-led.
// ─────────────────────────────────────────────────────────────
const MarketingSafe = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1200, minHeight: 2400, background: p.bg, color: p.ink, fontFamily: T.ui, position: 'relative' }}>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 56px', borderBottom: `1px solid ${p.lineSoft}` }}>
        <SHWordmark p={p} size={20}/>
        <div style={{ display: 'flex', gap: 28, fontSize: 14, color: p.inkSoft }}>
          <span>Features</span><span>For troops</span><span>Pricing</span><span>Help</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <span style={{ color: p.inkSoft }}>Sign in</span>
          <button style={{ background: p.primary, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: T.ui }}>Start free trial</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '80px 56px 64px', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: p.surface, border: `1px solid ${p.line}`, borderRadius: 999, fontSize: 12, color: p.inkSoft, marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, background: p.success, borderRadius: '50%' }}/>
            Trusted by 1,200+ troops · Syncs with Scoutbook
          </div>
          <h1 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 20px', color: p.ink }}>
            Your troop's<br/>
            <span style={{ fontStyle: 'italic', color: p.primary }}>home base</span> on the web.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: p.inkSoft, margin: '0 0 32px', maxWidth: 520 }}>
            A calendar, troop website, photo library, and parent communications — all in one place. Scoutbook handles advancement; Compass handles everything else.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            <button style={{ background: p.primary, color: '#fff', border: 'none', padding: '14px 22px', borderRadius: 10, fontSize: 15, fontWeight: 500, fontFamily: T.ui, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Start free for 30 days <Icon name="arrowRight" size={16}/>
            </button>
            <button style={{ background: 'transparent', color: p.ink, border: `1px solid ${p.line}`, padding: '14px 22px', borderRadius: 10, fontSize: 15, fontFamily: T.ui }}>
              See it in action
            </button>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: p.inkMuted }}>
            <span>· No credit card</span>
            <span>· Set up in an evening</span>
            <span>· Migrate from TroopWebHost</span>
          </div>
        </div>
        <div style={{ position: 'relative', height: 460, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(28,42,31,0.3)' }}>
          <Photo subject="forest" w="100%" h="100%" p={p}/>
          {/* Floating UI snippet on photo */}
          <div style={{ position: 'absolute', left: 24, bottom: 24, right: 24, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: 16, fontFamily: T.ui }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: p.inkMuted }}>Next event</div>
              <Chip p={p} tone="primary">12 going</Chip>
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: p.ink, marginBottom: 4 }}>Boundary Waters Trek</div>
            <div style={{ fontSize: 13, color: p.inkSoft }}>Sat May 9 · 6:00 AM · Ely, MN</div>
          </div>
        </div>
      </div>

      {/* Trusted by row */}
      <div style={{ padding: '24px 56px', borderTop: `1px solid ${p.lineSoft}`, borderBottom: `1px solid ${p.lineSoft}`, display: 'flex', alignItems: 'center', gap: 40, fontFamily: T.ui }}>
        <div style={{ fontSize: 12, color: p.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Used by</div>
        {['Troop 567 · New Hope, MN', 'Pack 134 · Bend, OR', 'Crew 9 · Boulder, CO', 'Troop 211 · Asheville, NC', 'Pack 88 · Denver, CO'].map((t, i) => (
          <div key={i} style={{ fontFamily: T.display, fontSize: 14, color: p.inkSoft, fontStyle: 'italic' }}>{t}</div>
        ))}
      </div>

      {/* Features */}
      <div style={{ padding: '96px 56px' }}>
        <div style={{ maxWidth: 720, marginBottom: 56 }}>
          <div style={{ fontSize: 12, color: p.accent, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Everything around Scoutbook</div>
          <h2 style={{ fontFamily: T.display, fontSize: 44, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.015em', margin: 0, color: p.ink }}>
            One spot for the calendar, the website, and the family group chat.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {[
            { icon: 'calendar', title: 'Calendar & sign-ups', body: 'Publish events, track RSVPs, collect permission slips and money — all in one form.', tag: 'Most loved' },
            { icon: 'users',    title: 'Roster & directory', body: 'A clean list of every scout and parent with phone, email, and den. Export to CSV anytime.', tag: null },
            { icon: 'mail',     title: 'Email blasts that actually arrive', body: 'Send a Sunday update or a weather-cancellation in seconds. Replies thread per family.', tag: null },
            { icon: 'image',    title: 'Photo gallery families love', body: 'Drop in 200 photos from Friday\'s campout. Auto-resized, faces blurred on request.', tag: null },
            { icon: 'home',     title: 'Public troop website', body: 'A homepage that recruits new families. Pick a template; we handle the design.', tag: null },
            { icon: 'badge',    title: 'Scoutbook bridge', body: 'We don\'t replace advancement — we sync attendance and rosters so Scoutbook stays current.', tag: 'Built-in' },
          ].map((f, i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.lineSoft}`, borderRadius: 16, padding: 28, position: 'relative' }}>
              {f.tag && <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, color: p.accent, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{f.tag}</div>}
              <div style={{ width: 44, height: 44, borderRadius: 10, background: p.surfaceAlt, color: p.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Icon name={f.icon} size={22}/>
              </div>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: p.inkSoft }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* App preview band */}
      <div style={{ padding: '64px 56px', background: p.surfaceAlt }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: p.accent, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Built for volunteers</div>
            <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, lineHeight: 1.15, margin: '0 0 20px' }}>
              Set up an event in 90 seconds. Send the email in 30.
            </h2>
            <p style={{ fontSize: 16, color: p.inkSoft, lineHeight: 1.55, marginBottom: 24 }}>
              Most committee chairs are doing this on a Tuesday at 9:30pm. Compass is built for that — short forms, smart defaults, and undo on everything.
            </p>
            <div style={{ display: 'grid', gap: 14 }}>
              {['Drag-and-drop calendar', 'Permission slips signed online', 'Carpool sign-up & driver list', 'CSV import from your old system'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: p.ink }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: p.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={12} stroke={2.5}/>
                  </div>
                  {t}
                </div>
              ))}
            </div>
          </div>
          {/* Mock app screenshot */}
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px -20px rgba(28,42,31,0.25)', overflow: 'hidden', border: `1px solid ${p.line}` }}>
            <div style={{ background: p.surfaceAlt, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${p.line}` }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#e07a6a' }}/>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#e8c25a' }}/>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#7aa86a' }}/>
              <div style={{ marginLeft: 12, fontSize: 11, color: p.inkMuted }}>compass.app/troop567/calendar</div>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500 }}>May 2026</div>
                <Chip p={p} tone="primary">+ New event</Chip>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 10 }}>
                {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} style={{ textAlign: 'center', color: p.inkMuted, padding: 4 }}>{d}</div>)}
                {Array.from({length: 35}).map((_, i) => {
                  const day = i - 4;
                  const events = { 9: 'BWCA', 11: 'CoH', 15: 'Camp', 26: 'Mtg' };
                  return (
                    <div key={i} style={{ aspectRatio: '1', background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 4, padding: 4, fontSize: 10 }}>
                      <div style={{ color: day > 0 && day < 32 ? p.ink : p.inkMuted }}>{day > 0 && day < 32 ? day : ''}</div>
                      {events[day] && <div style={{ background: p.primary, color: '#fff', borderRadius: 3, padding: '1px 3px', fontSize: 8, marginTop: 2 }}>{events[day]}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonial */}
      <div style={{ padding: '96px 56px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, lineHeight: 1.35, fontStyle: 'italic', color: p.ink, marginBottom: 28 }}>
          "Our committee was spending three nights a week on logistics. Compass gave us our Tuesdays back."
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Avatar initials="JM" size={40} bg={p.primary}/>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Jenna M.</div>
            <div style={{ fontSize: 12, color: p.inkSoft }}>Committee Chair · Troop 211, Asheville NC</div>
          </div>
        </div>
      </div>

      {/* Pricing CTA */}
      <div style={{ margin: '0 56px 64px', background: p.primary, color: '#fff', borderRadius: 24, padding: '64px 56px', position: 'relative', overflow: 'hidden' }}>
        <TopoBg color="#fff" opacity={0.08}/>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 40, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: T.display, fontSize: 40, fontWeight: 400, lineHeight: 1.15, margin: '0 0 16px' }}>
              <span style={{ fontStyle: 'italic' }}>$12 a month</span> for the whole troop.
            </h2>
            <p style={{ fontSize: 16, opacity: 0.85, margin: '0 0 24px', lineHeight: 1.55 }}>
              One flat price, unlimited scouts and parents. Free for troops under 10. Migrate from TroopWebHost in an afternoon — we'll help.
            </p>
            <button style={{ background: p.accent, color: p.ink, border: 'none', padding: '14px 22px', borderRadius: 10, fontSize: 15, fontWeight: 600, fontFamily: T.ui }}>Start your free trial →</button>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, backdropFilter: 'blur(4px)' }}>
            {['Unlimited members', 'Custom subdomain', 'Photo storage', 'Email blasts', 'Scoutbook sync', 'Phone support'].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 14, borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                <Icon name="check" size={14} stroke={2.5} color={p.accentSoft}/>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '40px 56px', borderTop: `1px solid ${p.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: p.inkMuted }}>
        <SHWordmark p={p} size={16}/>
        <div>© 2026 Compass · Not affiliated with Scouting America</div>
      </div>
    </div>
  );
};

window.MarketingSafe = MarketingSafe;
