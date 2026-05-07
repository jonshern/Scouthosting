// Coming-soon / waitlist page with invite-code unlock.
// Two artboards: public coming-soon (waitlist + invite code), and the
// "code accepted → welcome" success state.

const ComingSoon = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{
      width: 1440, height: 900, background: p.surfaceDark || p.primary,
      color: '#fff', fontFamily: T.ui, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <window.TopoBg color="#fff" opacity={0.04}/>

      {/* Header */}
      <div style={{
        padding: '28px 56px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'relative', zIndex: 2,
      }}>
        <window.SHWordmark p={p} size={20} light/>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Private beta · Spring 2026
        </div>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1fr 480px',
        gap: 80, padding: '40px 80px 80px', alignItems: 'center', position: 'relative', zIndex: 2,
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999,
            fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 28,
            letterSpacing: '0.04em',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: p.accent }}/>
            Building with 14 troops in private beta
          </div>

          <div style={{
            fontFamily: T.display, fontSize: 84, lineHeight: 0.98,
            letterSpacing: '-0.03em', fontWeight: 400, marginBottom: 28,
            textWrap: 'balance',
          }}>
            One place for your <span style={{ fontStyle: 'italic', color: p.accent }}>whole troop.</span>
          </div>

          <div style={{
            fontSize: 19, lineHeight: 1.5, color: 'rgba(255,255,255,0.75)',
            maxWidth: 560, marginBottom: 40,
          }}>
            Compass replaces the patchwork of group texts, shared spreadsheets, PayPal links, and aging websites that volunteer Scoutmasters keep alive on weekends. Calendar, dues, comms, public site — one tool, built for units, hosted in the US, COPPA-compliant.
          </div>

          <div style={{ display: 'flex', gap: 32, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            <div>
              <div style={{ fontFamily: T.display, fontSize: 28, color: '#fff', fontWeight: 400, letterSpacing: '-0.01em' }}>14</div>
              <div>Troops onboarded</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }}/>
            <div>
              <div style={{ fontFamily: T.display, fontSize: 28, color: '#fff', fontWeight: 400, letterSpacing: '-0.01em' }}>612</div>
              <div>Scouts in the system</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }}/>
            <div>
              <div style={{ fontFamily: T.display, fontSize: 28, color: '#fff', fontWeight: 400, letterSpacing: '-0.01em' }}>$0</div>
              <div>For your first year</div>
            </div>
          </div>
        </div>

        {/* Right card — invite code OR waitlist */}
        <div style={{
          background: '#fff', color: p.ink, borderRadius: 16, padding: 36,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 400, letterSpacing: '-0.015em', marginBottom: 4 }}>
            Have an invite code?
          </div>
          <div style={{ fontSize: 14, color: p.inkMuted, marginBottom: 24, lineHeight: 1.5 }}>
            Scoutmasters in the beta got 5 codes to share. Drop one here to skip the waitlist.
          </div>

          {/* Code field — segmented like a one-time code */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {['T', 'R', 'O', 'O', 'P'].map((c, i) => (
              <div key={i} style={{
                flex: 1, aspectRatio: '1', border: `1.5px solid ${i < 3 ? p.primary : p.line}`,
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: T.mono, fontSize: 22, fontWeight: 500,
                color: i < 3 ? p.ink : p.inkMuted,
                background: i < 3 ? p.surface : p.surfaceAlt,
              }}>
                {i < 3 ? c : ''}
              </div>
            ))}
            <div style={{ width: 8, alignSelf: 'center', textAlign: 'center', color: p.inkMuted }}>—</div>
            {['5', '6', '7'].map((c, i) => (
              <div key={i} style={{
                flex: 1, aspectRatio: '1', border: `1.5px solid ${p.line}`,
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: T.mono, fontSize: 22, fontWeight: 500,
                color: p.inkMuted, background: p.surfaceAlt,
              }}>
                {''}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: p.inkMuted, marginBottom: 24 }}>
            Format: <span style={{ fontFamily: T.mono }}>XXXXX-XXX</span> · case-insensitive
          </div>

          <button style={{
            width: '100%', padding: '14px 16px', fontSize: 15, fontWeight: 500,
            background: p.primary, color: '#fff', border: 'none', borderRadius: 8,
            fontFamily: T.ui, cursor: 'pointer', marginBottom: 20,
          }}>
            Unlock my troop
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: p.inkMuted, fontSize: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: p.line }}/>
            <div>NO CODE?</div>
            <div style={{ flex: 1, height: 1, background: p.line }}/>
          </div>

          {/* Waitlist */}
          <label style={{ fontSize: 12, fontWeight: 500, color: p.inkSoft, marginBottom: 6, display: 'block', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Join the waitlist</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="you@troop567.org"
              style={{
                flex: 1, padding: '11px 13px', fontSize: 14, fontFamily: T.ui,
                border: `1px solid ${p.line}`, borderRadius: 7, background: p.surface, color: p.ink,
                boxSizing: 'border-box',
              }}/>
            <button style={{
              padding: '11px 16px', fontSize: 14, fontWeight: 500,
              background: p.surface, color: p.ink, border: `1px solid ${p.ink}`,
              borderRadius: 7, fontFamily: T.ui, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Notify me
            </button>
          </div>
          <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 10 }}>
            We'll email when your council opens up. No marketing, ever.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '24px 56px', borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', fontSize: 12,
        color: 'rgba(255,255,255,0.5)', position: 'relative', zIndex: 2,
      }}>
        <div>© 2026 Compass · Built by volunteers, for volunteers</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>Security</div>
          <div>Privacy</div>
          <div>COPPA</div>
          <div>hello@compass.scout</div>
        </div>
      </div>
    </div>
  );
};

