// Compass mobile calendar — Outlook-style views
// Month grid + 3-month strip. Color-coded events by type, dot density per day.

const CAL = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// Events for March 2026 — keyed by day
const EVENTS_MAR_2026 = {
  4:  [{ c: 'accent', t: 'Troop Mtg' }],
  9:  [{ c: 'plum',   t: 'PLC' }],
  11: [{ c: 'accent', t: 'Troop Mtg' }],
  14: [{ c: 'teal',   t: 'Service · Park cleanup' }],
  18: [{ c: 'accent', t: 'Troop Mtg' }],
  21: [{ c: 'ember',  t: 'Spring Campout', start: true }, { c: 'ember', t: 'Spring Campout', span: true }, { c: 'ember', t: 'Spring Campout', end: true, dayOffset: 2 }],
  22: [{ c: 'ember',  t: 'Spring Campout', span: true }],
  23: [{ c: 'ember',  t: 'Spring Campout', end: true }],
  25: [{ c: 'accent', t: 'Troop Mtg' }],
  28: [{ c: 'raspberry', t: 'BoR · Eli' }],
};

// Just-day-numbers events for compactness
const EV = {
  '2026-02': { 2: 1, 9: 1, 16: 1, 23: 2 },
  '2026-03': { 4: 1, 9: 1, 11: 1, 14: 1, 18: 1, 21: 3, 22: 1, 23: 1, 25: 1, 28: 1 },
  '2026-04': { 1: 1, 4: 2, 8: 1, 12: 1, 15: 1, 22: 1, 26: 1, 29: 1 },
  '2026-05': { 4: 2, 6: 1, 13: 1, 17: 1, 20: 1, 24: 3, 25: 3, 26: 3, 27: 1 },
};

