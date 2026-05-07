// Admin dashboard — three artboards. Same data, three visual treatments.
// Width 1400 to feel like real desktop app chrome.

const ROSTER = [
  { name: 'Mason Park', patrol: 'Eagle', rank: 'Life', age: 16, par: 'Joel & Sara Park' },
  { name: 'Liam O\'Brien', patrol: 'Eagle', rank: 'Star', age: 15, par: 'Megan O\'Brien' },
  { name: 'Owen Schmidt', patrol: 'Hawk', rank: 'Life', age: 16, par: 'Eric Schmidt' },
  { name: 'Ethan Tran', patrol: 'Hawk', rank: '1st Cl', age: 14, par: 'Linh Tran' },
  { name: 'Noah Garcia', patrol: 'Wolf', rank: 'Star', age: 15, par: 'Carlos & Maria G.' },
  { name: 'Henry Chen', patrol: 'Wolf', rank: '2nd Cl', age: 13, par: 'Wen Chen' },
  { name: 'Isaac White', patrol: 'Eagle', rank: 'Eagle', age: 17, par: 'David White' },
  { name: 'Marcus Lee', patrol: 'Hawk', rank: 'Eagle', age: 17, par: 'Sue Lee' },
  { name: 'Theo Rivera', patrol: 'Wolf', rank: 'Tend.', age: 12, par: 'Ana Rivera' },
];

