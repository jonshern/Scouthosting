// Public troop frontpage (what families/visitors see)
// Three artboards. Same content (Troop 12 Anytown, USA), different treatments.
// Reference content: hero photo, About Our Troop, Upcoming Events sidebar,
// Recent photo gallery, News/Announcements.

const TROOP = {
  name: 'Troop 12',
  city: 'Anytown, USA',
  sponsor: "St. Mark's Community Church",
  founded: '1972',
  council: 'Pine Lake',
  about: "Scouts BSA Troop 12 has been part of its community since 1972. We're a Scout-led troop of 32 youth and 18 trained adult leaders. We camp once a month, run a High Adventure trip every summer (rotating Philmont, Sea Base, Boundary Waters, Jamboree), and serve our community through projects with Feed My Starving Children, Plymouth Fire & Ice, and the Lions Club.",
  events: [
    { name: 'Committee Meeting', date: 'Apr 28', time: '7:00 PM', place: 'Holy Nativity' },
    { name: 'PLC Meeting', date: 'May 4', time: '6:30 PM', place: 'Scout Room' },
    { name: 'Court of Honor Prep', date: 'May 4', time: '7:00 PM', place: 'Holy Nativity' },
    { name: 'Shooting Sports & Climbing Tower', date: 'May 9', time: '9:00 AM', place: 'Phillippo Scout Camp' },
    { name: 'May Court of Honor', date: 'May 11', time: '7:00 PM', place: 'Sanctuary' },
    { name: 'Spring Camporee', date: 'May 15–17', time: 'all weekend', place: 'Tomahawk' },
    { name: 'Committee Meeting', date: 'May 26', time: '7:00 PM', place: 'Holy Nativity' },
    { name: 'PLC Meeting', date: 'Jun 1', time: '6:30 PM', place: 'Scout Room' },
  ],
  gallery: ['climbing', 'firstaid', 'derby', 'eagle', 'crossover', 'skiing'],
  news: [
    { title: 'Eagle Court of Honor for Isaac White & Marcus Lee', date: 'Apr 24', body: 'Two new Eagles this spring. Ceremony May 11 at 7pm — all troop families welcome.' },
    { title: 'High-Adventure trek roster posted', date: 'Apr 22', body: '22 scouts and 8 adults heading to Ely May 9. Final gear check Friday May 8 at 7pm.' },
    { title: 'Welcome to our new Webelos crossovers', date: 'Apr 15', body: 'Eight new scouts crossed over from Pack 577. Patrol assignments inside.' },
  ],
};

