// Compass team chat — 5 mobile screens
// Replaces the old Messages tab with a SportsEngine/TeamSnap-style chat experience.
// Channels list · Patrol thread (two-deep) · Event RSVP in chat · Poll · Pinned + leader view

const C = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

const ChatTabBar = ({ active = 'chat', p }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V11z' },
    { id: 'cal', label: 'Calendar', icon: 'M7 3v2M17 3v2M4 8h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
    { id: 'chat', label: 'Chat', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z' },
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
// Screen 1 — Channels list
// ─────────────────────────────────────────────────────────────
const ChatChannels = () => {
  const p = C.p(); const T = C.T();
  const sections = [
    {
      title: 'Your channels',
      items: [
        { name: 'Hawk Patrol', sub: 'Sam: who has the dutch oven?', t: '4m', n: 5, c: p.accent, icon: '🦅', twoDeep: true, member: '8 scouts · 2 leaders' },
        { name: 'Troop 12 — All', sub: 'Mr. Avery: meeting moves to 7:30', t: '1h', n: 0, c: p.ink, icon: '★', member: '32 scouts · 18 leaders · 47 parents' },
        { name: 'Parents — Troop 12', sub: 'Kris: anyone driving from across town?', t: '2h', n: 2, c: p.plum, icon: '👥', member: '47 parents' },
      ],
    },
    {
      title: 'Event channels',
      items: [
        { name: 'Spring Campout', sub: 'Mr. Brooks pinned the packing list', t: '14m', n: 3, c: p.ember, icon: '⛺', auto: true, member: '18 going · ends Sun' },
        { name: 'Eagle Project — Jamie', sub: 'Jamie: thanks for signing up!', t: '2d', n: 0, c: p.teal, icon: '🌲', auto: true, member: '12 going · ends Sat' },
      ],
    },
    {
      title: 'Leader-only',
      items: [
        { name: 'Key Three + Committee', sub: 'Ms. Carter: budget review attached', t: 'Yest', n: 1, c: p.raspberry, icon: '🔒', leader: true, member: '7 leaders' },
      ],
    },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Chat">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        {/* Sticky header */}
        <div style={{ padding: '8px 20px 12px', position: 'sticky', top: 0, background: p.bg, zIndex: 10, borderBottom: `1px solid ${p.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Chat</h1>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </div>
          </div>
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <div style={{ fontSize: 13, color: p.inkMuted }}>Search channels & messages</div>
          </div>
        </div>

        {sections.map((sec, i) => (
          <div key={i} style={{ padding: '12px 20px 4px' }}>
            <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, padding: '6px 0' }}>{sec.title}</div>
            {sec.items.map((ch, j) => (
              <div key={j} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: j < sec.items.length - 1 ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: ch.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {ch.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: p.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</div>
                      {ch.auto && <div style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: p.accent + '22', color: p.accent, letterSpacing: '0.04em' }}>EVENT</div>}
                      {ch.leader && <svg width="11" height="11" viewBox="0 0 24 24" fill={p.raspberry}><path d="M5 11V8a7 7 0 0 1 14 0v3M5 11h14v10H5z"/></svg>}
                    </div>
                    <div style={{ fontSize: 11, color: p.inkMuted, flexShrink: 0 }}>{ch.t}</div>
                  </div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1 }}>{ch.member}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    {ch.twoDeep && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, color: p.success, fontWeight: 700, padding: '2px 5px', background: p.success + '18', borderRadius: 3 }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
                        TWO-DEEP
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: p.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ch.sub}</div>
                  </div>
                </div>
                {ch.n > 0 && (
                  <div style={{ minWidth: 22, height: 22, padding: '0 7px', background: p.accent, color: '#fff', borderRadius: 11, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 4 }}>{ch.n}</div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{ padding: '16px 20px 0', fontSize: 11, color: p.inkMuted, textAlign: 'center', lineHeight: 1.5 }}>
          Channels are auto-created from your roster. Leaders see every channel by YPT policy.
        </div>

        <ChatTabBar active="chat" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 2 — Patrol thread (two-deep banner, photos, reactions)
// ─────────────────────────────────────────────────────────────
const ChatPatrol = () => {
  const p = C.p(); const T = C.T();
  const messages = [
    { side: 'l', who: 'Mr. Avery', role: 'Scoutmaster', leader: true, text: 'Hey Hawks — packing list for Friday is pinned. Sleeping bag rated 30°F minimum.', t: '3:14 PM', avatarColor: p.plum },
    { side: 'l', who: 'Sam', age: 14, text: 'who has the dutch oven from last time?', t: '3:42 PM', avatarColor: p.accent },
    { side: 'l', who: 'Max', age: 12, text: 'i thought Jamie did?', t: '3:43 PM', avatarColor: p.teal, reactions: ['👍 2'] },
    { side: 'l', who: 'Jamie', age: 13, text: 'yeah it\'s in my garage. i\'ll bring it Friday', t: '3:51 PM', avatarColor: p.ember, reactions: ['🙏 4'] },
    { side: 'l', who: 'Sam', age: 14, photo: true, t: '4:02 PM', avatarColor: p.accent, photoCaption: 'spotted at the trailhead' },
    { side: 'r', who: 'Alex (you)', text: 'Friday looks great — 60 and sunny ☀️', t: '4:08 PM' },
    { side: 'l', who: 'Mr. Brooks', role: 'ASM', leader: true, text: '@Sam can you confirm whether Henry\'s patrol is borrowing our trail stove?', t: '4:11 PM', avatarColor: p.raspberry, mentions: true },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Hawk Patrol">
      <div style={{ background: p.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.ui }}>
        {/* Top bar */}
        <div style={{ padding: '6px 12px 10px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', gap: 10, background: p.surface }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🦅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>Hawk Patrol</div>
            <div style={{ fontSize: 11, color: p.inkMuted }}>8 scouts · 2 leaders · Troop 12</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="1.8"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </div>

        {/* Two-deep banner */}
        <div style={{ padding: '8px 14px', background: p.success + '12', borderBottom: `1px solid ${p.success}33`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="2.2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
          <div style={{ fontSize: 11, color: p.success, fontWeight: 600 }}>
            TWO-DEEP <span style={{ fontWeight: 500, color: p.inkSoft }}>· Mr. Avery & Mr. Brooks watching · scouts can chat freely</span>
          </div>
        </div>

        {/* Pinned card */}
        <div style={{ padding: '10px 14px', background: p.butter + '22', borderBottom: `1px solid ${p.butter}55`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={p.ember} stroke={p.ember} strokeWidth="2"><path d="M16 4l4 4-7 7-4 4-3-3 4-4 7-7z"/></svg>
          <div style={{ flex: 1, fontSize: 12, color: p.ink, lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600 }}>Pinned: Spring Campout packing list</div>
            <div style={{ color: p.inkSoft, fontSize: 11, marginTop: 1 }}>Mr. Avery · 2d ago · tap to view</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, padding: '14px 12px 8px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.side === 'r' ? 'flex-end' : 'flex-start', gap: 8 }}>
              {m.side === 'l' && (
                <div style={{ width: 32, height: 32, borderRadius: 16, background: m.avatarColor, color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 14 }}>
                  {m.who.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
              )}
              <div style={{ maxWidth: '76%' }}>
                {m.side === 'l' && (
                  <div style={{ fontSize: 10, color: p.inkMuted, marginBottom: 3, marginLeft: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: m.leader ? p.raspberry : p.inkSoft }}>{m.who}</span>
                    {m.leader && <span style={{ fontSize: 8, padding: '1px 4px', background: p.raspberry, color: '#fff', borderRadius: 2, letterSpacing: '0.04em' }}>{m.role}</span>}
                    {m.age && <span style={{ color: p.inkMuted }}>· age {m.age}</span>}
                  </div>
                )}
                {m.photo ? (
                  <div>
                    <div style={{
                      width: 220, height: 180, borderRadius: 16, borderBottomLeftRadius: 6,
                      background: `linear-gradient(135deg, ${p.teal}, ${p.success})`,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <svg width="100%" height="100%" viewBox="0 0 220 180" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
                        <polygon points="0,140 60,100 110,130 170,80 220,110 220,180 0,180" fill="#0f172a" opacity="0.5"/>
                        <polygon points="0,160 80,130 140,150 200,120 220,140 220,180 0,180" fill="#0f172a" opacity="0.7"/>
                      </svg>
                    </div>
                    {m.photoCaption && <div style={{ fontSize: 12, color: p.inkSoft, padding: '4px 12px 0', fontStyle: 'italic' }}>{m.photoCaption}</div>}
                  </div>
                ) : (
                  <div style={{
                    background: m.side === 'r' ? p.accent : p.surface,
                    color: m.side === 'r' ? '#fff' : p.ink,
                    border: m.side === 'r' ? 'none' : `1px solid ${p.line}`,
                    borderRadius: 16,
                    borderBottomRightRadius: m.side === 'r' ? 4 : 16,
                    borderBottomLeftRadius: m.side === 'l' ? 4 : 16,
                    padding: '8px 12px',
                    fontSize: 14,
                    lineHeight: 1.4,
                  }}>
                    {m.mentions ? (
                      <span><span style={{ background: p.accent + '22', color: p.accent, padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}>@Sam</span>{' ' + m.text.replace('@Sam ', '')}</span>
                    ) : m.text}
                  </div>
                )}
                {m.reactions && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, marginLeft: 8 }}>
                    {m.reactions.map((r, k) => (
                      <div key={k} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 500, color: p.inkSoft }}>{r}</div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 3, textAlign: m.side === 'r' ? 'right' : 'left', marginLeft: m.side === 'l' ? 12 : 0, marginRight: m.side === 'r' ? 4 : 0 }}>{m.t}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Compose */}
        <div style={{ padding: '8px 10px 12px', borderTop: `1px solid ${p.line}`, background: p.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.bg, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <div style={{ flex: 1, background: p.bg, border: `1px solid ${p.line}`, borderRadius: 18, padding: '8px 14px', fontSize: 13, color: p.inkMuted }}>Message Hawk Patrol…</div>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.surface, border: `1px solid ${p.line}`, color: p.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>😀</div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 3 — Event RSVP in chat
// ─────────────────────────────────────────────────────────────
const ChatEventRSVP = () => {
  const p = C.p(); const T = C.T();
  return (
    <IOSDevice width={402} height={874} title="Compass · Spring Campout">
      <div style={{ background: p.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.ui }}>
        <div style={{ padding: '6px 12px 10px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', gap: 10, background: p.surface }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: p.ember, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⛺</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>Spring Campout</div>
            <div style={{ fontSize: 11, color: p.inkMuted }}>Event channel · 18 going · ends Sunday</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Event card embedded in chat */}
          <div style={{ background: p.surface, border: `2px solid ${p.ember}`, borderRadius: 14, overflow: 'hidden', alignSelf: 'flex-start', maxWidth: '92%' }}>
            <div style={{ padding: '10px 14px', background: p.ember + '14', borderBottom: `1px solid ${p.ember}44`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.ember} strokeWidth="2"><path d="M7 3v2M17 3v2M4 8h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: p.ember, textTransform: 'uppercase' }}>Event · auto-posted by Compass</div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, lineHeight: 1.15, marginBottom: 6 }}>Spring Campout — Birch Lake</div>
              <div style={{ fontSize: 13, color: p.inkSoft, marginBottom: 10 }}>Fri Mar 21, 5:30 PM → Sun Mar 23, 11:00 AM</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, padding: '6px 8px', background: p.bg, borderRadius: 6, fontSize: 11, color: p.inkSoft, textAlign: 'center' }}>$35/scout</div>
                <div style={{ flex: 1, padding: '6px 8px', background: p.bg, borderRadius: 6, fontSize: 11, color: p.inkSoft, textAlign: 'center' }}>Permission slip</div>
                <div style={{ flex: 1, padding: '6px 8px', background: p.bg, borderRadius: 6, fontSize: 11, color: p.inkSoft, textAlign: 'center' }}>2 nights</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { l: 'Going', c: p.success, count: 18, active: true },
                  { l: 'Maybe', c: p.ember, count: 4 },
                  { l: 'Can\'t', c: p.inkMuted, count: 2 },
                ].map((b, i) => (
                  <div key={i} style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8,
                    background: b.active ? b.c : p.bg,
                    color: b.active ? '#fff' : p.inkSoft,
                    border: b.active ? 'none' : `1px solid ${p.line}`,
                    textAlign: 'center', fontSize: 12, fontWeight: 600,
                  }}>{b.l} <span style={{ opacity: 0.7 }}>·</span> {b.count}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Drivers poll embedded */}
          <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: p.plum, color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 18, flexShrink: 0 }}>RB</div>
            <div>
              <div style={{ fontSize: 10, color: p.inkMuted, marginBottom: 3, marginLeft: 10, fontWeight: 600 }}>
                <span style={{ color: p.raspberry }}>Mr. Brooks</span>
                <span style={{ fontSize: 8, padding: '1px 4px', background: p.raspberry, color: '#fff', borderRadius: 2, marginLeft: 6, letterSpacing: '0.04em' }}>ASM</span>
              </div>
              <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 16, borderBottomLeftRadius: 4, padding: '12px 14px', fontSize: 13, color: p.ink }}>
                Drivers — who's got open seats Friday?
              </div>
              <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 3, marginLeft: 10 }}>2:14 PM</div>
            </div>
          </div>

          {/* RSVP confirmation toast */}
          <div style={{ alignSelf: 'center', padding: '6px 12px', background: p.success + '22', color: p.success, fontSize: 11, fontWeight: 600, borderRadius: 999 }}>
            ✓ Alex marked Sam & Max as Going · paid $70
          </div>

          {/* User msg */}
          <div style={{ alignSelf: 'flex-end', maxWidth: '76%' }}>
            <div style={{ background: p.accent, color: '#fff', borderRadius: 16, borderBottomRightRadius: 4, padding: '8px 12px', fontSize: 14, lineHeight: 1.4 }}>
              I have 3 seats — leaving 5:00 from St. Mark's parking lot 🚗
            </div>
            <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 3, textAlign: 'right' }}>2:18 PM · ✓✓ read by 14</div>
          </div>
        </div>

        <div style={{ padding: '8px 10px 12px', borderTop: `1px solid ${p.line}`, background: p.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: p.bg, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <div style={{ flex: 1, background: p.bg, border: `1px solid ${p.line}`, borderRadius: 18, padding: '8px 14px', fontSize: 13, color: p.inkMuted }}>Message Spring Campout…</div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 4 — Poll
// ─────────────────────────────────────────────────────────────
const ChatPoll = () => {
  const p = C.p(); const T = C.T();
  const options = [
    { l: 'Beef chili', count: 12, color: p.ember, picked: true },
    { l: 'Chicken & rice', count: 7, color: p.butter },
    { l: 'Mac & cheese (vegetarian)', count: 5, color: p.teal },
    { l: 'Tacos', count: 3, color: p.raspberry },
  ];
  const total = options.reduce((a, o) => a + o.count, 0);
  return (
    <IOSDevice width={402} height={874} title="Compass · Troop 12">
      <div style={{ background: p.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.ui }}>
        <div style={{ padding: '6px 12px 10px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', gap: 10, background: p.surface }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: p.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>★</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>Troop 12 — All</div>
            <div style={{ fontSize: 11, color: p.inkMuted }}>32 scouts · 18 leaders · 47 parents</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Earlier message */}
          <div style={{ alignSelf: 'flex-start', maxWidth: '76%', display: 'flex', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: p.plum, color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 18, flexShrink: 0 }}>MA</div>
            <div>
              <div style={{ fontSize: 10, color: p.inkMuted, marginBottom: 3, marginLeft: 10, fontWeight: 600 }}>
                <span style={{ color: p.raspberry }}>Mr. Avery</span>
                <span style={{ fontSize: 8, padding: '1px 4px', background: p.raspberry, color: '#fff', borderRadius: 2, marginLeft: 6 }}>SM</span>
              </div>
              <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 16, borderBottomLeftRadius: 4, padding: '8px 12px', fontSize: 13, color: p.ink }}>
                Picking dinner for the campout. Vote by Wednesday 8 PM.
              </div>
            </div>
          </div>

          {/* Poll card */}
          <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: 14, marginLeft: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2"><path d="M3 3v18h18M9 17v-6M14 17v-3M19 17v-9"/></svg>
              <div style={{ fontSize: 10, fontWeight: 700, color: p.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Poll · ends Wed 8 PM</div>
            </div>
            <div style={{ fontFamily: T.display, fontSize: 19, color: p.ink, lineHeight: 1.2, marginBottom: 14 }}>
              What should we cook Friday night?
            </div>

            {options.map((o, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 10, marginBottom: 8, overflow: 'hidden', border: `1px solid ${o.picked ? o.color : p.line}` }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(o.count / total) * 100}%`, background: o.color + '22' }}/>
                <div style={{ position: 'relative', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {o.picked && (
                      <div style={{ width: 16, height: 16, borderRadius: 8, background: o.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: p.ink, fontWeight: o.picked ? 600 : 500 }}>{o.l}</div>
                  </div>
                  <div style={{ fontSize: 12, color: p.inkSoft, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{o.count}</div>
                </div>
              </div>
            ))}

            <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 8 }}>{total} of 32 scouts voted · you picked Beef chili</div>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Screen 5 — Leader admin / moderation view
// ─────────────────────────────────────────────────────────────
const ChatLeaderView = () => {
  const p = C.p(); const T = C.T();
  return (
    <IOSDevice width={402} height={874} title="Compass · Leader view">
      <div style={{ background: p.bg, minHeight: '100%', fontFamily: T.ui, paddingBottom: 40 }}>
        <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          <div style={{ fontSize: 14, color: p.accent, fontWeight: 500 }}>Hawk Patrol</div>
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: p.raspberry, color: '#fff', borderRadius: 999, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M5 11V8a7 7 0 0 1 14 0v3M5 11h14v10H5z"/></svg>
            Leader-only view
          </div>
          <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 6px', lineHeight: 1.1 }}>Channel oversight</h1>
          <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.5, margin: '0 0 20px' }}>
            What you can see and do in Hawk Patrol that scouts can't. All actions are logged.
          </p>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {[
              { v: '147', l: 'msgs (30d)', c: p.accent },
              { v: '0', l: 'flags', c: p.success },
              { v: '8/8', l: 'scouts active', c: p.teal },
            ].map((s, i) => (
              <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: 12, textAlign: 'center', borderTop: `3px solid ${s.c}` }}>
                <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink }}>{s.v}</div>
                <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Tools */}
          <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Moderation</div>
          {[
            { l: 'Keyword alerts', sub: '12 watch terms · last alert: never', icon: 'M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z', c: p.ember },
            { l: 'Export channel log', sub: 'CSV / PDF · last 90 days · YPT-redacted version available', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', c: p.accent },
            { l: 'Mute or remove member', sub: 'Soft mute (no notifications) or full remove with archive', icon: 'M5 12h14M12 5v14', c: p.plum },
            { l: 'Auto-archive on event end', sub: 'On · Spring Campout will archive Sun 11:59 PM', icon: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4', c: p.teal },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: i < 3 ? `1px solid ${p.lineSoft}` : 'none', alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: t.c + '22', color: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>{t.l}</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{t.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}

          <div style={{ marginTop: 20, padding: 14, background: p.success + '12', border: `1px solid ${p.success}55`, borderRadius: 12, fontSize: 12, color: p.inkSoft, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: p.success, fontWeight: 700 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
              YPT compliance
            </div>
            Two-deep is automatic. Mr. Avery and Mr. Brooks are both on this channel. Removing either auto-suspends the channel.
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

window.ChatChannels = ChatChannels;
window.ChatPatrol = ChatPatrol;
window.ChatEventRSVP = ChatEventRSVP;
window.ChatPoll = ChatPoll;
window.ChatLeaderView = ChatLeaderView;
