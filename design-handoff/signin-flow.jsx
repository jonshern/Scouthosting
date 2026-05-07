// Sign-in → troop picker → in-app switcher.
// Three artboards: sign-in screen, picker (2 troops + 1 pending invite),
// and the top-nav popover for switching mid-session.

const SignInScreen = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{
      width: 1440, height: 900, background: p.bg, fontFamily: T.ui,
      color: p.ink, display: 'grid', gridTemplateColumns: '1fr 560px',
    }}>
      {/* Left — brand panel */}
      <div style={{
        background: p.surfaceDark || p.primary, color: '#fff',
        padding: '56px 64px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
      }}>
        <window.TopoBg color="#fff" opacity={0.05}/>
        <div style={{ position: 'relative' }}>
          <window.SHWordmark p={p} size={24} light/>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{
            fontFamily: T.display, fontSize: 56, lineHeight: 1.05,
            letterSpacing: '-0.02em', fontWeight: 400, marginBottom: 24,
            textWrap: 'balance', maxWidth: 540,
          }}>
            Welcome back.<br/>
            <span style={{ fontStyle: 'italic', color: p.accent }}>Pick up where the troop left off.</span>
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.55, opacity: 0.75, maxWidth: 460 }}>
            One sign-in covers every unit you serve. Compass remembers which troop you opened last and lands you there — switch any time from the top nav.
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', gap: 32, fontSize: 12, opacity: 0.6 }}>
          <div>SOC 2 Type II</div>
          <div>·</div>
          <div>COPPA-compliant</div>
          <div>·</div>
          <div>Hosted in US-East</div>
        </div>
      </div>

      {/* Right — auth card */}
      <div style={{ background: p.surface, padding: '56px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.015em', marginBottom: 8 }}>
          Sign in
        </div>
        <div style={{ fontSize: 14, color: p.inkMuted, marginBottom: 32 }}>
          New to Compass? <span style={{ color: p.accent, fontWeight: 500 }}>Ask your Scoutmaster for an invite →</span>
        </div>

        {/* Social */}
        <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
          <SsoButton p={p} provider="google" label="Continue with Google"/>
          <SsoButton p={p} provider="apple" label="Continue with Apple"/>
          <SsoButton p={p} provider="microsoft" label="Continue with Microsoft"/>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: p.inkMuted, fontSize: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: p.line }}/>
          <div>OR</div>
          <div style={{ flex: 1, height: 1, background: p.line }}/>
        </div>

        {/* Email */}
        <label style={{ fontSize: 12, fontWeight: 500, color: p.inkSoft, marginBottom: 6, display: 'block', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Email</label>
        <input
          defaultValue="sm.troop567@example.org"
          style={{
            width: '100%', padding: '12px 14px', fontSize: 15, fontFamily: T.ui,
            border: `1px solid ${p.line}`, borderRadius: 8, background: p.surface, color: p.ink,
            marginBottom: 16, boxSizing: 'border-box',
          }}/>
        <button style={{
          width: '100%', padding: '13px 14px', fontSize: 15, fontWeight: 500,
          background: p.primary, color: '#fff', border: 'none', borderRadius: 8,
          fontFamily: T.ui, cursor: 'pointer',
        }}>
          Email me a sign-in link
        </button>

        <div style={{ marginTop: 24, fontSize: 12, color: p.inkMuted, lineHeight: 1.5 }}>
          We'll send a one-time link. No password to remember. Add a passkey after sign-in for one-tap returns.
        </div>
      </div>
    </div>
  );
};

const SsoButton = ({ p, provider, label }) => {
  const icons = {
    google: (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"/>
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
      </svg>
    ),
    apple: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill={p.ink}>
        <path d="M14.94 13.57c-.27.62-.59 1.2-.97 1.73-.51.72-.93 1.22-1.26 1.5-.5.45-1.04.69-1.62.7-.41 0-.91-.12-1.49-.36-.58-.24-1.11-.36-1.6-.36-.51 0-1.06.12-1.65.36-.59.24-1.07.37-1.43.38-.55.02-1.1-.22-1.65-.72-.36-.31-.79-.83-1.32-1.57-.57-.79-1.04-1.71-1.41-2.76C.54 10.94.34 9.84.34 8.78c0-1.21.26-2.26.78-3.13.41-.71.96-1.27 1.65-1.68.69-.41 1.43-.62 2.23-.63.43 0 1.01.13 1.73.4.72.27 1.18.4 1.38.4.15 0 .66-.16 1.52-.47.81-.29 1.5-.41 2.07-.36 1.54.12 2.7.73 3.47 1.82-1.38.83-2.06 2-2.05 3.5.01 1.17.43 2.14 1.27 2.91.38.36.81.64 1.28.84-.1.3-.21.58-.33.86zM11.93 1.6c0 .9-.33 1.74-.99 2.52-.79.92-1.75 1.45-2.79 1.37-.01-.11-.02-.22-.02-.34 0-.86.38-1.78 1.04-2.55.33-.39.76-.71 1.27-.97.51-.25 1-.39 1.45-.42.01.13.04.26.04.39z"/>
      </svg>
    ),
    microsoft: (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect x="0" y="0" width="8.5" height="8.5" fill="#F25022"/>
        <rect x="9.5" y="0" width="8.5" height="8.5" fill="#7FBA00"/>
        <rect x="0" y="9.5" width="8.5" height="8.5" fill="#00A4EF"/>
        <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900"/>
      </svg>
    ),
  };
  return (
    <button style={{
      width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 500,
      background: p.surface, color: p.ink, border: `1px solid ${p.line}`,
      borderRadius: 8, fontFamily: window.SH_TYPE.ui, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
    }}>
      {icons[provider]}
      <span>{label}</span>
    </button>
  );
};

