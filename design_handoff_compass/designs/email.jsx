// Compass email — designed announcement template + leader composer
// Source content from a real Troop 567 email: May Merit Badge Weekend + Flag Placement Service.
// Goal: structured event blocks, RSVP from email, no Bcc dump, mobile-first.

const E = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─────────────────────────────────────────────────────────────
// Reusable: Compass-branded designed email (renders inside Gmail chrome)
// ─────────────────────────────────────────────────────────────
const CompassEmailBody = ({ p, T }) => (
  <div style={{
    background: '#fff',
    fontFamily: T.ui,
    color: p.ink,
    width: '100%',
    maxWidth: 640,
    margin: '0 auto',
  }}>
    {/* Brand strip */}
    <div style={{
      background: p.surfaceDark, color: '#fff',
      padding: '14px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SHMark size={26} color="#fff" accent={p.accent}/>
        <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>Compass</div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>
        Troop 567 · New Hope
      </div>
    </div>

    {/* Hero */}
    <div style={{ padding: '32px 28px 20px', borderBottom: `1px solid ${p.lineSoft}` }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 4,
        background: p.ember + '22', color: p.ember,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', marginBottom: 14,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: 3, background: p.ember }}/>
        Action needed · 2 sign-ups
      </div>
      <h1 style={{
        fontFamily: T.display, fontSize: 30, fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1,
        margin: '0 0 12px',
      }}>
        Two May events open for sign-up.
      </h1>
      <p style={{
        fontSize: 15, color: p.inkSoft, lineHeight: 1.55, margin: 0,
      }}>
        Hi Scouts and Families — we have two great opportunities coming up in May, and we need your sign-ups this week to finalize numbers. Tap the button on either event to RSVP in 30 seconds.
      </p>
    </div>

    {/* EVENT 1 — Camporee */}
    <div style={{ padding: '28px 28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: p.ember, textTransform: 'uppercase' }}>Event 01</div>
        <div style={{ flex: 1, height: 1, background: p.lineSoft }}/>
        <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', background: p.ember + '22', color: p.ember, borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>OUTING · 3 DAYS</div>
      </div>
      <h2 style={{
        fontFamily: T.display, fontSize: 22, fontWeight: 500,
        letterSpacing: '-0.015em', lineHeight: 1.2,
        margin: '0 0 4px',
      }}>
        Spring Camporee — Merit Badge Weekend
      </h2>
      <div style={{ fontSize: 13, color: p.inkSoft, fontStyle: 'italic', marginBottom: 16 }}>
        Earn 2–3 merit badges in a single weekend.
      </div>

      <div style={{
        background: p.bg, border: `1px solid ${p.line}`,
        borderRadius: 12, padding: 16, marginBottom: 14,
      }}>
        {[
          { l: 'When',  v: 'Fri May 15 — Sun May 17, 2026' },
          { l: 'Where', v: 'Tomahawk Scout Reservation, Rice Lake WI' },
          { l: 'Cost',  v: '$45 per scout (food, site, badges)' },
          { l: 'Bring', v: 'Class A + B, sleeping bag, mess kit, badge pamphlets' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 12, padding: '6px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
            <div style={{ fontSize: 10, color: p.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, paddingTop: 2 }}>{row.l}</div>
            <div style={{ fontSize: 13, color: p.ink, lineHeight: 1.45 }}>{row.v}</div>
          </div>
        ))}
      </div>

      {/* RSVP button + status */}
      <table cellPadding="0" cellSpacing="0" style={{ width: '100%', marginBottom: 8 }}>
        <tbody>
          <tr>
            <td>
              <a style={{
                display: 'inline-block', textDecoration: 'none',
                background: p.ink, color: '#fff', padding: '13px 22px',
                borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: T.ui,
              }}>RSVP & pay $45 →</a>
            </td>
            <td style={{ paddingLeft: 14, fontSize: 12, color: p.inkMuted }}>
              <span style={{ color: p.success, fontWeight: 600 }}>● 14 scouts signed up</span> · 10 spots left · closes May 8
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: p.inkMuted, lineHeight: 1.5 }}>
        Already RSVP'd? You'll see "Confirmed" instead. Need to update? <span style={{ color: p.accent, fontWeight: 500 }}>Manage your RSVP</span>.
      </div>
    </div>

    {/* Divider with mark */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 28px 0' }}>
      <div style={{ flex: 1, height: 1, background: p.lineSoft }}/>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: p.ember }}/>
      <div style={{ flex: 1, height: 1, background: p.lineSoft }}/>
    </div>

    {/* EVENT 2 — Flag Placement */}
    <div style={{ padding: '24px 28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: p.teal, textTransform: 'uppercase' }}>Event 02</div>
        <div style={{ flex: 1, height: 1, background: p.lineSoft }}/>
        <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', background: p.teal + '22', color: p.teal, borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>SERVICE · 2 HRS</div>
      </div>
      <h2 style={{
        fontFamily: T.display, fontSize: 22, fontWeight: 500,
        letterSpacing: '-0.015em', lineHeight: 1.2,
        margin: '0 0 4px',
      }}>
        Memorial Day Flag Placement
      </h2>
      <div style={{ fontSize: 13, color: p.inkSoft, fontStyle: 'italic', marginBottom: 16 }}>
        Honoring 16,000 veterans at Ft. Snelling. Counts as service hours.
      </div>

      <div style={{
        background: p.bg, border: `1px solid ${p.line}`,
        borderRadius: 12, padding: 16, marginBottom: 14,
      }}>
        {[
          { l: 'When',  v: 'Sat May 23, 2026 · 3:00 — 5:00 PM' },
          { l: 'Where', v: 'Ft. Snelling National Cemetery' },
          { l: 'Cost',  v: 'Free · counts as 2 service hours' },
          { l: 'Bring', v: 'Class A uniform, water bottle, sturdy shoes' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 12, padding: '6px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
            <div style={{ fontSize: 10, color: p.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, paddingTop: 2 }}>{row.l}</div>
            <div style={{ fontSize: 13, color: p.ink, lineHeight: 1.45 }}>{row.v}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55, margin: '0 0 16px' }}>
        We'll be joining the public to place American flags in front of 16,000 memorial stones. It's one of the most meaningful service events of the year and a powerful way for our scouts to give back.
      </p>

      <table cellPadding="0" cellSpacing="0" style={{ width: '100%', marginBottom: 8 }}>
        <tbody>
          <tr>
            <td>
              <a style={{
                display: 'inline-block', textDecoration: 'none',
                background: p.ink, color: '#fff', padding: '13px 22px',
                borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: T.ui,
              }}>I'll be there →</a>
            </td>
            <td style={{ paddingLeft: 14, fontSize: 12, color: p.inkMuted }}>
              <span style={{ color: p.success, fontWeight: 600 }}>● 22 confirmed</span> · open to all troop families
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* Sign-off */}
    <div style={{ padding: '32px 28px', borderTop: `1px solid ${p.lineSoft}`, marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>ES</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: p.ink }}>Eric Schulz</div>
          <div style={{ fontSize: 12, color: p.inkSoft }}>Scoutmaster · Troop 567 New Hope</div>
          <div style={{ fontSize: 12, color: p.accent, fontWeight: 500, marginTop: 4 }}>schulz.eric@gmail.com</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55, margin: '20px 0 0', fontStyle: 'italic' }}>
        Thanks — please sign up as soon as you can so we can finalize numbers.
      </p>
    </div>

    {/* Footer */}
    <div style={{ padding: '20px 28px 28px', background: p.bg, color: p.inkMuted, fontSize: 11, lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SHMark size={14} color={p.inkMuted} accent={p.ember}/>
        <span style={{ fontFamily: T.display, fontSize: 13, color: p.inkSoft }}>Sent via Compass</span>
        <span style={{ color: p.line }}>·</span>
        <span>compass.app/troop567</span>
      </div>
      <div style={{ marginBottom: 6 }}>
        Sent to <strong style={{ color: p.inkSoft }}>72 troop families</strong>. We don't show recipients to each other — your address stays private.
      </div>
      <div>
        <span style={{ color: p.accent, fontWeight: 500 }}>Manage notifications</span>
        <span style={{ margin: '0 6px', color: p.line }}>·</span>
        <span style={{ color: p.accent, fontWeight: 500 }}>View on Compass</span>
        <span style={{ margin: '0 6px', color: p.line }}>·</span>
        <span style={{ color: p.accent, fontWeight: 500 }}>Unsubscribe</span>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Artboard 1 — Gmail chrome rendering the Compass-designed email
// ─────────────────────────────────────────────────────────────
const EmailGmail = () => {
  const p = E.p(); const T = E.T();
  return (
    <div style={{ width: 1200, height: 1700, background: '#f6f8fc', fontFamily: T.ui, color: p.ink, position: 'relative', overflow: 'hidden' }}>
      {/* Gmail top bar */}
      <div style={{ height: 56, background: '#fff', borderBottom: '1px solid #e5e8ed', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        {/* Gmail logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="32" height="22" viewBox="0 0 32 22" style={{ display: 'block' }}>
            <path d="M0 4l16 12L32 4v16a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4z" fill="#fff"/>
            <path d="M0 4l16 12L32 4l-2-2-14 10L2 2z" fill="#ea4335"/>
            <path d="M30 2l2 2v16l-7-5z" fill="#fbbc04"/>
            <path d="M2 2L0 4v16l7-5z" fill="#34a853"/>
            <path d="M0 20a2 2 0 0 0 2 2h5l-7-5z M30 22a2 2 0 0 0 2-2l-7 3z" fill="#4285f4" opacity="0.8"/>
          </svg>
          <span style={{ fontSize: 22, color: '#5f6368', fontFamily: 'system-ui', fontWeight: 400 }}>Gmail</span>
        </div>
        <div style={{ flex: 1, maxWidth: 720, marginLeft: 60 }}>
          <div style={{ background: '#eaf1fb', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#5f6368', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            Search mail
          </div>
        </div>
      </div>

      {/* Gmail layout */}
      <div style={{ display: 'flex', height: 'calc(100% - 56px)' }}>
        {/* Sidebar */}
        <div style={{ width: 200, background: '#f6f8fc', padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ background: '#c2e7ff', color: '#001d35', padding: '14px 22px', borderRadius: 16, display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#001d35"><path d="M22 4L12 14M22 4l-7 16-3-7-7-3z"/></svg>
            Compose
          </div>
          <div style={{ marginTop: 18, fontSize: 13, color: '#202124' }}>
            {[
              { l: 'Inbox', n: 416, active: true },
              { l: 'Starred', n: null },
              { l: 'Snoozed', n: null },
              { l: 'Sent', n: null },
              { l: 'Drafts', n: 383 },
              { l: 'All Mail', n: null },
            ].map((it, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 0,
                background: it.active ? '#d3e3fd' : 'transparent',
                color: it.active ? '#001d35' : '#202124',
                display: 'flex', justifyContent: 'space-between',
                fontWeight: it.active ? 700 : 400, marginLeft: -12, marginRight: -12, paddingLeft: 26,
                borderTopRightRadius: 16, borderBottomRightRadius: 16,
              }}>
                <span>{it.l}</span>
                {it.n && <span style={{ fontSize: 12 }}>{it.n}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Email pane */}
        <div style={{ flex: 1, background: '#fff', borderRadius: '16px 0 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Email toolbar */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e8ed', display: 'flex', alignItems: 'center', gap: 4 }}>
            {['arrow-left', 'archive', 'trash', 'unread'].map((ic, i) => (
              <div key={i} style={{ width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 16, height: 16, background: '#5f6368', borderRadius: 2, opacity: 0.5 }}/>
              </div>
            ))}
          </div>

          {/* Subject + sender */}
          <div style={{ padding: '24px 64px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <h1 style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 400, color: '#202124', margin: 0, lineHeight: 1.3 }}>
                Sign up: Spring Camporee &amp; Memorial Day Flag Placement
              </h1>
              <div style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 12, color: '#1f1f1f',
                background: '#fce8b2', flexShrink: 0, fontWeight: 500,
              }}>Action needed</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>ES</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#202124' }}>
                  <strong>Troop 567 — Eric Schulz</strong> <span style={{ color: '#5f6368' }}>&lt;troop@compass.app&gt;</span>
                </div>
                <div style={{ fontSize: 12, color: '#5f6368' }}>to me · via Compass</div>
              </div>
              <div style={{ fontSize: 12, color: '#5f6368' }}>Wed, Apr 29, 12:20 PM</div>
            </div>
          </div>

          {/* Designed email body */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '0 32px 40px', background: '#f6f8fc' }}>
            <div style={{
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.04)',
              maxWidth: 700, margin: '0 auto',
            }}>
              <CompassEmailBody p={p} T={T}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Artboard 2 — Mobile preview of the same email (in iOS Mail)
// ─────────────────────────────────────────────────────────────
const EmailMobile = () => {
  const p = E.p(); const T = E.T();
  return (
    <IOSDevice width={402} height={874} title="Mail · Inbox">
      <div style={{ background: '#f2f2f7', minHeight: '100%', fontFamily: T.ui }}>
        {/* iOS Mail header */}
        <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f2f2f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 17, color: '#007aff' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            Inbox
          </div>
          <div style={{ display: 'flex', gap: 16, color: '#007aff' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6 6-6-6M12 21V3"/></svg>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h6l3-9 6 18 3-9h3"/></svg>
          </div>
        </div>

        {/* Email body — full Compass design renders fine on mobile */}
        <div style={{ background: '#fff', minHeight: 800 }}>
          {/* Subject bar */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5ea' }}>
            <h1 style={{ fontSize: 19, fontWeight: 600, color: '#000', margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
              Sign up: Spring Camporee &amp; Memorial Day Flag Placement
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>ES</div>
              <div style={{ flex: 1, fontSize: 13 }}>
                <div style={{ color: '#000' }}><strong>Eric Schulz</strong> · Troop 567</div>
                <div style={{ color: '#8e8e93', fontSize: 12 }}>to me · 2 days ago</div>
              </div>
              <div style={{ padding: '3px 8px', background: p.ember + '22', color: p.ember, fontSize: 10, fontWeight: 700, borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Action</div>
            </div>
          </div>

          {/* Email content — narrower, no Gmail wrapper */}
          <div style={{ background: '#fff' }}>
            <CompassEmailBody p={p} T={T}/>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

// ─────────────────────────────────────────────────────────────
// Artboard 3 — Compass email composer (what the leader sees while writing)
// ─────────────────────────────────────────────────────────────
const EmailComposer = () => {
  const p = E.p(); const T = E.T();
  return (
    <div style={{ width: 1200, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'grid', gridTemplateColumns: '220px 1fr 320px' }}>
      {/* Left rail (admin nav) */}
      <div style={{ background: p.surfaceDark, color: '#fff', padding: 20, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <SHMark size={22} color="#fff" accent={p.accent}/>
          <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>Compass</div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Troop 567</div>
        {[
          { l: 'Dashboard', i: 'M3 12l2-2 7-7 7 7 2 2v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z' },
          { l: 'People', i: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
          { l: 'Calendar', i: 'M7 3v2M17 3v2M4 8h16 M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
          { l: 'Email', i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z', active: true },
          { l: 'Photos', i: 'M3 7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z' },
          { l: 'Finance', i: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
        ].map((it, i) => (
          <div key={i} style={{
            padding: '8px 12px', borderRadius: 8, marginLeft: -8, marginRight: -8,
            background: it.active ? 'rgba(255,255,255,0.08)' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 10,
            color: it.active ? '#fff' : 'rgba(255,255,255,0.65)',
            fontWeight: it.active ? 600 : 400,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={it.i}/></svg>
            {it.l}
          </div>
        ))}
      </div>

      {/* Center — composer */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${p.line}` }}>
        {/* Header */}
        <div style={{ padding: '16px 28px', borderBottom: `1px solid ${p.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Email · Draft</div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', marginTop: 2 }}>New announcement</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: p.inkSoft }}>Save draft</button>
            <button style={{ background: p.surface, border: `1px solid ${p.line}`, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: p.ink }}>Preview</button>
            <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Schedule send →</button>
          </div>
        </div>

        {/* Compose fields */}
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${p.line}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>To</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {['All troop families', 'Adult leaders'].map((g, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: p.accent + '18', color: p.accent, borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                  {g}
                </div>
              ))}
              <div style={{ fontSize: 11, color: p.inkMuted, marginLeft: 4 }}>72 recipients · privacy: each gets a personal copy (no Bcc list)</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Subject</div>
            <div style={{ fontSize: 14, color: p.ink, fontWeight: 500 }}>Sign up: Spring Camporee & Memorial Day Flag Placement</div>
          </div>
        </div>

        {/* Block-builder body */}
        <div style={{ flex: 1, padding: '20px 28px', overflow: 'auto', background: p.bg }}>
          <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Block · Heading</div>
            <div style={{ fontFamily: T.display, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Two May events open for sign-up.</div>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Block · Paragraph</div>
            <div style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.6 }}>
              Hi Scouts and Families — we have two great opportunities coming up in May, and we need your sign-ups this week to finalize numbers. Tap the button on either event to RSVP in 30 seconds.
            </div>
          </div>

          {/* Event block — pulls from calendar */}
          <div style={{ background: '#fff', border: `1.5px solid ${p.ember}`, borderRadius: 12, padding: 20, marginBottom: 12, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, color: p.ember, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Block · Event card</div>
                <div style={{ fontSize: 10, color: p.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: p.success }}/>
                  Linked to calendar · auto-syncs RSVPs
                </div>
              </div>
              <div style={{ fontSize: 11, color: p.accent, fontWeight: 600 }}>Edit event →</div>
            </div>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>Spring Camporee — Merit Badge Weekend</div>
            <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 2 }}>May 15–17, 2026 · Tomahawk SR · $45/scout</div>
            <div style={{ marginTop: 10, padding: 10, background: p.bg, borderRadius: 8, fontSize: 11, color: p.inkMuted, display: 'flex', gap: 16 }}>
              <span>📅 Auto-included date/where/cost</span>
              <span>🔘 RSVP button</span>
              <span>💳 Payment built in</span>
            </div>
          </div>

          <div style={{ background: '#fff', border: `1.5px solid ${p.teal}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: p.teal, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Block · Event card</div>
              <div style={{ fontSize: 11, color: p.accent, fontWeight: 600 }}>Edit event →</div>
            </div>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>Memorial Day Flag Placement</div>
            <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 2 }}>Sat May 23, 3–5 PM · Ft. Snelling · service hours</div>
          </div>

          {/* Add block */}
          <div style={{ border: `1.5px dashed ${p.line}`, borderRadius: 12, padding: 14, textAlign: 'center', color: p.inkMuted, fontSize: 13, fontWeight: 500 }}>
            + Add block — heading, paragraph, event, photo album, payment, divider, or sign-off
          </div>
        </div>
      </div>

      {/* Right rail — settings & checks */}
      <div style={{ padding: 20, background: p.surface, borderLeft: `1px solid ${p.line}`, fontSize: 13, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>Send checks</div>
        {[
          { ok: true, l: 'Recipients privacy', sub: 'Each family gets a personal copy. No Bcc list visible.' },
          { ok: true, l: 'Mobile-readable', sub: 'Body fits 402px without zoom.' },
          { ok: true, l: 'Subject under 60 chars', sub: '57 / 60 — fits in iOS Mail preview' },
          { ok: false, warn: true, l: 'Adds to spam triggers', sub: 'No emojis in subject. ✓' },
          { ok: true, l: 'Unsubscribe link', sub: 'Auto-included per CAN-SPAM' },
          { ok: false, warn: true, l: 'Schedule for 7 PM CT', sub: 'Best open rate window. Shift +6h.' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: i < 5 ? `1px solid ${p.lineSoft}` : 'none', display: 'flex', gap: 10 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9, flexShrink: 0,
              background: c.ok ? p.success + '22' : p.ember + '22',
              color: c.ok ? p.success : p.ember,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                {c.ok ? <path d="M5 12l5 5L20 7"/> : <path d="M12 8v4M12 16h.01"/>}
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.ink }}>{c.l}</div>
              <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2, lineHeight: 1.4 }}>{c.sub}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 24, padding: 12, background: p.bg, border: `1px solid ${p.line}`, borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Schedule</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>Wed, Apr 29 · 7:00 PM CT</div>
          <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>2 days from now · best open rate</div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Predicted</div>
          {[
            { l: 'Open rate', v: '76%', sub: 'Troop avg over last 6 months' },
            { l: 'RSVP-from-email', v: '54%', sub: 'Up from 12% on TroopWebHost' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: p.ink, fontWeight: 500 }}>{s.l}</div>
                <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              </div>
              <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

window.EmailGmail = EmailGmail;
window.EmailMobile = EmailMobile;
window.EmailComposer = EmailComposer;
