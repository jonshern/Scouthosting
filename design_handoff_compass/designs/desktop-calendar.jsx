// Compass desktop calendar — across-month event control
// Beautiful month + week view, color-coded categories, multi-day spans, filters.

const DCAL = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// Categories
const CATS = [
  { id: 'meeting',   label: 'Troop meetings',  color: 'accent',    n: 12 },
  { id: 'outing',    label: 'Outings & trips', color: 'ember',     n: 4 },
  { id: 'service',   label: 'Service',         color: 'teal',      n: 3 },
  { id: 'leader',    label: 'Leader-only',     color: 'plum',      n: 6 },
  { id: 'court',     label: 'Court of Honor',  color: 'raspberry', n: 2 },
  { id: 'sports',    label: 'Sporting events', color: 'mustard',   n: 5 },
];

// March 2026 events with full data
const M3_EVENTS = [
  { day: 3,  start: '7:00 PM', end: '8:30 PM', title: 'Troop Meeting · Knot tying',     cat: 'meeting',   loc: 'Christ Lutheran',  rsvp: 18 },
  { day: 5,  start: '6:30 PM', end: '8:00 PM', title: 'PLC — March planning',           cat: 'leader',    loc: 'Schulz residence', rsvp: 7 },
  { day: 7,  start: '9:00 AM', end: '12:00 PM',title: 'Park cleanup service',           cat: 'service',   loc: 'Anderson Park',    rsvp: 14 },
  { day: 10, start: '7:00 PM', end: '8:30 PM', title: 'Troop Meeting · Map & compass',  cat: 'meeting',   loc: 'Christ Lutheran',  rsvp: 22 },
  { day: 14, start: '8:00 AM', end: '5:00 PM', title: 'District Klondike Derby',        cat: 'sports',    loc: 'Camp Wilderness',  rsvp: 16 },
  { day: 17, start: '7:00 PM', end: '8:30 PM', title: 'Troop Meeting · Patrol games',   cat: 'meeting',   loc: 'Christ Lutheran',  rsvp: 19 },
  // Multi-day campout 20-22
  { day: 20, span: 3, start: '5:00 PM', end: 'Sun 4 PM', title: 'Spring Campout — Tomahawk SR', cat: 'outing', loc: 'Tomahawk Scout Reservation', rsvp: 24 },
  { day: 24, start: '7:00 PM', end: '8:30 PM', title: 'Troop Meeting · Reflections',    cat: 'meeting',   loc: 'Christ Lutheran',  rsvp: 17 },
  { day: 25, start: '6:00 PM', end: '7:00 PM', title: 'Board of Review · Eli M.',       cat: 'court',     loc: 'Christ Lutheran',  rsvp: 4 },
  { day: 28, start: '10:00 AM', end: '12:00 PM', title: 'Eagle project workday',        cat: 'service',   loc: 'New Hope Library', rsvp: 11 },
  { day: 31, start: '7:00 PM', end: '8:30 PM', title: 'Troop Meeting · Cooking MB',     cat: 'meeting',   loc: 'Christ Lutheran',  rsvp: 21 },
];

const catColor = (id, p) => {
  const c = CATS.find(c => c.id === id);
  return p[c.color];
};

