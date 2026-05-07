// COPPA under-13 denial screen — gentle, not a wall.
// Shown when a youth tries to self-register and enters a DOB < 13.
// Two artboards: desktop signup with the dialog, and the mobile equivalent.

const CoppaDenialDesktop = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1200, height: 820, background: p.surfaceAlt, fontFamily: T.ui, color: p.ink, position: 'relative', overflow: 'hidden' }}>
      <window.TopoBg color={p.primary} opacity={0.04}/>

      {/* faux signup form behind the modal — dimmed */}
      <div style={{ position: 'absolute', inset: 0, padding: '48px 80px', opacity: 0.35, filter: 'blur(0.5px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <window.SHMark size={28} color={p.primary}/>
          <window.SHWordmark color={p.ink} size={20}/>
        </div>
        <div style={{ maxWidth: 440 }}>
          <div style={{ fontFamily: T.display, fontSize: 40, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Create your scout account
          </div>
          <div style={{ fontSize: 14, color: p.inkSoft, marginBottom: 28 }}>
            Joining Troop 567 New Hope — invited by Mr. Patel.
          </div>
          {[
            { l: 'Your name', v: 'Alex Patel' },
            { l: 'Email', v: 'alex.patel@example.com' },
            { l: 'Date of birth', v: 'Mar 14, 2014' },
          ].map((f, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: p.inkMuted, fontWeight: 500, marginBottom: 6, letterSpacing: '0.02em' }}>{f.l}</div>
              <div style={{ background: p.bg, border: `1px solid ${p.line}`, borderRadius: 8, padding: '12px 14px', fontSize: 14 }}>{f.v}</div>
            </div>
          ))}
          <div style={{ background: p.primary, color: '#fff', borderRadius: 8, padding: '12px 18px', fontSize: 14, fontWeight: 500, display: 'inline-block', marginTop: 8 }}>Continue</div>
        </div>
      </div>

      {/* The dialog */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 520, background: p.bg, borderRadius: 16, boxShadow: '0 24px 60px rgba(20,30,25,0.18), 0 4px 12px rgba(20,30,25,0.06)', border: `1px solid ${p.line}`, overflow: 'hidden' }}>
        {/* warm header */}
        <div style={{ padding: '28px 32px 20px', background: p.surfaceAlt, borderBottom: `1px solid ${p.line}`, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: p.bg, border: `1.5px solid ${p.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.accent, fontSize: 20 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </div>
            <div style={{ fontSize: 11, color: p.accent, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>One more step</div>
          </div>
          <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: p.ink, margin: 0 }}>
            Your <span style={{ fontStyle: 'italic', color: p.accent }}>parent</span> needs to set this up with you.
          </div>
        </div>

        <div style={{ padding: '24px 32px 8px' }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: p.inkSoft, margin: '0 0 18px' }}>
            Federal law (COPPA) means we can&rsquo;t create accounts for scouts under 13 without a parent&rsquo;s help. Don&rsquo;t worry &mdash; you don&rsquo;t need an account to use Compass at your meetings. Most troops have just the parents log in.
          </p>

          <div style={{ background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 10, padding: '16px 18px', margin: '0 0 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: p.ink, marginBottom: 10 }}>What happens next</div>
            {[
              'Ask a parent to check their email — Mr. Patel already invited them.',
              'Your parent signs in and adds you to the troop roster.',
              'You\u2019ll show up on the calendar, in patrol lists, and in photo galleries.',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '6px 0', fontSize: 13.5, color: p.inkSoft, lineHeight: 1.5 }}>
                <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: p.bg, border: `1.5px solid ${p.accent}`, color: p.accent, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</div>
                <div>{s}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: p.inkMuted, margin: '0 0 24px' }}>
            On your 13th birthday, you can come back and create your own account. We&rsquo;ll remind your parent.
          </p>
        </div>

        <div style={{ padding: '0 32px 28px', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button style={{ background: 'transparent', border: 'none', color: p.inkSoft, fontSize: 13, fontWeight: 500, padding: '10px 14px', cursor: 'pointer', fontFamily: T.ui }}>I entered the wrong date</button>
          <button style={{ background: p.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontSize: 13.5, fontWeight: 500, fontFamily: T.ui }}>Email a reminder to my parent</button>
        </div>
      </div>
    </div>
  );
};

const CoppaDenialMobile = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 402, height: 874, background: p.bg, fontFamily: T.ui, color: p.ink, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* status bar */}
      <div style={{ height: 47, padding: '14px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11 }}>•••</span>
          <span style={{ width: 18, height: 11, borderRadius: 2, border: `1.2px solid ${p.ink}`, position: 'relative' }}>
            <span style={{ position: 'absolute', inset: 1, background: p.ink, borderRadius: 1 }}/>
          </span>
        </span>
      </div>

      {/* logo */}
      <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <window.SHMark size={22} color={p.primary}/>
        <window.SHWordmark color={p.ink} size={16}/>
      </div>

      <div style={{ padding: '28px 24px 20px', flex: 1 }}>
        {/* The friendly badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 999, fontSize: 11, color: p.accent, fontWeight: 700, marginBottom: 18, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, background: p.accent, borderRadius: '50%' }}/>
          One more step
        </div>

        <h1 style={{ fontFamily: T.display, fontSize: 34, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 14px' }}>
          Your <span style={{ fontStyle: 'italic', color: p.accent }}>parent</span> needs to set this up with you.
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.55, color: p.inkSoft, margin: '0 0 24px' }}>
          Federal law (COPPA) means we can&rsquo;t create accounts for scouts under 13 without a parent&rsquo;s help. Most troops have just the parents log in &mdash; you&rsquo;ll still show up everywhere on the troop site.
        </p>

        <div style={{ background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 12, padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: p.ink, marginBottom: 10 }}>What happens next</div>
          {[
            'Ask a parent to check their email.',
            'They sign in and add you to the troop roster.',
            'You show up on the calendar, in patrol lists, and in photo galleries.',
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '7px 0', fontSize: 13.5, color: p.inkSoft, lineHeight: 1.45 }}>
              <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: p.bg, border: `1.5px solid ${p.accent}`, color: p.accent, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</div>
              <div>{s}</div>
            </div>
          ))}
        </div>

        <div style={{ background: p.bg, border: `1px solid ${p.line}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: p.surfaceAlt, color: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: p.ink, lineHeight: 1.3 }}>Come back when you turn 13.</div>
            <div style={{ fontSize: 12, color: p.inkMuted, lineHeight: 1.4 }}>We&rsquo;ll remind your parent on your birthday.</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 20px 32px', borderTop: `1px solid ${p.line}`, background: p.bg }}>
        <button style={{ width: '100%', background: p.primary, color: '#fff', border: 'none', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 500, fontFamily: T.ui, marginBottom: 8 }}>
          Email a reminder to my parent
        </button>
        <button style={{ width: '100%', background: 'transparent', border: 'none', color: p.inkSoft, fontSize: 13.5, fontWeight: 500, padding: '10px', fontFamily: T.ui }}>
          I entered the wrong date
        </button>
      </div>
    </div>
  );
};

window.CoppaDenialDesktop = CoppaDenialDesktop;
window.CoppaDenialMobile = CoppaDenialMobile;