// ─────────────────────────────────────────────────────────────
// Month-view calendar control
// ─────────────────────────────────────────────────────────────
const MonthGrid = ({ month, year, today, selected, onSelect, p, T, compact = false }) => {
  // Compute first day-of-week and number of days
  const first = new Date(year, month, 1).getDay(); // 0 = Sun
  const days = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  // Leading
  for (let i = first - 1; i >= 0; i--) {
    cells.push({ d: prevDays - i, mute: true });
  }
  // Current
  for (let d = 1; d <= days; d++) cells.push({ d });
  // Trailing — fill to 42 (6 rows)
  while (cells.length < 42) cells.push({ d: cells.length - first - days + 1, mute: true });

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const evMap = EV[monthKey] || {};

  const cellSize = compact ? 36 : 44;
  const dotSize = compact ? 4 : 5;

  return (
    <div>
      {/* DOW header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: compact ? 4 : 6 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: compact ? 9 : 10, fontWeight: 700, color: p.inkMuted, letterSpacing: '0.04em' }}>{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
        {cells.map((c, i) => {
          const isToday = !c.mute && c.d === today;
          const isSelected = !c.mute && c.d === selected;
          const evCount = c.mute ? 0 : (evMap[c.d] || 0);
          return (
            <div key={i} style={{
              height: cellSize,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
              padding: compact ? '4px 0 2px' : '6px 0 4px',
              position: 'relative',
            }}>
              <div style={{
                width: compact ? 20 : 26, height: compact ? 20 : 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: compact ? 11 : 13,
                fontWeight: isToday || isSelected ? 700 : 500,
                color: isSelected ? '#fff' : isToday ? p.accent : c.mute ? p.lineSoft : p.ink,
                background: isSelected ? p.ink : isToday ? p.accent + '22' : 'transparent',
              }}>{c.d}</div>
              {/* event dots */}
              {evCount > 0 && (
                <div style={{ display: 'flex', gap: 2, marginTop: compact ? 1 : 3 }}>
                  {Array.from({ length: Math.min(evCount, 3) }).map((_, j) => (
                    <div key={j} style={{
                      width: dotSize, height: dotSize, borderRadius: '50%',
                      background: j === 0 ? p.accent : j === 1 ? p.ember : p.plum,
                    }}/>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// View-switcher segmented control
const ViewSwitch = ({ active, p }) => {
  const opts = [
    { id: 'day', l: 'Day' },
    { id: 'month', l: 'Month' },
    { id: '3mo', l: '3 mo' },
    { id: 'list', l: 'Agenda' },
  ];
  return (
    <div style={{ display: 'flex', background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8, padding: 2, gap: 0 }}>
      {opts.map((o, i) => (
        <div key={o.id} style={{
          flex: 1,
          padding: '6px 4px',
          fontSize: 11,
          fontWeight: 600,
          textAlign: 'center',
          color: active === o.id ? '#fff' : p.inkSoft,
          background: active === o.id ? p.ink : 'transparent',
          borderRadius: 6,
        }}>{o.l}</div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Calendar — MONTH view (Outlook-style)
// ─────────────────────────────────────────────────────────────
const MobileCalendarMonth = () => {
  const p = CAL.p(); const T = CAL.T();
  // Highlight events that fall on selected day (Mar 21, 2026 — campout start)
  const selectedDayEvents = [
    { c: p.ember, t: 'Spring Campout — Birch Lake', sub: 'Fri 5:30 PM (departs) · 2 nights · 18 going', kind: 'OUTING', mult: '3 days', primary: true },
    { c: p.ember, t: 'Permission slip + $35 due', sub: 'Auto-collected at gate if missed', kind: 'TASK' },
  ];
  return (
    <IOSDevice width={402} height={874} title="Compass · Calendar">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        {/* Header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${p.line}`, position: 'sticky', top: 0, background: p.bg, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Calendar</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 15, background: p.surface, border: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.ink} strokeWidth="2"><path d="M3 6h18M8 12h13M3 18h18"/><path d="M3 12h2M3 6v12" stroke="none"/></svg>
              </div>
              <div style={{ width: 30, height: 30, borderRadius: 15, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            </div>
          </div>
          {/* View switch */}
          <div style={{ marginBottom: 10 }}>
            <ViewSwitch active="month" p={p}/>
          </div>
          {/* Month nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', color: p.ink }}>March</div>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 400, color: p.inkMuted, fontStyle: 'italic' }}>2026</div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ width: 30, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </div>
              <div style={{ fontSize: 11, color: p.accent, fontWeight: 600, padding: '4px 8px' }}>Today</div>
              <div style={{ width: 30, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Month grid */}
        <div style={{ padding: '12px 16px 8px' }}>
          <MonthGrid month={2} year={2026} today={18} selected={21} p={p} T={T}/>
        </div>

        {/* Selected day */}
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink }}>Saturday, Mar 21</div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 500 }}>· 2 events</div>
          </div>
          {selectedDayEvents.map((e, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: 12,
              background: p.surface, border: `1px solid ${p.line}`,
              borderLeft: `3px solid ${e.c}`,
              borderRadius: 10, marginBottom: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: e.c + '22', color: e.c, borderRadius: 3, letterSpacing: '0.06em' }}>{e.kind}</div>
                  {e.mult && <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 500 }}>{e.mult}</div>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: p.ink, lineHeight: 1.3 }}>{e.t}</div>
                <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 3 }}>{e.sub}</div>
              </div>
              {e.primary && (
                <div style={{
                  alignSelf: 'center', flexShrink: 0,
                  padding: '6px 10px', background: p.accent, color: '#fff',
                  borderRadius: 8, fontSize: 11, fontWeight: 700,
                }}>RSVP'd</div>
              )}
            </div>
          ))}
        </div>

        <MobileTabBar active="cal" p={p}/>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Calendar — 3-MONTH view (rolling strip)
// ─────────────────────────────────────────────────────────────
const MobileCalendar3Mo = () => {
  const p = CAL.p(); const T = CAL.T();
  return (
    <IOSDevice width={402} height={874} title="Compass · Calendar">
      <div style={{ background: p.bg, minHeight: '100%', paddingBottom: 100, fontFamily: T.ui }}>
        {/* Header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${p.line}`, position: 'sticky', top: 0, background: p.bg, zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Calendar</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 15, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <ViewSwitch active="3mo" p={p}/>
          </div>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginLeft: -2, paddingLeft: 2 }}>
            {[
              { l: 'All', c: null, on: true },
              { l: 'My RSVPs', c: p.success, on: false },
              { l: 'Outings', c: p.ember, on: false },
              { l: 'Meetings', c: p.accent, on: false },
              { l: 'Service', c: p.teal, on: false },
            ].map((f, i) => (
              <div key={i} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: f.on ? p.ink : p.surface,
                color: f.on ? '#fff' : p.inkSoft,
                border: f.on ? 'none' : `1px solid ${p.line}`,
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {f.c && <div style={{ width: 6, height: 6, borderRadius: 3, background: f.c }}/>}
                {f.l}
              </div>
            ))}
          </div>
        </div>

        {/* 3 months stacked */}
        <div style={{ padding: '12px 16px 0' }}>
          {[
            { mi: 1, my: 2026, l: 'February 2026' },
            { mi: 2, my: 2026, l: 'March 2026', current: true },
            { mi: 3, my: 2026, l: 'April 2026' },
          ].map((m, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 500, color: m.current ? p.ink : p.inkSoft, letterSpacing: '-0.01em' }}>
                  {m.l}{m.current && <span style={{ fontSize: 10, color: p.accent, marginLeft: 8, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Current</span>}
                </div>
                <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 500 }}>
                  {m.mi === 1 ? '4 events' : m.mi === 2 ? '11 events' : '8 events'}
                </div>
              </div>
              <MonthGrid month={m.mi} year={m.my} today={m.current ? 18 : null} selected={m.current ? 21 : null} p={p} T={T} compact/>
            </div>
          ))}

          {/* Legend */}
          <div style={{ padding: '12px 0 4px', borderTop: `1px solid ${p.lineSoft}`, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 10, color: p.inkSoft }}>
            {[
              { c: p.accent, l: 'Meeting' },
              { c: p.ember, l: 'Outing' },
              { c: p.teal, l: 'Service' },
              { c: p.plum, l: 'PLC' },
              { c: p.raspberry, l: 'BoR' },
            ].map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: it.c }}/>
                {it.l}
              </div>
            ))}
          </div>
        </div>

        <MobileTabBar active="cal" p={p}/>
      </div>
    </IOSDevice>
  );
};

window.MobileCalendarMonth = MobileCalendarMonth;
window.MobileCalendar3Mo = MobileCalendar3Mo;