// ─── Month grid ──────────────────────────────────────────────
const MonthGrid = ({ p, T }) => {
  // March 2026: starts Sun. 31 days.
  const FIRST_DOW = 0; // Sun
  const DAYS = 31;
  const weeks = [];
  let cur = [];
  // pad start with Feb tail (22-28)
  for (let i = 0; i < FIRST_DOW; i++) cur.push({ day: 22 + i, muted: true, m: 'Feb' });
  for (let d = 1; d <= DAYS; d++) {
    cur.push({ day: d });
    if (cur.length === 7) { weeks.push(cur); cur = []; }
  }
  // pad end with Apr 1-?
  let next = 1;
  while (cur.length > 0 && cur.length < 7) cur.push({ day: next++, muted: true, m: 'Apr' });
  if (cur.length) weeks.push(cur);

  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // For each event, determine which weeks it lives in for span rendering
  // Simple: render single-day events as chips inside cells. Multi-day as colored bars across cells.

  const todayD = 17;

  return (
    <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      {/* DOW header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${p.line}`, background: p.bg }}>
        {dows.map((d, i) => (
          <div key={i} style={{ padding: '10px 12px', fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 124, borderBottom: wi < weeks.length - 1 ? `1px solid ${p.line}` : 'none', position: 'relative' }}>
          {week.map((cell, ci) => {
            const events = !cell.muted ? M3_EVENTS.filter(e => e.day === cell.day && !e.span) : [];
            const isToday = !cell.muted && cell.day === todayD;
            return (
              <div key={ci} style={{
                borderRight: ci < 6 ? `1px solid ${p.lineSoft}` : 'none',
                padding: '8px 8px 0',
                background: cell.muted ? p.bg : '#fff',
                position: 'relative',
                opacity: cell.muted ? 0.5 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  {isToday ? (
                    <div style={{
                      width: 24, height: 24, borderRadius: 12, background: p.ember,
                      color: '#fff', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: T.display,
                    }}>{cell.day}</div>
                  ) : (
                    <div style={{ fontSize: 13, color: cell.muted ? p.inkMuted : p.ink, fontWeight: 500, fontFamily: T.display, padding: '2px 4px' }}>
                      {cell.day}{cell.m && <span style={{ fontSize: 10, color: p.inkMuted, marginLeft: 4 }}>{cell.m}</span>}
                    </div>
                  )}
                </div>
                {/* single day chips */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {events.map((e, ei) => (
                    <EventChip key={ei} ev={e} p={p} T={T}/>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Multi-day campout bar Mar 20-22 lives in week containing day 20 */}
          {wi === 3 && (
            <MultiDayBar
              startCol={5} // Friday Mar 20 (week starts Sun Mar 15 → Fri = col 5)
              span={3}
              title="Spring Campout — Tomahawk SR"
              start="Fri 5pm" end="Sun 4pm"
              p={p} T={T}
              top={36}
            />
          )}
        </div>
      ))}
    </div>
  );
};

const EventChip = ({ ev, p, T }) => {
  const c = catColor(ev.cat, p);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '2px 5px', borderRadius: 4,
      fontSize: 11, color: p.ink, lineHeight: 1.3,
      background: c + '12',
      borderLeft: `2px solid ${c}`,
      cursor: 'default',
    }}>
      <span style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', color: p.inkSoft, fontSize: 10 }}>{ev.start.replace(' PM', 'p').replace(' AM', 'a').replace(':00', '')}</span>
      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ev.title}</span>
    </div>
  );
};

const MultiDayBar = ({ startCol, span, title, start, end, p, T, top }) => {
  const c = p.ember;
  return (
    <div style={{
      position: 'absolute',
      left: `calc(${startCol} * (100% / 7) + 4px)`,
      width: `calc(${span} * (100% / 7) - 8px)`,
      top, height: 26,
      background: c,
      borderRadius: 6,
      padding: '5px 10px',
      color: '#fff',
      fontSize: 12, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      boxShadow: `0 2px 6px ${c}44`,
      pointerEvents: 'none',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🏕 {title}</span>
      <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, flexShrink: 0 }}>{start} → {end}</span>
    </div>
  );
};