// ─────────────────────────────────────────────────────────────
// SAFE — Pine & Brass. Classic two-column, refined heritage.
// ─────────────────────────────────────────────────────────────
const TroopSafe = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1200, minHeight: 1800, background: p.bg, color: p.ink, fontFamily: T.ui }}>
      {/* Top bar */}
      <div style={{ background: p.primary, color: '#fff', padding: '12px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <SHWordmark p={p} size={16} light/>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ opacity: 0.85 }}>Hosted with Compass</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span>Calendar</span><span>Photos</span><span>Forms</span><span>Leaders</span>
          <button style={{ background: p.accent, color: p.ink, border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Sign in</button>
        </div>
      </div>

      {/* Hero — full bleed photo with troop title */}
      <div style={{ position: 'relative', height: 380, overflow: 'hidden' }}>
        <Photo subject="canoe" w="100%" h="100%" p={p}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(28,42,31,0.4) 0%, rgba(28,42,31,0.7) 100%)' }}/>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 56px 48px', color: '#fff' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 12 }}>Scouts BSA · {TROOP.council} Council</div>
          <div style={{ fontFamily: T.display, fontSize: 84, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.02em' }}>
            {TROOP.name}
          </div>
          <div style={{ fontFamily: T.display, fontSize: 28, fontStyle: 'italic', opacity: 0.9, marginTop: 4 }}>{TROOP.city}</div>
        </div>
      </div>

      {/* Main two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.85fr', gap: 40, padding: '48px 56px' }}>
        <div>
          {/* About */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>About Our Troop</div>
            <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, lineHeight: 1.15, margin: '0 0 16px' }}>
              Scout-led, community-rooted, since 1972.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: p.inkSoft, margin: 0 }}>
              {TROOP.about}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 28, padding: 20, background: p.surface, border: `1px solid ${p.lineSoft}`, borderRadius: 8 }}>
              {[['32', 'Scouts'], ['18', 'Adult leaders'], ['54', 'years active'], ['5', 'Eagles in 2025']].map(([n, l], i) => (
                <div key={i}>
                  <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, color: p.primary, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent photos */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h3 style={{ fontFamily: T.display, fontSize: 26, fontWeight: 400, margin: 0 }}>Recent adventures</h3>
              <span style={{ fontSize: 12, color: p.accent, fontWeight: 500 }}>View all photos →</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {TROOP.gallery.map((g, i) => (
                <div key={i} style={{ aspectRatio: '4/3', borderRadius: 6, overflow: 'hidden' }}>
                  <Photo subject={g} w="100%" h="100%" p={p}/>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h3 style={{ fontFamily: T.display, fontSize: 26, fontWeight: 400, margin: 0 }}>News & announcements</h3>
              <span style={{ fontSize: 12, color: p.accent, fontWeight: 500 }}>RSS →</span>
            </div>
            <div style={{ display: 'grid', gap: 0 }}>
              {TROOP.news.map((n, i) => (
                <div key={i} style={{ padding: '20px 0', borderTop: `1px solid ${p.line}` }}>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginBottom: 4, letterSpacing: '0.04em' }}>{n.date}</div>
                  <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 500, marginBottom: 6 }}>{n.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: p.inkSoft }}>{n.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar — Upcoming Events */}
        <div>
          <div style={{ position: 'sticky', top: 24, background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Icon name="calendar" size={18} color={p.primary}/>
              <h3 style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, margin: 0 }}>Upcoming events</h3>
            </div>
            <div style={{ display: 'grid', gap: 0 }}>
              {TROOP.events.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
                  <div style={{ width: 48, flexShrink: 0, textAlign: 'center', background: p.surfaceAlt, borderRadius: 6, padding: '6px 0', height: 48 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: p.primary, letterSpacing: '0.06em' }}>{e.date.split(' ')[0].toUpperCase()}</div>
                    <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, lineHeight: 1, color: p.ink }}>{e.date.split(' ')[1]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: p.ink, marginBottom: 2 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: p.inkSoft }}>{e.time} · {e.place}</div>
                  </div>
                </div>
              ))}
            </div>
            <button style={{ width: '100%', marginTop: 20, background: p.primary, color: '#fff', border: 'none', padding: '10px 0', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>Full calendar →</button>
          </div>

          <div style={{ marginTop: 16, background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, color: p.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Sponsored by</div>
            <div style={{ fontFamily: T.display, fontSize: 18, color: p.ink, marginBottom: 12 }}>{TROOP.sponsor}</div>
            <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.5 }}>101 Main Street<br/>Anytown, USA</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 56px', background: p.surfaceAlt, borderTop: `1px solid ${p.line}`, fontSize: 11, color: p.inkMuted, display: 'flex', justifyContent: 'space-between' }}>
        <span>© 2026 Troop 12 Anytown · Hosted with Compass</span>
        <span>Webmaster · Privacy · Public roster</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BALANCED — Forest & Ember. Editorial, asymmetric.
// ─────────────────────────────────────────────────────────────
const TroopBalanced = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1200, minHeight: 1800, background: p.bg, color: p.ink, fontFamily: T.ui }}>
      {/* Slim header */}
      <div style={{ borderBottom: `1.5px solid ${p.ink}`, padding: '16px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SHMark size={28} color={p.ink} accent={p.accent}/>
          <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 500 }}>Troop 12</div>
          <span style={{ color: p.line }}>·</span>
          <div style={{ fontSize: 12, color: p.inkSoft, letterSpacing: '0.04em' }}>Est. 1972</div>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, color: p.inkSoft }}>
          <span>Calendar</span><span>Photos</span><span>News</span><span>Forms</span><span>Leaders</span>
          <span style={{ color: p.accent, fontWeight: 500 }}>Sign in →</span>
        </div>
      </div>

      {/* Hero — split with big serif + photo, BOLDER */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 560, borderBottom: `1px solid ${p.line}` }}>
        <div style={{ padding: '64px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: p.surfaceDark, color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, fontFamily: T.display, fontSize: 360, lineHeight: 1, color: p.accent, opacity: 0.1, fontStyle: 'italic', pointerEvents: 'none' }}>567</div>
          <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6, padding: '5px 12px', background: p.accent, color: '#fff', borderRadius: 999, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 24 }}>Spring 2026 Issue</div>
          <h1 style={{ fontFamily: T.display, fontSize: 132, fontWeight: 400, lineHeight: 0.88, letterSpacing: '-0.035em', margin: 0, color: '#fff', position: 'relative' }}>
            Troop<br/>
            <span style={{ fontStyle: 'italic', color: p.accent }}>567.</span>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, marginTop: 28, maxWidth: 460, position: 'relative' }}>
            St. Mark's Community Church · District K, Pine Lake Council. Camping monthly since 1972, with two Eagles this spring and a High-Adventure trek in May.
          </p>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <Photo subject="troop" w="100%" h="100%" p={p}/>
          <div style={{ position: 'absolute', bottom: 16, left: 16, padding: '6px 10px', background: p.ink, color: '#fff', fontSize: 10, fontFamily: T.ui, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Spring camporee · Tomahawk · April '26
          </div>
        </div>
      </div>

      {/* Three-column body — about / events / news+photos */}
      <div style={{ padding: '64px 56px', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', gap: 40 }}>
        {/* About */}
        <div>
          <div style={{ fontFamily: T.display, fontSize: 12, fontStyle: 'italic', color: p.accent, marginBottom: 8 }}>§ About</div>
          <h2 style={{ fontFamily: T.display, fontSize: 34, fontWeight: 400, lineHeight: 1.1, margin: '0 0 18px', letterSpacing: '-0.015em' }}>
            What we're about.
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: p.inkSoft, margin: 0, columnCount: 1 }}>
            <span style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, lineHeight: 0.85, float: 'left', marginRight: 8, marginTop: 6, color: p.ink }}>S</span>
            couts BSA Troop 12 has been part of Anytown since 1972. We're a Scout-led troop of 32 youth and 18 trained adult leaders. We camp once a month, run a High Adventure trip every summer, and serve our community through Feed My Starving Children, Plymouth Fire & Ice, and the Lions Club.
          </p>
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${p.line}`, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[['Sponsor', TROOP.sponsor], ['Council', TROOP.council], ['Scouts', '32'], ['Founded', '1972']].map(([k, v], i) => (
              <div key={i}>
                <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 14, color: p.ink, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div>
          <div style={{ fontFamily: T.display, fontSize: 12, fontStyle: 'italic', color: p.accent, marginBottom: 8 }}>§ Upcoming</div>
          <h2 style={{ fontFamily: T.display, fontSize: 34, fontWeight: 400, lineHeight: 1.1, margin: '0 0 18px', letterSpacing: '-0.015em' }}>
            On the calendar.
          </h2>
          <div style={{ display: 'grid' }}>
            {TROOP.events.slice(0, 6).map((e, i) => {
              const evColors = [p.sky, p.accent, p.raspberry, p.butter, p.plum, p.teal];
              const c = evColors[i % evColors.length];
              return (
                <div key={i} style={{ padding: '14px 0', borderTop: `1px solid ${p.line}`, display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, color: c, width: 50, flexShrink: 0, fontStyle: 'italic', lineHeight: 1 }}>{e.date.split(' ')[1]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 2 }}>{e.date} · {e.time}</div>
                  </div>
                  <div style={{ width: 4, alignSelf: 'stretch', background: c, borderRadius: 2 }}/>
                </div>
              );
            })}
          </div>
          <button style={{ marginTop: 16, background: 'transparent', color: p.ink, border: `1px solid ${p.ink}`, padding: '8px 16px', borderRadius: 999, fontSize: 12 }}>Full calendar →</button>
        </div>

        {/* News */}
        <div>
          <div style={{ fontFamily: T.display, fontSize: 12, fontStyle: 'italic', color: p.accent, marginBottom: 8 }}>§ Latest</div>
          <h2 style={{ fontFamily: T.display, fontSize: 34, fontWeight: 400, lineHeight: 1.1, margin: '0 0 18px', letterSpacing: '-0.015em' }}>
            From the troop.
          </h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {TROOP.news.map((n, i) => {
              const newsColors = [p.accent, p.sky, p.raspberry, p.plum];
              const c = newsColors[i % newsColors.length];
              return (
                <div key={i} style={{ padding: '16px 0', borderTop: `2px solid ${c}` }}>
                  <div style={{ fontSize: 10, color: c, letterSpacing: '0.08em', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>{n.date.toUpperCase()}</div>
                  <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, lineHeight: 1.3, marginBottom: 6 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.5 }}>{n.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Photo strip */}
      <div style={{ padding: '0 56px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h3 style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, margin: 0 }}>Recent adventures</h3>
          <span style={{ fontSize: 12, color: p.accent }}>→ All photos</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, height: 140 }}>
          {TROOP.gallery.map((g, i) => {
            const accents = [p.accent, p.sky, p.raspberry, p.butter, p.plum, p.teal];
            return (
              <div key={i} style={{ borderRadius: 4, overflow: 'hidden', borderTop: `4px solid ${accents[i % accents.length]}` }}><Photo subject={g} w="100%" h="100%" p={p}/></div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '24px 56px', borderTop: `1.5px solid ${p.ink}`, fontSize: 11, color: p.inkMuted, display: 'flex', justifyContent: 'space-between' }}>
        <span>Troop 12 · Est. 1972</span>
        <span style={{ fontFamily: T.display, fontStyle: 'italic' }}>Hosted with Compass</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BOLD — Evergreen & Chartreuse. Punchy, modern, confident.
// ─────────────────────────────────────────────────────────────
const TroopBold = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const dark = p.surfaceDark || p.surfaceAlt;
  return (
    <div style={{ width: 1200, minHeight: 1800, background: p.bg, color: p.ink, fontFamily: T.ui }}>
      {/* Dark header band */}
      <div style={{ background: dark, color: '#fff', padding: '14px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SHMark size={24} color={p.accent} accent="#fff"/>
          <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500 }}>Troop 12 · <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Anytown</span></div>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, alignItems: 'center', color: '#cdd0c8' }}>
          <span>Calendar</span><span>Photos</span><span>News</span><span>Forms</span><span>Leaders</span>
          <button style={{ background: p.accent, color: p.ink, border: 'none', padding: '6px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Sign in</button>
        </div>
      </div>

      {/* Hero — chartreuse ribbon meets dark background */}
      <div style={{ position: 'relative', background: dark, color: '#fff', padding: '64px 56px 88px', overflow: 'hidden' }}>
        <TopoBg color={p.accent} opacity={0.08}/>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: 40, alignItems: 'end' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: p.accent, color: p.ink, borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, background: p.ink, borderRadius: '50%' }}/>
              EST. 1972 · NORTHERN STAR COUNCIL
            </div>
            <h1 style={{ fontFamily: T.display, fontSize: 128, fontWeight: 400, lineHeight: 0.85, letterSpacing: '-0.04em', margin: 0, color: '#fff' }}>
              Troop<br/>
              <span style={{ color: p.accent }}>567.</span>
            </h1>
            <div style={{ marginTop: 20, fontSize: 18, color: '#cdd0c8', maxWidth: 480, lineHeight: 1.5 }}>
              A church basement in a small town. 32 scouts, 18 leaders, one church basement, fifty-four years of campouts.
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(200,233,74,0.3)`, borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 10, color: p.accent, letterSpacing: '0.14em', fontWeight: 700, marginBottom: 12 }}>NEXT EVENT</div>
            <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, lineHeight: 1.1, color: '#fff', marginBottom: 4 }}>Boundary Waters Trek</div>
            <div style={{ fontSize: 13, color: '#cdd0c8' }}>Sat May 9 · 6:00 AM departure</div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: '#cdd0c8' }}>22 scouts · 8 adults · gear check Friday 7pm</div>
          </div>
        </div>
      </div>

      {/* Photo grid — bold full-width with colored corner accents */}
      <div style={{ padding: '32px 32px 0', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, height: 200 }}>
        {TROOP.gallery.map((g, i) => {
          const accents = [p.ember, p.sky, p.raspberry, p.butter, p.plum, p.teal];
          return (
            <div key={i} style={{ overflow: 'hidden', borderRadius: 4, position: 'relative', borderTop: `4px solid ${accents[i % accents.length]}` }}>
              <Photo subject={g} w="100%" h="100%" p={p}/>
            </div>
          );
        })}
      </div>

      {/* Body grid */}
      <div style={{ padding: '56px 56px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 48 }}>
        <div>
          {/* About */}
          <div style={{ marginBottom: 56 }}>
            <div style={{ fontSize: 12, color: p.primary, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>About the troop</div>
            <h2 style={{ fontFamily: T.display, fontSize: 48, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.025em', margin: '0 0 20px' }}>
              Scout-led, dirt-tested, fifty-four years deep.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: p.inkSoft, margin: 0 }}>{TROOP.about}</p>
            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: `1px solid ${p.ink}` }}>
              {[['32', 'Scouts', p.sky], ['18', 'Leaders', p.ember], ['54y', 'Active', p.accent], ['5', 'Eagles \'25', p.raspberry]].map(([n, l, c], i) => (
                <div key={i} style={{ padding: 16, borderRight: i < 3 ? `1px solid ${p.ink}` : 'none', textAlign: 'center', background: c }}>
                  <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 500, color: (c === p.accent || c === p.butter) ? p.ink : '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>{n}</div>
                  <div style={{ fontSize: 11, color: (c === p.accent || c === p.butter) ? p.inkSoft : 'rgba(255,255,255,0.85)', marginTop: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div>
            <div style={{ fontSize: 12, color: p.primary, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>The latest</div>
            <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, lineHeight: 1.1, margin: '0 0 20px' }}>News from the troop.</h2>
            {TROOP.news.map((n, i) => {
              const newsColors = [p.ember, p.sky, p.raspberry, p.plum];
              const c = newsColors[i % newsColors.length];
              return (
                <div key={i} style={{ padding: '20px 0', borderTop: `2px solid ${c}`, display: 'grid', gridTemplateColumns: '80px 1fr', gap: 20 }}>
                  <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 500, color: c, fontStyle: 'italic' }}>{n.date}</div>
                  <div>
                    <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, lineHeight: 1.25, marginBottom: 6 }}>{n.title}</div>
                    <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55 }}>{n.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar — Upcoming */}
        <div>
          <div style={{ background: p.ink, color: '#fff', padding: 24, borderRadius: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500 }}>Upcoming</div>
              <Chip p={p} tone="accent">{TROOP.events.length} events</Chip>
            </div>
            {TROOP.events.map((e, i) => {
              const evColors = [p.sky, p.ember, p.accent, p.raspberry, p.butter, p.plum, p.teal];
              const c = evColors[i % evColors.length];
              return (
                <div key={i} style={{ padding: '12px 0', borderBottom: i < TROOP.events.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', display: 'flex', gap: 12 }}>
                  <div style={{ width: 56, flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: c, fontWeight: 700, letterSpacing: '0.1em' }}>{e.date.split(' ')[0].toUpperCase()}</div>
                    <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, lineHeight: 1, color: '#fff' }}>{e.date.split(' ')[1]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: '#cdd0c8' }}>{e.time}</div>
                  </div>
                  <div style={{ width: 4, alignSelf: 'stretch', background: c, borderRadius: 2 }}/>
                </div>
              );
            })}
            <button style={{ marginTop: 16, width: '100%', background: p.accent, color: p.ink, border: 'none', padding: '12px 0', borderRadius: 4, fontSize: 13, fontWeight: 700 }}>FULL CALENDAR →</button>
          </div>

          <div style={{ marginTop: 16, padding: 20, border: `1px solid ${p.line}` }}>
            <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Sponsored by</div>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500 }}>{TROOP.sponsor}</div>
            <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 4 }}>101 Main Street · Anytown, USA</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: dark, color: '#cdd0c8', padding: '24px 56px', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span>© 2026 Troop 12 · Anytown, USA</span>
        <span style={{ color: p.accent }}>Hosted with Compass</span>
      </div>
    </div>
  );
};

window.TroopSafe = TroopSafe;
window.TroopBalanced = TroopBalanced;
window.TroopBold = TroopBold;