// ─────────────────────────────────────────────────────────────
// SAFE — Pine & Brass. Classic 3-column SaaS dashboard.
// ─────────────────────────────────────────────────────────────
const AdminSafe = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1400, minHeight: 900, background: p.bg, color: p.ink, fontFamily: T.ui, display: 'grid', gridTemplateColumns: '220px 1fr' }}>
      {/* Sidebar */}
      <div style={{ background: p.surface, borderRight: `1px solid ${p.line}`, padding: '20px 0' }}>
        <div style={{ padding: '0 20px 20px' }}><SHWordmark p={p} size={16}/></div>
        <div style={{ padding: '8px 12px', fontSize: 10, color: p.inkMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 8 }}>Troop 12</div>
        <div>
          {[['home', 'Dashboard', true], ['calendar', 'Calendar', false, '12'], ['users', 'Roster', false, '32'], ['mail', 'Messages', false, '3'], ['image', 'Photos', false], ['clipboard', 'Forms', false], ['cash', 'Finances', false], ['badge', 'Scoutbook', false]].map(([icon, label, active, badge], i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', margin: '0 8px',
              borderRadius: 6, fontSize: 13, cursor: 'pointer',
              background: active ? p.surfaceAlt : 'transparent',
              color: active ? p.primary : p.inkSoft,
              fontWeight: active ? 600 : 400,
            }}>
              <Icon name={icon} size={16}/>
              <span style={{ flex: 1 }}>{label}</span>
              {badge && <span style={{ fontSize: 10, color: p.inkMuted }}>{badge}</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: '20px 16px', position: 'absolute', bottom: 20, fontSize: 12, color: p.inkSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar initials="JM" size={28} bg={p.primary}/>
          <div>
            <div style={{ color: p.ink, fontWeight: 500, fontSize: 13 }}>Jenna M.</div>
            <div style={{ fontSize: 11 }}>Committee Chair</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ padding: '24px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: p.inkMuted, marginBottom: 4 }}>Tuesday, April 28</div>
            <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: '-0.015em' }}>Good evening, Jenna.</h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ background: p.surface, border: `1px solid ${p.line}`, padding: '8px 14px', borderRadius: 6, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="search" size={14}/>Search</button>
            <button style={{ background: p.primary, color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={14}/>New event</button>
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { l: 'Active scouts', n: '32', d: '+3 this month', up: true },
            { l: 'RSVPs pending', n: '14', d: 'High-Adventure closes Fri', up: false },
            { l: 'Account balance', n: '$4,218', d: '$1,240 in dues due', up: true },
            { l: 'Unread family msgs', n: '7', d: 'oldest 2d ago', up: false },
          ].map((s, i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.04em', marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, color: p.ink, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 11, color: s.up ? p.success : p.inkSoft, marginTop: 8 }}>{s.d}</div>
            </div>
          ))}
        </div>

        {/* Two-col body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
          {/* Upcoming events */}
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500 }}>This week</div>
              <span style={{ fontSize: 12, color: p.accent, fontWeight: 500 }}>View calendar →</span>
            </div>
            {[
              { d: 'TUE', n: '4', name: 'PLC meeting', sub: '6:30 PM · Scout Room', going: 8, total: 12, color: p.primary },
              { d: 'SAT', n: '9', name: 'Boundary Waters Trek', sub: '6:00 AM · Ely, MN', going: 18, total: 22, color: p.accent },
              { d: 'MON', n: '11', name: 'May Court of Honor', sub: '7:00 PM · Sanctuary', going: 34, total: 42, color: p.primary },
              { d: 'WED', n: '15', name: 'Spring Camporee depart', sub: 'Tomahawk weekend', going: 12, total: 18, color: p.accent },
            ].map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{ width: 44, flexShrink: 0, textAlign: 'center', background: p.surfaceAlt, borderRadius: 6, padding: '4px 0' }}>
                  <div style={{ fontSize: 9, color: e.color, fontWeight: 700 }}>{e.d}</div>
                  <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, lineHeight: 1 }}>{e.n}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: p.inkSoft }}>{e.sub}</div>
                </div>
                <div style={{ minWidth: 110, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: p.inkSoft, marginBottom: 4 }}>{e.going}/{e.total} going</div>
                  <div style={{ height: 4, background: p.lineSoft, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${(e.going/e.total)*100}%`, height: '100%', background: e.color }}/>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8, padding: 18 }}>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, marginBottom: 12 }}>Recent activity</div>
            {[
              ['Sara Park', 'paid $85 High-Adventure fee', '5m ago'],
              ['Megan O\'Brien', 'RSVP\'d yes for Liam · High-Adventure', '14m ago'],
              ['Eric Schmidt', 'replied to "gear check"', '32m ago'],
              ['Wen Chen', 'submitted health form for Henry', '1h ago'],
              ['Linh Tran', 'asked: "is the meeting outside?"', '2h ago'],
              ['You', 'sent "High-Adventure gear check" to 22', '4h ago'],
            ].map(([who, what, when], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none', fontSize: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.primary, marginTop: 6, flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{who}</span> <span style={{ color: p.inkSoft }}>{what}</span>
                </div>
                <div style={{ color: p.inkMuted, fontSize: 11 }}>{when}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Roster strip */}
        <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8, padding: 18, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500 }}>Roster <span style={{ fontSize: 13, color: p.inkSoft, fontWeight: 400 }}>· 32 scouts</span></div>
            <span style={{ fontSize: 12, color: p.accent }}>Manage roster →</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: p.inkMuted, fontSize: 11, letterSpacing: '0.04em', textAlign: 'left' }}>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Scout</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Patrol</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Rank</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Age</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Parent / Guardian</th>
                <th style={{ padding: '6px 0', fontWeight: 500, textAlign: 'right' }}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {ROSTER.slice(0, 7).map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${p.lineSoft}` }}>
                  <td style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar initials={r.name.split(' ').map(s => s[0]).join('')} size={24} bg={p.primary}/>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                  </td>
                  <td style={{ padding: '8px 0' }}><Chip p={p}>{r.patrol}</Chip></td>
                  <td style={{ padding: '8px 0', color: p.inkSoft }}>{r.rank}</td>
                  <td style={{ padding: '8px 0', color: p.inkSoft }}>{r.age}</td>
                  <td style={{ padding: '8px 0', color: p.inkSoft }}>{r.par}</td>
                  <td style={{ padding: '8px 0', color: p.inkMuted, textAlign: 'right' }}>{['2h ago', '1d', '4h', '3d', '12m', '6h', 'today'][i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BALANCED — Forest & Ember. Editorial dashboard, more whitespace.
// ─────────────────────────────────────────────────────────────
const AdminBalanced = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1400, minHeight: 900, background: p.bg, color: p.ink, fontFamily: T.ui }}>
      {/* Top nav (no sidebar) */}
      <div style={{ borderBottom: `1.5px solid ${p.ink}`, padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <SHWordmark p={p} size={16}/>
          <div style={{ display: 'flex', gap: 22, fontSize: 13 }}>
            {['Overview', 'Calendar', 'Roster', 'Messages', 'Photos', 'Forms', 'Money'].map((it, i) => (
              <span key={i} style={{ color: i === 0 ? p.ink : p.inkSoft, fontWeight: i === 0 ? 600 : 400, borderBottom: i === 0 ? `2px solid ${p.accent}` : 'none', paddingBottom: 4 }}>{it}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="bell" size={16} color={p.inkSoft}/>
          <Icon name="search" size={16} color={p.inkSoft}/>
          <Avatar initials="JM" size={28} bg={p.accent}/>
        </div>
      </div>

      <div style={{ padding: '32px 40px' }}>
        {/* Title — dark forest band */}
        <div style={{ background: p.surfaceDark, color: '#fff', borderRadius: 12, padding: '32px 36px', marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', overflow: 'hidden' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: p.accent, color: '#fff', borderRadius: 999, fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>Troop 12 · This week</div>
            <h1 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.03em', margin: 0, color: '#fff' }}>Tuesday<span style={{ color: p.accent, fontStyle: 'italic' }}>, evening.</span></h1>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 12 }}>High-Adventure closes RSVPs Friday · 14 families haven't replied · Court of Honor in 2 weeks</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500 }}>Send reminder</button>
            <button style={{ background: p.accent, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>+ New event</button>
          </div>
        </div>

        {/* Stats — bigger, fewer */}
        {/* Stats — bigger, color-coded */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 40 }}>
          {[
            { l: 'Scouts active', n: '32', sub: '+3 this month', c: p.sky },
            { l: 'RSVPs needed', n: '14', sub: 'High-Adventure closes Fri', c: p.accent },
            { l: 'Account', n: '$4,218', sub: '$1,240 dues outstanding', c: p.butter },
            { l: 'Unread', n: '7', sub: 'oldest 2d ago', c: p.raspberry },
          ].map((s, i) => (
            <div key={i} style={{ padding: '20px 24px', background: p.surface, border: `1px solid ${p.line}`, borderTop: `4px solid ${s.c}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: s.c, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>{s.l}</div>
              <div style={{ fontFamily: T.display, fontSize: 48, fontWeight: 400, color: p.ink, lineHeight: 1, letterSpacing: '-0.025em' }}>{s.n}</div>
              <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 10 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Body grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 40 }}>
          <div>
            <div style={{ fontFamily: T.display, fontSize: 12, fontStyle: 'italic', color: p.accent, marginBottom: 6 }}>§ Calendar</div>
            <h2 style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, margin: '0 0 20px', letterSpacing: '-0.015em' }}>What's coming up.</h2>
            {[
              { d: 'May 04', name: 'PLC meeting', sub: 'Mon · 6:30 PM · Scout Room', going: 8, total: 12, c: p.sky },
              { d: 'May 09', name: 'Boundary Waters Trek', sub: 'Sat · 6:00 AM · Ely, MN', going: 18, total: 22, c: p.accent },
              { d: 'May 11', name: 'May Court of Honor', sub: 'Mon · 7:00 PM · Sanctuary', going: 34, total: 42, c: p.raspberry },
              { d: 'May 15', name: 'Spring Camporee', sub: 'Wed · weekend · Tomahawk', going: 12, total: 18, c: p.plum },
            ].map((e, i) => (
              <div key={i} style={{ padding: '20px 0', borderTop: `2px solid ${e.c}`, display: 'grid', gridTemplateColumns: '90px 1fr 200px', gap: 20, alignItems: 'center' }}>
                <div style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, fontStyle: 'italic', color: e.c }}>{e.d}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 2 }}>{e.sub}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: p.inkSoft, marginBottom: 6 }}>{e.going} of {e.total} replied</div>
                  <div style={{ height: 6, background: p.lineSoft, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(e.going/e.total)*100}%`, height: '100%', background: e.c }}/>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontFamily: T.display, fontSize: 12, fontStyle: 'italic', color: p.accent, marginBottom: 6 }}>§ Activity</div>
            <h2 style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, margin: '0 0 20px', letterSpacing: '-0.015em' }}>The last few hours.</h2>
            {[
              { who: 'Sara Park', what: 'paid $85 toward High-Adventure', when: '5 minutes ago', icon: 'cash', c: p.teal },
              { who: 'Megan O\'Brien', what: 'said yes to High-Adventure for Liam', when: '14 minutes', icon: 'check', c: p.accent },
              { who: 'Eric Schmidt', what: 'replied to "gear check Friday"', when: '32 min', icon: 'mail', c: p.raspberry },
              { who: 'Wen Chen', what: 'submitted health form', when: '1 hour', icon: 'clipboard', c: p.butter },
              { who: 'Linh Tran', what: 'asked a question', when: '2 hours', icon: 'mail', c: p.sky },
              { who: 'You', what: 'sent High-Adventure gear-check email', when: '4 hours', icon: 'mail', c: p.plum },
            ].map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : `1px solid ${p.line}` }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: a.c, color: (a.c === p.butter) ? p.ink : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={a.icon} size={14}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{a.who}</span> <span style={{ color: p.inkSoft }}>{a.what}</span></div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BOLD — Evergreen & Chartreuse. Dark sidebar, dense, modern.
// ─────────────────────────────────────────────────────────────
const AdminBold = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const dark = p.surfaceDark || p.surfaceAlt;
  return (
    <div style={{ width: 1400, minHeight: 900, background: p.bg, color: p.ink, fontFamily: T.ui, display: 'grid', gridTemplateColumns: '64px 1fr' }}>
      {/* Skinny dark sidebar */}
      <div style={{ background: dark, padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ marginBottom: 16 }}><SHMark size={28} color="#fff" accent={p.accent}/></div>
        {[['home', true, null, p.accent], ['calendar', false, null, p.sky], ['users', false, null, p.ember], ['mail', false, '3', p.raspberry], ['image', false, null, p.plum], ['clipboard', false, null, p.butter], ['cash', false, null, p.teal], ['settings', false, null, p.accent]].map(([icon, active, badge, c], i) => (
          <div key={i} style={{ position: 'relative', width: 40, height: 40, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? p.accent : 'transparent', color: active ? p.ink : c }}>
            <Icon name={icon} size={18}/>
            {badge && <span style={{ position: 'absolute', top: 2, right: 2, background: c, color: '#fff', fontSize: 9, fontWeight: 700, padding: '0 4px', borderRadius: 6 }}>{badge}</span>}
          </div>
        ))}
        <div style={{ flex: 1 }}/>
        <Avatar initials="JM" size={32} bg={p.accent} fg={p.ink}/>
      </div>

      <div>
        {/* Top bar */}
        <div style={{ padding: '12px 24px', borderBottom: `1px solid ${p.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: p.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 13, color: p.inkMuted }}>Troop 12 / </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Dashboard</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '6px 12px', borderRadius: 4, fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="search" size={12}/>⌘K</button>
            <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, fontSize: 12, fontWeight: 500 }}>+ New</button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Title row + stats */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Tuesday at 9:30pm.</h1>
            <div style={{ fontSize: 13, color: p.inkSoft }}>High-Adventure closes RSVPs Friday · 14 families haven't replied · Court of Honor in 2 weeks</div>
          </div>

          {/* Big chartreuse callout + stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: p.accent, color: p.ink, padding: 18, borderRadius: 6, gridRow: 'span 2' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>NEEDS YOUR ATTENTION</div>
              <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 500, lineHeight: 1.05, marginBottom: 12 }}>14 families haven't RSVP'd to High-Adventure.</div>
              <div style={{ fontSize: 13, marginBottom: 14, opacity: 0.85 }}>Closes Friday at midnight. We can send a reminder to just the 14.</div>
              <button style={{ background: p.ink, color: p.accent, border: 'none', padding: '10px 16px', borderRadius: 4, fontSize: 13, fontWeight: 700 }}>Send reminder →</button>
            </div>
            {[
              { l: 'Scouts', n: '32', d: '+3 this month', c: p.sky },
              { l: 'Balance', n: '$4,218', d: '$1,240 owed', c: p.ember },
              { l: 'Unread', n: '7', d: 'oldest 2d', c: p.raspberry },
              { l: 'Photos', n: '142', d: '34 this week', c: p.plum },
            ].map((s, i) => (
              <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderTop: `3px solid ${s.c}`, borderRadius: 6, padding: 14 }}>
                <div style={{ fontSize: 11, color: s.c, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>{s.l}</div>
                <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, lineHeight: 1, color: p.ink }}>{s.n}</div>
                <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 6 }}>{s.d}</div>
              </div>
            ))}
          </div>

          {/* Body grid: events + activity + roster */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${p.line}`, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Upcoming events</div>
                <div style={{ fontSize: 11, color: p.inkMuted }}>next 14 days</div>
              </div>
              {[
                { d: '04', m: 'MAY', name: 'PLC meeting', g: 8, t: 12, c: p.sky },
                { d: '09', m: 'MAY', name: 'Boundary Waters Trek', g: 18, t: 22, c: p.ember },
                { d: '11', m: 'MAY', name: 'May Court of Honor', g: 34, t: 42, c: p.raspberry },
                { d: '15', m: 'MAY', name: 'Spring Camporee', g: 12, t: 18, c: p.plum },
              ].map((e, i) => (
                <div key={i} style={{ padding: '10px 16px', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, textAlign: 'center', background: e.c, color: '#fff', borderRadius: 4, padding: '2px 0' }}>
                    <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 600, lineHeight: 1 }}>{e.d}</div>
                    <div style={{ fontSize: 8, fontWeight: 700, opacity: 0.9 }}>{e.m}</div>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: p.inkSoft, fontVariantNumeric: 'tabular-nums' }}>{e.g}/{e.t}</div>
                  <div style={{ width: 60, height: 4, background: p.lineSoft, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${(e.g/e.t)*100}%`, height: '100%', background: e.c }}/>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${p.line}`, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Activity</div>
                <div style={{ fontSize: 11, color: p.inkMuted }}>last 4h</div>
              </div>
              {[
                ['Sara Park', 'paid $85', '5m', 'cash', p.teal],
                ['Megan O', 'RSVP yes · High-Adventure', '14m', 'check', p.ember],
                ['Eric Schmidt', 'replied "gear"', '32m', 'mail', p.raspberry],
                ['Wen Chen', 'submitted form', '1h', 'clipboard', p.butter],
                ['Linh Tran', 'asked a question', '2h', 'mail', p.sky],
                ['Carlos G.', 'uploaded 12 photos', '3h', 'image', p.plum],
              ].map(([who, what, when, ic, c], i) => (
                <div key={i} style={{ padding: '8px 16px', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <div style={{ width: 22, height: 22, background: c, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: (c === p.butter) ? p.ink : '#fff', flexShrink: 0 }}>
                    <Icon name={ic} size={11}/>
                  </div>
                  <div style={{ fontWeight: 500, minWidth: 90 }}>{who}</div>
                  <div style={{ flex: 1, color: p.inkSoft }}>{what}</div>
                  <div style={{ color: p.inkMuted, fontFamily: T.mono, fontSize: 10 }}>{when}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.AdminSafe = AdminSafe;
window.AdminBalanced = AdminBalanced;
window.AdminBold = AdminBold;