// ─── Sidebar (categories + mini-month + filter) ──────────────
const Sidebar = ({ p, T }) => (
  <div style={{ width: 260, background: p.surface, borderRight: `1px solid ${p.line}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 24, fontSize: 13, overflow: 'auto' }}>
    {/* Brand */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <SHMark size={22} color={p.surfaceDark} accent={p.ember}/>
      <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>Compass</div>
    </div>

    {/* New event button */}
    <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '11px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      New event
    </button>

    {/* Mini month */}
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 500 }}>March 2026</div>
        <div style={{ display: 'flex', gap: 6, color: p.inkMuted }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', color: p.inkMuted, padding: 3, fontWeight: 600 }}>{d}</div>
        ))}
        {[...Array(31)].map((_, i) => {
          const d = i + 1;
          const has = M3_EVENTS.some(e => e.day === d || (e.span && d >= e.day && d < e.day + e.span));
          const isToday = d === 17;
          return (
            <div key={i} style={{
              textAlign: 'center', padding: '4px 0', position: 'relative',
              background: isToday ? p.ember : 'transparent',
              color: isToday ? '#fff' : p.ink,
              borderRadius: 4, fontWeight: isToday ? 600 : 400,
            }}>
              {d}
              {has && !isToday && <div style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: 2, background: p.ember }}/>}
            </div>
          );
        })}
      </div>
    </div>

    {/* Categories */}
    <div>
      <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Categories</div>
      {CATS.map((c, i) => (
        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', cursor: 'pointer' }}>
          <div style={{
            width: 14, height: 14, borderRadius: 4,
            background: p[c.color],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M5 12l4 4L19 7"/></svg>
          </div>
          <span style={{ flex: 1, fontSize: 13, color: p.ink }}>{c.label}</span>
          <span style={{ fontSize: 11, color: p.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>
        </label>
      ))}
    </div>

    {/* Subscribers */}
    <div>
      <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Calendars I see</div>
      {[
        { l: 'Troop 567 — Master', c: p.ember, on: true },
        { l: 'Patrol: Hawks',     c: p.accent, on: true },
        { l: 'Dad scout (Pack 76)', c: p.teal, on: true },
        { l: 'District events',   c: p.plum, on: false },
      ].map((c, i) => (
        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', cursor: 'pointer', opacity: c.on ? 1 : 0.55 }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: c.on ? c.c : 'transparent', border: `1.5px solid ${c.c}` }}/>
          <span style={{ fontSize: 12, color: p.ink }}>{c.l}</span>
        </label>
      ))}
    </div>

    {/* Subscribe note */}
    <div style={{ fontSize: 11, color: p.inkMuted, lineHeight: 1.5, padding: 12, background: p.bg, borderRadius: 8, border: `1px solid ${p.lineSoft}` }}>
      Subscribe in Apple/Google calendar — events sync automatically. <span style={{ color: p.accent, fontWeight: 600 }}>Get my link →</span>
    </div>
  </div>
);

// ─── Right rail — selected event detail ──────────────────────
const EventDetailRail = ({ p, T }) => {
  // Selected: Spring Campout
  return (
    <div style={{ width: 340, background: '#fff', borderLeft: `1px solid ${p.line}`, padding: 24, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Cat tag + close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', background: p.ember + '18', color: p.ember, borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: p.ember }}/>
          Outing · 3 days
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6l-6 6"/></svg>
      </div>

      <div>
        <h2 style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0, color: p.ink }}>Spring Campout — Tomahawk SR</h2>
        <p style={{ fontSize: 13, color: p.inkSoft, fontStyle: 'italic', margin: '6px 0 0', fontFamily: T.display }}>Earn 2–3 merit badges in a single weekend.</p>
      </div>

      {/* Date strip */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { d: 20, dow: 'Fri', sub: '5:00 PM' },
          { d: 21, dow: 'Sat', sub: 'all day' },
          { d: 22, dow: 'Sun', sub: '4:00 PM' },
        ].map((x, i) => (
          <div key={i} style={{ flex: 1, padding: 10, border: `1px solid ${p.line}`, borderRadius: 8, textAlign: 'center', background: p.bg }}>
            <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{x.dow}</div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, marginTop: 2 }}>{x.d}</div>
            <div style={{ fontSize: 10, color: p.inkMuted, marginTop: 2 }}>{x.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick facts */}
      <div style={{ background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 10, padding: 14 }}>
        {[
          { l: 'Where', v: 'Tomahawk Scout Reservation', sub: '1230 W Park Rd, Rice Lake WI · 2hr drive' },
          { l: 'Cost',  v: '$45 per scout', sub: 'Includes food, site, and badges' },
          { l: 'Bring', v: 'Class A + B uniform', sub: 'Sleeping bag, mess kit, Cooking MB pamphlet' },
          { l: 'Lead',  v: 'Eric Schulz · Will Patel', sub: '2 registered adults · two-deep ✓' },
        ].map((f, i, arr) => (
          <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
            <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{f.l}</div>
            <div style={{ fontSize: 13, color: p.ink, fontWeight: 500 }}>{f.v}</div>
            <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 1 }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* RSVP */}
      <div>
        <div style={{ fontSize: 10, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>RSVP · 24 of 28 spots</div>
        <div style={{ height: 6, background: p.lineSoft, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: '85%', background: p.ember, borderRadius: 3 }}/>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button style={{ flex: 1, background: p.ink, color: '#fff', border: 'none', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Going</button>
          <button style={{ flex: 1, background: 'transparent', color: p.ink, border: `1px solid ${p.line}`, padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>Maybe</button>
          <button style={{ flex: 1, background: 'transparent', color: p.inkSoft, border: `1px solid ${p.line}`, padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>Skip</button>
        </div>
        {/* Avatar stack */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex' }}>
            {[p.accent, p.ember, p.teal, p.plum, p.raspberry].map((c, i) => (
              <div key={i} style={{ width: 26, height: 26, borderRadius: 13, background: c, color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', marginLeft: i ? -8 : 0 }}>
                {['EM','SR','JT','BL','KP'][i]}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: p.inkSoft }}>+19 others going</div>
        </div>
      </div>

      {/* Weather forecast */}
      <div style={{ padding: 14, border: `1px solid ${p.line}`, borderRadius: 10, background: '#fff' }}>
        <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Forecast · Rice Lake WI</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {['☀️','⛅','🌧'].map((ic, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{ic}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.ink, fontFamily: T.display }}>{[58,52,49][i]}°</div>
              <div style={{ fontSize: 10, color: p.inkMuted }}>{['Fri','Sat','Sun'][i]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Top toolbar ─────────────────────────────────────────────
const Toolbar = ({ p, T }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: `1px solid ${p.line}`, background: '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: p.ink }}>Today</button>
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={{ background: 'transparent', border: 'none', padding: 6, color: p.inkSoft, cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button style={{ background: 'transparent', border: 'none', padding: 6, color: p.inkSoft, cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <h1 style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: p.ink }}>March 2026</h1>
      <div style={{ fontSize: 12, color: p.inkMuted, marginLeft: 4 }}>11 events · 3 categories shown</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: p.bg, border: `1px solid ${p.line}`, borderRadius: 7, color: p.inkMuted, fontSize: 12, width: 200 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        Search events…
        <span style={{ marginLeft: 'auto', padding: '0 4px', borderRadius: 3, background: '#fff', border: `1px solid ${p.line}`, fontSize: 10, fontFamily: T.mono }}>⌘K</span>
      </div>
      {/* View toggle */}
      <div style={{ display: 'flex', background: p.bg, border: `1px solid ${p.line}`, borderRadius: 7, padding: 2, fontSize: 12 }}>
        {['Day', 'Week', 'Month', 'Schedule'].map((v, i) => (
          <div key={i} style={{
            padding: '5px 12px', borderRadius: 5,
            background: v === 'Month' ? '#fff' : 'transparent',
            color: v === 'Month' ? p.ink : p.inkSoft,
            fontWeight: v === 'Month' ? 600 : 500,
            boxShadow: v === 'Month' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            cursor: 'pointer',
          }}>{v}</div>
        ))}
      </div>
      <div style={{ width: 32, height: 32, borderRadius: 16, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>ES</div>
    </div>
  </div>
);

// ─── Artboard 1 — Month view ─────────────────────────────────
const DesktopCalendarMonth = () => {
  const p = DCAL.p(); const T = DCAL.T();
  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'grid', gridTemplateColumns: '260px 1fr 340px' }}>
      <Sidebar p={p} T={T}/>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Toolbar p={p} T={T}/>
        <div style={{ flex: 1, padding: 20, overflow: 'auto', minWidth: 0 }}>
          <MonthGrid p={p} T={T}/>
        </div>
      </div>
      <EventDetailRail p={p} T={T}/>
    </div>
  );
};

// ─── Artboard 2 — Week view (timeline) ───────────────────────
const DesktopCalendarWeek = () => {
  const p = DCAL.p(); const T = DCAL.T();
  // Mar 15 (Sun) — Mar 21 (Sat) 2026
  const days = [
    { dow: 'Sun', d: 15 },
    { dow: 'Mon', d: 16 },
    { dow: 'Tue', d: 17, today: true },
    { dow: 'Wed', d: 18 },
    { dow: 'Thu', d: 19 },
    { dow: 'Fri', d: 20 },
    { dow: 'Sat', d: 21 },
  ];
  const HOUR_H = 56;
  const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  // Events for week (with hour-precise times)
  const wkEvents = [
    { day: 17, startHr: 19, dur: 1.5, title: 'Troop Meeting', sub: 'Patrol games', cat: 'meeting' },
    { day: 20, startHr: 17, dur: 28, title: 'Spring Campout', sub: 'Tomahawk SR · departs from CL parking lot', cat: 'outing', spanDays: 3 },
    { day: 18, startHr: 18, dur: 1, title: 'Eagle project review', sub: 'with Mr. Patel', cat: 'leader' },
    { day: 16, startHr: 9, dur: 2, title: 'Patrol leader sync', sub: 'Hawks · Owls · Ravens', cat: 'leader' },
  ];

  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'grid', gridTemplateColumns: '260px 1fr' }}>
      <Sidebar p={p} T={T}/>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar with Week selected */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: `1px solid ${p.line}`, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Today</button>
            <h1 style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Mar 15 — 21, 2026</h1>
            <div style={{ fontSize: 12, color: p.inkMuted }}>Spring Campout weekend</div>
          </div>
          <div style={{ display: 'flex', background: p.bg, border: `1px solid ${p.line}`, borderRadius: 7, padding: 2, fontSize: 12 }}>
            {['Day', 'Week', 'Month', 'Schedule'].map((v, i) => (
              <div key={i} style={{
                padding: '5px 12px', borderRadius: 5,
                background: v === 'Week' ? '#fff' : 'transparent',
                color: v === 'Week' ? p.ink : p.inkSoft,
                fontWeight: v === 'Week' ? 600 : 500,
                boxShadow: v === 'Week' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>{v}</div>
            ))}
          </div>
        </div>

        {/* Week content */}
        <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderBottom: `1px solid ${p.line}` }}>
            <div/>
            {days.map((d, i) => (
              <div key={i} style={{ padding: '12px 14px', textAlign: 'center', borderLeft: `1px solid ${p.lineSoft}` }}>
                <div style={{ fontSize: 11, color: d.today ? p.ember : p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{d.dow}</div>
                <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: d.today ? p.ember : p.ink, marginTop: 2 }}>{d.d}</div>
              </div>
            ))}
          </div>

          {/* All-day strip — campout span */}
          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, borderBottom: `1px solid ${p.line}`, background: p.bg, minHeight: 44, position: 'relative' }}>
            <div style={{ padding: '10px 8px', fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>All-day</div>
            {days.map((_, i) => <div key={i} style={{ borderLeft: `1px solid ${p.lineSoft}` }}/>)}
            {/* Multi-day campout bar Fri 20 → Sat 21 (continues to Sun next week) */}
            <div style={{
              position: 'absolute',
              left: `calc(60px + 5 * ((100% - 60px) / 7) + 4px)`, // col 5 (Fri)
              width: `calc(2 * ((100% - 60px) / 7) - 8px)`,        // 2 days within this week
              top: 8, height: 26,
              background: p.ember, borderRadius: 6,
              padding: '4px 12px',
              color: '#fff', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: `0 2px 6px ${p.ember}55`,
            }}>
              🏕 Spring Campout · Tomahawk SR
              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, marginLeft: 'auto' }}>continues →</span>
            </div>
          </div>

          {/* Time grid */}
          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, position: 'relative' }}>
            {/* Hours column */}
            <div>
              {HOURS.map((h, i) => (
                <div key={i} style={{ height: HOUR_H, padding: '0 8px', textAlign: 'right', fontSize: 10, color: p.inkMuted, fontWeight: 600, fontFamily: T.mono, paddingTop: 4, borderTop: i ? `1px solid ${p.lineSoft}` : 'none' }}>
                  {h <= 12 ? h : h - 12}{h < 12 ? ' AM' : ' PM'}
                </div>
              ))}
            </div>
            {/* Day columns */}
            {days.map((d, di) => (
              <div key={di} style={{ position: 'relative', borderLeft: `1px solid ${p.lineSoft}` }}>
                {HOURS.map((h, hi) => (
                  <div key={hi} style={{ height: HOUR_H, borderTop: hi ? `1px solid ${p.lineSoft}` : 'none' }}/>
                ))}
                {/* Today line */}
                {d.today && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: (19 - 8) * HOUR_H + 14, borderTop: `2px solid ${p.ember}`, zIndex: 2 }}>
                    <div style={{ position: 'absolute', left: -5, top: -6, width: 10, height: 10, borderRadius: 5, background: p.ember }}/>
                  </div>
                )}
                {/* Events for this day */}
                {wkEvents.filter(e => e.day === d.d).map((e, ei) => {
                  if (e.spanDays) return null; // handled by all-day strip
                  const top = (e.startHr - 8) * HOUR_H + 2;
                  const h = e.dur * HOUR_H - 4;
                  const c = catColor(e.cat, p);
                  return (
                    <div key={ei} style={{
                      position: 'absolute', left: 4, right: 4, top, height: h,
                      background: c + '14', borderLeft: `3px solid ${c}`,
                      borderRadius: 6, padding: '6px 8px', overflow: 'hidden',
                    }}>
                      <div style={{ fontSize: 10, color: p.inkSoft, fontWeight: 600, fontFamily: T.mono }}>
                        {e.startHr <= 12 ? e.startHr : e.startHr - 12}:00{e.startHr < 12 ? 'a' : 'p'}
                      </div>
                      <div style={{ fontSize: 12, color: p.ink, fontWeight: 600, marginTop: 1 }}>{e.title}</div>
                      <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 1, lineHeight: 1.3 }}>{e.sub}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

window.DesktopCalendarMonth = DesktopCalendarMonth;
window.DesktopCalendarWeek = DesktopCalendarWeek;
