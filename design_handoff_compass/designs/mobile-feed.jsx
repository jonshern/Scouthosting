// Compass mobile parent feed — 3 screens
// Replaces the old "Home" tab. Mix of post types: photo, event, achievement,
// news, poll, milestone. Leader-authored by default; reactions yes,
// moderated comments yes, no DMs initiated by youth.

const F = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─────────────────────────────────────────────────────────────
// Post-type chip
// ─────────────────────────────────────────────────────────────
const TypeChip = ({ kind, p }) => {
  const map = {
    photo:       { l: 'Photos',      c: p.teal },
    event:       { l: 'Event',       c: p.accent },
    achievement: { l: 'Achievement', c: p.ember },
    news:        { l: 'News',        c: p.plum },
    poll:        { l: 'Poll',        c: p.raspberry },
    milestone:   { l: 'Milestone',   c: p.butter },
    reminder:    { l: 'Reminder',    c: p.ember },
  };
  const m = map[kind] || map.news;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 4,
      background: m.c + '22', color: m.c,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>
      <div style={{ width: 5, height: 5, borderRadius: 3, background: m.c }}/>
      {m.l}
    </div>
  );
};

// Author row
const Author = ({ name, role, avatar, when, p, T, pinned }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
    <div style={{ width: 36, height: 36, borderRadius: 18, background: avatar, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
      {name.split(' ').slice(0, 2).map(w => w[0]).join('')}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>{name}</div>
        {pinned && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill={p.ember}><path d="M12 2l2 7h7l-5.5 4 2 7-5.5-4-5.5 4 2-7L3 9h7z"/></svg>
        )}
      </div>
      <div style={{ fontSize: 11, color: p.inkMuted }}>{role} · {when}</div>
    </div>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
  </div>
);

// Reactions / actions row
const ReactBar = ({ reactions, comments, p, T, mine }) => {
  const total = reactions.reduce((a, r) => a + (r.n || 1), 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${p.lineSoft}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex' }}>
          {reactions.map((r, i) => (
            <div key={i} style={{
              width: 22, height: 22, borderRadius: 11,
              background: r.bg, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, marginLeft: i ? -6 : 0,
              border: `2px solid ${p.surface}`,
              zIndex: 10 - i,
            }}>{r.icon}</div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: p.inkSoft, fontWeight: 500, marginLeft: 4 }}>{total}</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: mine ? p.accent : p.inkSoft, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill={mine ? p.accent : 'none'} stroke={mine ? p.accent : p.inkSoft} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {mine ? 'Liked' : 'Like'}
        </div>
        <div style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: p.inkSoft, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></svg>
          {comments}
        </div>
      </div>
    </div>
  );
};

// Generic card wrapper
const Card = ({ children, p }) => (
  <div style={{
    background: p.surface,
    border: `1px solid ${p.line}`,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  }}>{children}</div>
);

// ─────────────────────────────────────────────────────────────
// Photo collage (mock) — used in photo posts
// ─────────────────────────────────────────────────────────────
const PhotoCollage = ({ tiles, more = 0, p }) => {
  const layout = tiles.length === 1
    ? [{ col: '1 / span 2', row: '1 / span 2' }]
    : tiles.length === 2
    ? [{ col: '1 / span 1' }, { col: '2 / span 1' }]
    : tiles.length === 3
    ? [{ col: '1 / span 2', row: '1 / span 2' }, {}, {}]
    : [{}, {}, {}, {}];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3,
      borderRadius: 10, overflow: 'hidden', marginTop: 4,
      aspectRatio: tiles.length === 1 ? '4/3' : '1/1',
    }}>
      {tiles.slice(0, 4).map((c, i) => (
        <div key={i} style={{
          background: `linear-gradient(135deg, ${c}, ${c}99)`,
          gridColumn: layout[i]?.col,
          gridRow: layout[i]?.row,
          position: 'relative', overflow: 'hidden',
          minHeight: 80,
        }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.32 }}>
            <polygon points={`0,${55 + i*4} 30,${35 + i*5} 60,${50 - i*2} 100,${42 + i*4} 100,100 0,100`} fill="#0f172a"/>
            <circle cx={70 + i*5} cy={25 + i*2} r="8" fill="#fde68a" opacity="0.7"/>
          </svg>
          {i === 3 && more > 0 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 600 }}>+{more}</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 1 — FEED (replaces Home)
// ─────────────────────────────────────────────────────────────
const MobileFeed = () => {
  const p = F.p(); const T = F.T();

  return (
    <IOSDevice width={402} height={874} title="Compass · Feed">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        {/* Header */}
        <div style={{ padding: '8px 20px 12px', position: 'sticky', top: 0, background: p.bg, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Troop 12 · Anytown</div>
              <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '2px 0 0', lineHeight: 1 }}>Feed</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: p.surface, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.ink} strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>SK</div>
            </div>
          </div>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginLeft: -4, paddingLeft: 4 }}>
            {[
              { l: 'All', active: true },
              { l: 'My scouts', active: false },
              { l: 'Photos', active: false },
              { l: 'Events', active: false },
              { l: 'News', active: false },
            ].map((f, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: f.active ? p.ink : p.surface,
                color: f.active ? '#fff' : p.inkSoft,
                border: f.active ? 'none' : `1px solid ${p.line}`,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>{f.l}</div>
            ))}
          </div>
        </div>

        {/* Pinned badge */}
        <div style={{ padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill={p.ember}><path d="M12 2l2 7h7l-5.5 4 2 7-5.5-4-5.5 4 2-7L3 9h7z"/></svg>
          <div style={{ fontSize: 10, color: p.ember, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pinned by leaders</div>
        </div>

        <div style={{ padding: '4px 16px 0' }}>

          {/* POST 1 — REMINDER (pinned) */}
          <Card p={p}>
            <Author name="Mr. Avery" role="Scoutmaster" avatar={p.plum} when="Pinned · 2h" p={p} T={T} pinned/>
            <TypeChip kind="reminder" p={p}/>
            <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: p.ink, lineHeight: 1.25, margin: '8px 0 6px', letterSpacing: '-0.01em' }}>
              Spring Campout — slips & $35 due Thursday 9 PM.
            </div>
            <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.5, margin: 0 }}>
              18 of 24 scouts in. We need 2 more drivers from the south side. Tap below to RSVP and pay in 30 seconds.
            </p>
            <button style={{ marginTop: 12, width: '100%', background: p.ink, color: '#fff', border: 'none', padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>RSVP & pay $35</button>
            <ReactBar reactions={[
              { icon: '👍', bg: p.accent }, { icon: '✓', bg: p.success },
            ]} comments="4 comments" p={p} T={T}/>
          </Card>

          {/* POST 2 — PHOTO */}
          <Card p={p}>
            <Author name="Mr. Avery" role="Scoutmaster" avatar={p.plum} when="4h" p={p} T={T}/>
            <TypeChip kind="photo"  p={p}/>
            <p style={{ fontSize: 14, color: p.ink, lineHeight: 1.45, margin: '8px 0 0' }}>
              Klondike Derby was a whole thing. Hawk patrol took first in fire-building, Eagle patrol owned the sled race. Full set of 47 photos in the album.
            </p>
            <PhotoCollage tiles={[p.accent, p.ember, p.teal, p.plum]} more={43} p={p}/>
            <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 6 }}>📍 Anytown Scout Reservation · Mar 1</div>
            <ReactBar reactions={[
              { icon: '❤', bg: p.raspberry }, { icon: '👍', bg: p.accent }, { icon: '🎉', bg: p.ember },
            ]} comments="11 comments" p={p} T={T} mine/>
          </Card>

          {/* POST 3 — ACHIEVEMENT */}
          <Card p={p}>
            <Author name="Ms. Carter" role="Advancement Chair" avatar={p.teal} when="Yesterday" p={p} T={T}/>
            <TypeChip kind="achievement" p={p}/>
            <div style={{
              marginTop: 10, padding: 16,
              background: `linear-gradient(135deg, ${p.ember}18, ${p.butter}22)`,
              border: `1px solid ${p.ember}40`,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: p.ember, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5-6.5 4.5 2-7L2 9h7z"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 500, color: p.ink, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                  Eli K. earned <em>First Class</em>.
                </div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 4 }}>Synced from Scoutbook · 14 months from Tenderfoot</div>
              </div>
            </div>
            <ReactBar reactions={[
              { icon: '🎉', bg: p.ember }, { icon: '❤', bg: p.raspberry }, { icon: '👏', bg: p.accent },
            ]} comments="22 comments" p={p} T={T}/>
          </Card>

          {/* POST 4 — POLL */}
          <Card p={p}>
            <Author name="Jamie L." role="SPL · Senior Patrol Leader" avatar={p.accent} when="Yesterday" p={p} T={T}/>
            <TypeChip kind="poll" p={p}/>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink, lineHeight: 1.25, margin: '8px 0 12px', letterSpacing: '-0.01em' }}>
              Where should the May high-adventure trip go?
            </div>
            {[
              { l: 'Boundary Waters — canoeing, 4 days', n: 14, pct: 56, color: p.accent, mine: true },
              { l: 'Philmont — backpacking, 7 days', n: 7, pct: 28, color: p.ember, mine: false },
              { l: 'Sea Base — sailing, 5 days', n: 4, pct: 16, color: p.teal, mine: false },
            ].map((opt, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{
                  position: 'relative',
                  background: opt.mine ? opt.color + '18' : p.bg,
                  border: opt.mine ? `1.5px solid ${opt.color}` : `1px solid ${p.line}`,
                  borderRadius: 10, padding: '10px 12px', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', inset: 0, background: opt.color + '14', width: opt.pct + '%' }}/>
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: opt.mine ? 600 : 500, color: p.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {opt.mine && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={opt.color} strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>}
                      {opt.l}
                    </div>
                    <div style={{ fontSize: 12, color: p.inkSoft, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{opt.pct}%</div>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 6 }}>25 votes · closes Friday · scouts and parents both vote</div>
            <ReactBar reactions={[{ icon: '🗳', bg: p.raspberry }]} comments="6 comments" p={p} T={T} mine/>
          </Card>

          {/* POST 5 — EVENT */}
          <Card p={p}>
            <Author name="Mr. Brooks" role="Asst. Scoutmaster" avatar={p.ember} when="2 days ago" p={p} T={T}/>
            <TypeChip kind="event" p={p}/>
            <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: p.ink, margin: '8px 0 8px', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Eagle Court of Honor — May 4
            </div>
            <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.5, margin: '0 0 10px' }}>
              Three new Eagles being recognized: Jamie L., Anna T., Marcus W. Reception with cake to follow. Family encouraged. Class A uniform.
            </p>
            <div style={{ display: 'flex', gap: 10, padding: 12, background: p.bg, border: `1px solid ${p.line}`, borderRadius: 10, alignItems: 'center' }}>
              <div style={{
                width: 48, textAlign: 'center', borderRadius: 8,
                background: p.accent + '18', color: p.accent, padding: '5px 0',
                border: `1px solid ${p.accent}33`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>MAY</div>
                <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 500, lineHeight: 1 }}>04</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: p.ink, fontWeight: 600 }}>Sunday · 2:00 PM</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1 }}>St. Mark's Hall · 412 Oak St.</div>
              </div>
              <div style={{
                padding: '6px 12px', borderRadius: 8,
                background: p.success, color: '#fff',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>Going</div>
            </div>
            <ReactBar reactions={[
              { icon: '🎉', bg: p.ember }, { icon: '🦅', bg: p.accent },
            ]} comments="3 comments" p={p} T={T}/>
          </Card>

          {/* POST 6 — MILESTONE */}
          <Card p={p}>
            <Author name="Ms. Carter" role="Treasurer" avatar={p.teal} when="2 days ago" p={p} T={T}/>
            <TypeChip kind="milestone" p={p}/>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink, margin: '8px 0 12px', lineHeight: 1.25 }}>
              Popcorn fundraiser hit $4,200.
            </div>
            <div style={{ background: p.bg, border: `1px solid ${p.line}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Goal: $6,000</div>
                <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, fontVariantNumeric: 'tabular-nums' }}>70%</div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: p.lineSoft, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '70%', background: `linear-gradient(90deg, ${p.teal}, ${p.accent})`, borderRadius: 4 }}/>
              </div>
              <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 8 }}>$1,800 to go · 23 days remaining</div>
            </div>
            <ReactBar reactions={[
              { icon: '💪', bg: p.ember }, { icon: '🔥', bg: p.raspberry },
            ]} comments="2 comments" p={p} T={T}/>
          </Card>

        </div>

        <MobileTabBar active="home" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 2 — FEED ITEM DETAIL (with comments)
// ─────────────────────────────────────────────────────────────
const MobileFeedDetail = () => {
  const p = F.p(); const T = F.T();
  const comments = [
    { name: 'Sarah K.', role: 'Sam & Max\'s mom', avatar: p.accent, when: '2h', text: 'These are amazing — Max came home covered in mud and grinning ear to ear. Worth it.', likes: 8, mine: true },
    { name: 'Mr. Brooks', role: 'Asst. Scoutmaster', avatar: p.ember, when: '3h', text: 'Hawk patrol — I am still recovering from how good your fire was. Take a bow.', likes: 12, leader: true },
    { name: 'Lisa T.', role: 'Anna\'s mom', avatar: p.plum, when: '4h', text: 'Could we get the one of Anna and Eli at the finish line as a print? Happy to pay.', likes: 3 },
    { name: 'Ms. Carter', role: 'Advancement', avatar: p.teal, when: '4h', text: 'Replied to Lisa: yes — DM me with size and I\'ll get it ordered.', likes: 1, leader: true },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Post">
      <div style={{ background: p.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.ui }}>
        {/* Top bar */}
        <div style={{ padding: '6px 16px 10px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', gap: 10, background: p.surface, position: 'sticky', top: 0, zIndex: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: p.ink }}>Post</div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
        </div>

        {/* Body — scroll area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '14px 16px 8px', background: p.surface, borderBottom: `1px solid ${p.line}` }}>
            <Author name="Mr. Avery" role="Scoutmaster" avatar={p.plum} when="4h" p={p} T={T}/>
            <TypeChip kind="photo" p={p}/>
            <p style={{ fontSize: 14, color: p.ink, lineHeight: 1.5, margin: '8px 0 0' }}>
              Klondike Derby was a whole thing. Hawk patrol took first in fire-building, Eagle patrol owned the sled race. Full set of 47 photos in the album — link in the troop site. Couple highlights:
            </p>
            <PhotoCollage tiles={[p.accent, p.ember, p.teal, p.plum]} more={43} p={p}/>
            <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 6 }}>📍 Anytown Scout Reservation · Mar 1, 2026</div>
            {/* Reaction summary row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${p.lineSoft}`, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex' }}>
                  {[
                    { icon: '❤', bg: p.raspberry },
                    { icon: '👍', bg: p.accent },
                    { icon: '🎉', bg: p.ember },
                  ].map((r, i) => (
                    <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: r.bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, marginLeft: i ? -6 : 0, border: `2px solid ${p.surface}`, zIndex: 10 - i }}>{r.icon}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: p.inkSoft, fontWeight: 500 }}>32 reactions · 11 comments</div>
              </div>
              <div style={{ fontSize: 11, color: p.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 11l3 3L22 4"/></svg>
                You liked
              </div>
            </div>
          </div>

          {/* Moderation banner */}
          <div style={{ padding: '10px 16px', background: p.success + '12', borderBottom: `1px solid ${p.success}33`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}><path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6z M9 12l2 2 4-4"/></svg>
            <div style={{ fontSize: 11, color: p.inkSoft, lineHeight: 1.4 }}>
              <span style={{ color: p.success, fontWeight: 700 }}>Comments are moderated.</span> Visible to verified troop families only. Leaders review before guests see them — youth members can react but cannot start new threads.
            </div>
          </div>

          {/* Comments */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>11 comments · most-liked first</div>
            {comments.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: c.avatar, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {c.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: p.ink }}>{c.name}</div>
                      {c.leader && (
                        <div style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: p.success + '22', color: p.success, borderRadius: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Leader</div>
                      )}
                      {c.mine && (
                        <div style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: p.accent + '22', color: p.accent, borderRadius: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>You</div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: p.inkMuted, marginBottom: 4 }}>{c.role}</div>
                    <div style={{ fontSize: 13, color: p.ink, lineHeight: 1.45 }}>{c.text}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 4, marginLeft: 12, fontSize: 11, color: p.inkMuted }}>
                    <span>{c.when}</span>
                    <span style={{ fontWeight: 600, color: c.mine ? p.accent : p.inkSoft }}>Like {c.likes > 0 && `· ${c.likes}`}</span>
                    <span style={{ fontWeight: 600 }}>Reply</span>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: p.accent, fontWeight: 600, textAlign: 'center', padding: 8 }}>Show 7 more comments</div>
          </div>
        </div>

        {/* Compose */}
        <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${p.line}`, background: p.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>SK</div>
          <div style={{ flex: 1, background: p.bg, border: `1px solid ${p.line}`, borderRadius: 18, padding: '8px 14px', fontSize: 13, color: p.inkMuted, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Add a comment…</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8 15s1.5 2 4 2 4-2 4-2"/></svg>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 3 — LEADER POST COMPOSER
// ─────────────────────────────────────────────────────────────
const MobileFeedCompose = () => {
  const p = F.p(); const T = F.T();
  const types = [
    { id: 'photo',       l: 'Photos',     c: p.teal, active: true },
    { id: 'event',       l: 'Event',      c: p.accent },
    { id: 'achievement', l: 'Achievement', c: p.ember },
    { id: 'news',        l: 'News',       c: p.plum },
    { id: 'poll',        l: 'Poll',       c: p.raspberry },
    { id: 'reminder',    l: 'Reminder',   c: p.ember },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · New post">
      <div style={{ background: p.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.ui }}>
        {/* Top bar */}
        <div style={{ padding: '8px 16px 10px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: p.surface }}>
          <div style={{ fontSize: 14, color: p.inkSoft, fontWeight: 500 }}>Cancel</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: p.ink }}>New post</div>
          <div style={{ fontSize: 14, color: p.accent, fontWeight: 600 }}>Post</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Author + audience */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${p.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>MA</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>Posting as Mr. Avery</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, padding: '4px 8px', background: p.accent + '14', borderRadius: 6, width: 'fit-content' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 11a4 4 0 1 0 0-8M21 21v-2a4 4 0 0 0-3-3.87"/></svg>
                  <div style={{ fontSize: 11, color: p.accent, fontWeight: 700 }}>Audience: All troop families</div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
            </div>
          </div>

          {/* Type picker */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${p.line}` }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Type</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {types.map((t) => (
                <div key={t.id} style={{
                  padding: '10px 8px',
                  background: t.active ? t.c + '18' : p.surface,
                  border: `1.5px solid ${t.active ? t.c : p.line}`,
                  borderRadius: 10,
                  textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: t.c }}/>
                  <div style={{ fontSize: 11, fontWeight: t.active ? 700 : 600, color: t.active ? t.c : p.inkSoft }}>{t.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Body input */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${p.line}` }}>
            <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: p.ink, lineHeight: 1.3, letterSpacing: '-0.01em', marginBottom: 8 }}>
              Klondike Derby was a whole thing.
            </div>
            <div style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.5 }}>
              Hawk patrol took first in fire-building, Eagle patrol owned the sled race. Full set of 47 photos|
            </div>
            {/* Photo strip */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14, overflowX: 'auto' }}>
              {[p.accent, p.ember, p.teal, p.plum, p.raspberry].map((c, i) => (
                <div key={i} style={{
                  width: 70, height: 70, borderRadius: 8, flexShrink: 0,
                  background: `linear-gradient(135deg, ${c}, ${c}99)`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <svg width="100%" height="100%" viewBox="0 0 70 70" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
                    <polygon points={`0,${40 + i*3} 25,${30 + i*3} 50,${42 - i} 70,${36 + i*3} 70,70 0,70`} fill="#0f172a"/>
                  </svg>
                  <div style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, background: 'rgba(15,23,42,0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>×</div>
                </div>
              ))}
              <div style={{
                width: 70, height: 70, borderRadius: 8, flexShrink: 0,
                background: p.bg, border: `1.5px dashed ${p.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.inkMuted,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            </div>
            <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 6 }}>5 of 47 photos · drop more or pick from event album</div>
          </div>

          {/* Options */}
          <div style={{ padding: '14px 16px' }}>
            {[
              { l: 'Pin to top of feed', sub: 'For 48 hours · only one pinned at a time', on: false, icon: 'M16 12V4h1V2H7v2h1v8L6 16v2h12v-2zM12 18v4', color: p.ember },
              { l: 'Auto-respect photo permissions', sub: 'Faces auto-blurred where required', on: true, locked: true, color: p.success, icon: 'M12 11h.01 M12 7v4 M12 15v.01 M5 12h.01 M19 12h.01' },
              { l: 'Allow comments', sub: 'Moderated · leaders see before public', on: true, color: p.accent, icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z' },
              { l: 'Cross-post to public site', sub: 'compass.app/troop12', on: false, color: p.teal, icon: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18' },
            ].map((row, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < arr.length - 1 ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: row.color + '18', color: row.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={row.icon}/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 13, color: p.ink, fontWeight: 500 }}>{row.l}</div>
                    {row.locked && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={p.inkMuted}><path d="M19 11h-1V7a6 6 0 0 0-12 0v4H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1zM8 7a4 4 0 0 1 8 0v4H8z"/></svg>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{row.sub}</div>
                </div>
                <div style={{
                  width: 40, height: 24, borderRadius: 12, background: row.on ? row.color : p.line,
                  position: 'relative', flexShrink: 0,
                  opacity: row.locked ? 0.6 : 1,
                }}>
                  <div style={{ position: 'absolute', top: 2, left: row.on ? 18 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

window.MobileFeed = MobileFeed;
window.MobileFeedDetail = MobileFeedDetail;
window.MobileFeedCompose = MobileFeedCompose;