// — Troop picker —
const TroopPicker = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const accepted = [
    {
      name: 'Troop 567',
      council: 'Northern Star · New Hope, MN',
      role: 'Scoutmaster',
      members: 42,
      lastOpened: 'Last opened 3 hours ago',
      unread: 4,
      next: 'Camp Many Point · departs Fri 4:30 PM',
      color: p.primary,
      initials: '567',
    },
    {
      name: 'Pack 213',
      council: 'Northern Star · New Hope, MN',
      role: 'Committee Chair',
      members: 28,
      lastOpened: 'Last opened 6 days ago',
      unread: 0,
      next: 'Pinewood Derby · Sat Mar 9',
      color: p.accent,
      initials: '213',
    },
  ];
  const pending = [
    {
      name: 'Troop 891',
      council: 'Cherokee Area · Chattanooga, TN',
      invitedBy: 'Karen Folsom · Committee Chair',
      role: 'Asst Scoutmaster (proposed)',
      sent: 'Invited 2 days ago',
    },
  ];

  return (
    <div style={{
      width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Slim top bar */}
      <div style={{
        padding: '18px 40px', borderBottom: `1px solid ${p.line}`, background: p.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <window.SHWordmark p={p} size={18}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: p.inkMuted }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, background: p.accentSoft,
            color: p.accent, fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>JM</div>
          <div>James Morton</div>
          <div style={{ width: 1, height: 14, background: p.line }}/>
          <div style={{ cursor: 'pointer' }}>Sign out</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '64px 80px', maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: p.inkMuted, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
          Welcome back, James
        </div>
        <div style={{
          fontFamily: T.display, fontSize: 38, fontWeight: 400, letterSpacing: '-0.02em',
          lineHeight: 1.1, marginBottom: 8,
        }}>
          Which unit today?
        </div>
        <div style={{ fontSize: 15, color: p.inkMuted, marginBottom: 40, maxWidth: 580 }}>
          You serve two units. Pick one to open its dashboard — you can switch any time from the top nav.
        </div>

        {/* Accepted troops */}
        <div style={{
          fontSize: 11, fontWeight: 600, color: p.inkMuted, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          Your units
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 36 }}>
          {accepted.map(t => (
            <div key={t.name} style={{
              background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12,
              padding: 24, cursor: 'pointer', position: 'relative',
              transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 12, background: t.color,
                  color: '#fff', fontFamily: T.display, fontSize: 22, fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {t.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: T.display, fontSize: 22, fontWeight: 500,
                    letterSpacing: '-0.01em', marginBottom: 2,
                  }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 13, color: p.inkMuted }}>{t.council}</div>
                </div>
                {t.unread > 0 && (
                  <div style={{
                    background: p.accent, color: '#fff', fontSize: 11, fontWeight: 600,
                    padding: '4px 9px', borderRadius: 10, letterSpacing: '0.02em',
                  }}>
                    {t.unread} new
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: p.inkSoft, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: p.success }}/>
                  <span style={{ fontWeight: 500 }}>{t.role}</span>
                </div>
                <div>·</div>
                <div>{t.members} members</div>
                <div>·</div>
                <div>{t.lastOpened}</div>
              </div>

              <div style={{
                paddingTop: 14, borderTop: `1px dashed ${p.line}`, fontSize: 13,
                color: p.inkSoft, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: p.inkMuted, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Next up</span>
                <span>{t.next}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pending invites */}
        <div style={{
          fontSize: 11, fontWeight: 600, color: p.inkMuted, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          Pending invitations · 1
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {pending.map(t => (
            <div key={t.name} style={{
              background: p.surface, border: `1px dashed ${p.line}`, borderRadius: 12,
              padding: 20, display: 'flex', alignItems: 'center', gap: 20,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, border: `1px dashed ${p.line}`,
                color: p.inkMuted, fontFamily: T.display, fontSize: 16, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                ?
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, marginBottom: 2 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 13, color: p.inkMuted }}>
                  {t.council} · {t.role} · invited by {t.invitedBy}
                </div>
              </div>
              <div style={{ fontSize: 12, color: p.inkMuted }}>{t.sent}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  background: 'transparent', color: p.inkMuted, border: `1px solid ${p.line}`,
                  borderRadius: 6, fontFamily: T.ui, cursor: 'pointer',
                }}>Decline</button>
                <button style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  background: p.primary, color: '#fff', border: 'none',
                  borderRadius: 6, fontFamily: T.ui, cursor: 'pointer',
                }}>Accept</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${p.lineSoft}`, fontSize: 13, color: p.inkMuted, display: 'flex', gap: 24 }}>
          <div>Have a new invite code? <span style={{ color: p.accent, fontWeight: 500, cursor: 'pointer' }}>Enter it here →</span></div>
          <div>·</div>
          <div>Starting a brand-new unit? <span style={{ color: p.accent, fontWeight: 500, cursor: 'pointer' }}>Create a troop →</span></div>
        </div>
      </div>
    </div>
  );
};

// — In-app top-nav switcher popover —
const TroopSwitcherPopover = ({ palette: p }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ width: 1440, height: 600, background: p.bg, fontFamily: T.ui, color: p.ink, position: 'relative' }}>
      {/* Mock top nav of the admin app */}
      <div style={{
        background: p.surface, borderBottom: `1px solid ${p.line}`,
        display: 'flex', alignItems: 'center', height: 60, padding: '0 24px',
      }}>
        <window.SHWordmark p={p} size={18}/>
        <div style={{ width: 1, height: 28, background: p.line, margin: '0 20px' }}/>

        {/* Active troop chip — clicked open */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
          background: p.surfaceAlt, borderRadius: 8, fontSize: 14, fontWeight: 500,
          cursor: 'pointer', border: `1px solid ${p.line}`,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, background: p.primary, color: '#fff',
            fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>567</div>
          <span>Troop 567</span>
          <span style={{ color: p.inkMuted, fontSize: 12 }}>· Scoutmaster</span>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginLeft: 4 }}>
            <path d="M3 4.5 L6 7.5 L9 4.5" stroke={p.inkMuted} strokeWidth="1.5" fill="none"/>
          </svg>
        </div>

        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: p.inkMuted }}>
          <div>Calendar</div>
          <div>People</div>
          <div>Money</div>
          <div>Communication</div>
          <div style={{ width: 1, height: 20, background: p.line }}/>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: p.accentSoft, color: p.accent, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>JM</div>
        </div>
      </div>

      {/* Popover */}
      <div style={{
        position: 'absolute', top: 64, left: 220, width: 360,
        background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)',
        padding: 8, zIndex: 10,
      }}>
        <div style={{ padding: '8px 12px 6px', fontSize: 11, fontWeight: 600, color: p.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Switch unit
        </div>

        {/* Active row */}
        <div style={{
          padding: '10px 12px', borderRadius: 8, background: p.surfaceAlt,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: p.primary, color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>567</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Troop 567</div>
            <div style={{ fontSize: 12, color: p.inkMuted }}>Scoutmaster · current</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 7 L6 10 L11 4" stroke={p.success} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Other accepted */}
        <div style={{
          padding: '10px 12px', borderRadius: 8, marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>213</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Pack 213</div>
            <div style={{ fontSize: 12, color: p.inkMuted }}>Committee Chair · 28 members</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M4 2 L8 6 L4 10" stroke={p.inkMuted} strokeWidth="1.5" fill="none"/>
          </svg>
        </div>

        {/* Pending */}
        <div style={{ padding: '10px 12px 6px', fontSize: 11, fontWeight: 600, color: p.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
          Pending · 1
        </div>
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, border: `1px dashed ${p.line}`, color: p.inkMuted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Troop 891</div>
            <div style={{ fontSize: 12, color: p.inkMuted }}>Asst SM · invited 2d ago</div>
          </div>
          <button style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500, background: p.primary, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>Accept</button>
        </div>

        <div style={{ height: 1, background: p.lineSoft, margin: '6px 8px' }}/>
        <div style={{ padding: '8px 12px', fontSize: 13, color: p.accent, fontWeight: 500, cursor: 'pointer' }}>
          + Enter invite code
        </div>
        <div style={{ padding: '8px 12px', fontSize: 13, color: p.inkMuted, cursor: 'pointer' }}>
          Manage all units…
        </div>
      </div>

      {/* Faded backdrop content suggesting page underneath */}
      <div style={{ padding: '40px 40px', opacity: 0.4 }}>
        <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400 }}>Dashboard</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, height: 100 }}/>)}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SignInScreen, TroopPicker, TroopSwitcherPopover });