// Code accepted → welcome / next step
const CodeAccepted = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{
      width: 1440, height: 900, background: p.bg, color: p.ink,
      fontFamily: T.ui, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '24px 48px', borderBottom: `1px solid ${p.line}`, background: p.surface }}>
        <window.SHWordmark p={p} size={18}/>
      </div>

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 48,
      }}>
        <div style={{
          width: 640, background: p.surface, border: `1px solid ${p.line}`,
          borderRadius: 16, padding: 48, textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32, margin: '0 auto 24px',
            background: p.success, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32">
              <path d="M8 17 L13 22 L24 10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: p.success, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Code accepted
          </div>
          <div style={{
            fontFamily: T.display, fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em',
            lineHeight: 1.1, marginBottom: 12,
          }}>
            Welcome to <span style={{ fontStyle: 'italic', color: p.accent }}>Troop 567</span>.
          </div>
          <div style={{ fontSize: 15, color: p.inkMuted, lineHeight: 1.55, marginBottom: 32, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Karen Folsom invited you as <strong style={{ color: p.ink, fontWeight: 500 }}>Assistant Scoutmaster</strong>. We'll get you signed in next, then drop you straight into Troop 567's dashboard.
          </div>

          <div style={{
            background: p.surfaceAlt, border: `1px solid ${p.lineSoft}`, borderRadius: 10,
            padding: 16, marginBottom: 24, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: p.primary, color: '#fff',
              fontFamily: T.display, fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>567</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Troop 567 · New Hope, MN</div>
              <div style={{ fontSize: 12, color: p.inkMuted }}>Northern Star Council · 42 members · 18 events on the calendar</div>
            </div>
          </div>

          <button style={{
            width: '100%', padding: '14px 16px', fontSize: 15, fontWeight: 500,
            background: p.primary, color: '#fff', border: 'none', borderRadius: 8,
            fontFamily: T.ui, cursor: 'pointer', marginBottom: 12,
          }}>
            Continue — sign in with Google
          </button>
          <div style={{ fontSize: 12, color: p.inkMuted }}>
            Already have an account? <span style={{ color: p.accent, fontWeight: 500 }}>Sign in instead →</span>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ComingSoon, CodeAccepted });
