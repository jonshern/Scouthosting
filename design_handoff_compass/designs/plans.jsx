// Compass — Plans & Storage (DRAFT / open questions)
//
// This artboard isn't a finished pricing page. It's a *structured way to think
// about the open questions* before committing. The page itself is built like
// a working doc: every dollar amount is a `<TBD>` slot that the team can fill in
// after running the numbers.
//
// Two artboards:
//   1. Plans page — three tiers w/ open questions visible, AI tier marked TBD
//   2. Admin storage dashboard — to scope "how much do troops actually use?"

const PLN = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─── Artboard 1: Plans (public marketing) ────────────────────
const PlansPage = () => {
  const p = PLN.p(); const T = PLN.T();

  // TBD = price/limit not yet decided. Visible on the page so the team can see
  // the open questions instead of guessing at numbers.
  const TBD = ({ note }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', background: '#fef4e2', color: '#a8590a',
      borderRadius: 3, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
      verticalAlign: 'baseline', fontFamily: 'JetBrains Mono, monospace',
    }} title={note}>TBD{note ? ` · ${note}` : ''}</span>
  );

  const tiers = [
    {
      key: 'troop', name: 'Troop',
      tagline: 'The legacy alternative: $109/yr · 10 GB · +$25 to use your own domain. Compass: $99/yr · 15 GB · BYO domain at no markup.',
      priceNode: <span style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.9 }}>$99</span>,
      sub: <span>per year, flat — <strong>$10 less than the typical legacy host</strong>. Use your own domain at no markup. 60-day money-back guarantee.</span>,
      cta: 'Try Troop free for 30 days',
      ctaStyle: 'primary',
      popular: true,
      features: [
        ['Public troop site', 'Unlimited pages, all 8 themes'],
        ['Calendar & events', 'Unlimited'],
        ['People & messaging', 'Unlimited members, two-deep enforced'],
        ['Email digests', 'Weekly to families. Sent from your domain (scoutmaster@troop567.org), not ours.'],
        ['Photo storage', <><strong style={{ color: p.ink }}>15 GB included</strong> — <span style={{ color: p.ember, fontWeight: 600 }}>50% more than the typical legacy host</span>. Photos auto-resize on upload, so that's roughly 7,500 web-quality images. Overage $1.50/GB/yr.</>],
        ['Your URL', <>Out of the box: <strong style={{ color: p.ink }}>troop567.compass.app</strong>. Want your own domain like troop567.org? <strong style={{ color: p.ink }}>Bring it, we'll set it up free</strong>. You still pay your registrar ~$15/yr, same as anywhere.</>],
        ['Scoutbook sync', 'Roster + advancement, two-way'],
      ],
      notIncluded: ['AI auto-newsletter', 'AI section builder', 'AI photo curation'],
    },
    {
      key: 'plus', name: 'Troop + AI',
      tagline: 'Same plan, with Compass writing for you. Pricing not set yet.',
      priceNode: <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.9 }}>$99</span>
        <span style={{ fontSize: 18, opacity: 0.6 }}>+ </span>
        <TBD note="add-on"/>
      </div>,
      sub: <span><strong>Open question.</strong> See "Why this is hard to price" below — the answer depends on cost-per-troop and feature scope, neither of which we've nailed down.</span>,
      cta: 'Coming soon — get notified',
      ctaStyle: 'accent',
      features: [
        ['Everything in Troop', null, true],
        ['AI auto-newsletter (likely)', 'Drafts your Sunday digest from calendar/RSVP/photos. The killer feature.'],
        ['AI section builder (maybe)', '"Add a section showing our Eagles" → Compass builds it. Less critical.'],
        ['AI photo curation (maybe)', 'Surfaces the 12 best photos from each campout. Nice-to-have.'],
        ['AI parent replies (deferred)', 'Suggests replies in your voice. Cool but not v1.'],
        ['Extra photo storage', '+35 GB → 50 GB total'],
      ],
    },
    {
      key: 'council', name: 'Council',
      tagline: 'Multi-troop, district, or council deployments. Way later.',
      priceNode: <span style={{ fontFamily: T.display, fontSize: 36, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Custom · later</span>,
      sub: <span>Not v1. Comes after we have <strong>20+ paying troops</strong> and a council asks. The opportunity is real (volume + SSO + white-label) but it's a different sale.</span>,
      cta: 'Not yet',
      ctaStyle: 'ghost',
      disabled: true,
      features: [
        ['Everything in Troop + AI', null, true],
        ['Multi-troop admin', 'One council login across chartered units'],
        ['Pooled photo storage', '1 TB+ per council, burst-friendly'],
        ['SSO + white-label', 'Council brand, Okta/Google Workspace'],
        ['Migration service', 'We move them off legacy systems'],
      ],
    },
  ];

  const TierCard = ({ t }) => {
    const isPopular = t.popular;
    const isPlus = t.key === 'plus';
    const cardBg = isPlus ? p.surfaceDark : '#fff';
    const fg = isPlus ? '#fff' : p.ink;
    const fgSoft = isPlus ? 'rgba(255,255,255,0.75)' : p.inkSoft;
    const fgMuted = isPlus ? 'rgba(255,255,255,0.55)' : p.inkMuted;
    const lineCol = isPlus ? 'rgba(255,255,255,0.12)' : p.lineSoft;

    return (
      <div style={{
        background: cardBg, color: fg,
        border: isPopular ? `2px solid ${p.ember}` : `1px solid ${p.line}`,
        borderRadius: 14, padding: '28px 24px',
        position: 'relative', display: 'flex', flexDirection: 'column',
        boxShadow: isPopular ? `0 0 0 4px ${p.ember}1a, 0 12px 32px ${p.ember}1a` : 'none',
      }}>
        {isPopular && (
          <div style={{ position: 'absolute', top: -12, left: 24, padding: '4px 10px', background: p.ember, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 4 }}>
            Most troops pick this
          </div>
        )}
        <div style={{ fontSize: 12, color: fgMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.name}</div>
        <div style={{ fontFamily: T.display, fontSize: 19, fontStyle: 'italic', fontWeight: 500, color: fg, marginTop: 4, lineHeight: 1.3 }}>{t.tagline}</div>

        <div style={{ marginTop: 22 }}>{t.priceNode}</div>
        <div style={{ fontSize: 12, color: fgSoft, marginTop: 8, lineHeight: 1.5 }}>{t.sub}</div>

        <button style={{
          marginTop: 22,
          background: t.ctaStyle === 'primary' ? p.ink : t.ctaStyle === 'accent' ? p.ember : 'transparent',
          color: t.ctaStyle === 'ghost' ? fg : '#fff',
          border: t.ctaStyle === 'ghost' ? `1px solid ${isPlus ? 'rgba(255,255,255,0.25)' : p.line}` : 'none',
          padding: '11px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          opacity: t.disabled ? 0.45 : 1, cursor: t.disabled ? 'not-allowed' : 'pointer',
        }}>{t.cta}</button>

        <div style={{ borderTop: `1px solid ${lineCol}`, marginTop: 22, paddingTop: 18, flex: 1 }}>
          {t.features.map(([label, sub, inherit], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: sub ? 10 : 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isPlus ? p.ember : p.success} strokeWidth="3" style={{ flexShrink: 0, marginTop: 2 }}><path d="M5 12l4 4L19 7"/></svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: fg, fontWeight: inherit ? 600 : 500 }}>
                  {label}
                  {inherit && <span style={{ fontSize: 11, color: fgMuted, fontWeight: 500 }}> · all of it</span>}
                </div>
                {sub && <div style={{ fontSize: 11, color: fgSoft, marginTop: 1, lineHeight: 1.45 }}>{sub}</div>}
              </div>
            </div>
          ))}
          {t.notIncluded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${lineCol}` }}>
              {t.notIncluded.map((label, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={fgMuted} strokeWidth="2" style={{ flexShrink: 0 }}><path d="M6 6l12 12M6 18L18 6"/></svg>
                  <div style={{ fontSize: 12, color: fgMuted }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: 1440, height: 1700, background: p.bg, fontFamily: T.ui, color: p.ink }}>
      {/* Top banner — honest framing */}
      <div style={{ padding: '56px 80px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 12, color: p.ember, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Plans</div>
            <h1 style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, margin: '12px 0 0' }}>
              <em style={{ color: p.ember, fontStyle: 'italic' }}>$99 a year.</em><br/>
              <strong style={{ fontWeight: 500 }}>50% more storage</strong> for $10 less.
            </h1>
            <p style={{ fontSize: 16, color: p.inkSoft, lineHeight: 1.6, margin: '16px 0 0' }}>
              The typical legacy host: $109/yr · 10 GB · +$25/yr to host your own domain. Compass: $99/yr · 15 GB · BYO domain at no markup. (You still buy the domain at any registrar for ~$15/yr; that's universal.) The committee math takes about ten seconds. The AI add-on is a separate (still-open) question — see below.
            </p>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 14, padding: 22, width: 320, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>What's settled · what's open</div>
            {[
              { s: true, q: '$99/yr · undercuts TroopWebHost by $10' },
              { s: true, q: '15 GB photos · 50% more than their 10 GB' },
              { s: true, q: 'BYO domain at no markup (they charge +$25)' },
              { s: true, q: '60-day money-back guarantee' },
              { s: false, q: 'AI add-on price' },
              { s: false, q: 'Which AI features make v1' },
              { s: false, q: 'Free tier? (probably not for v1)' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                {row.s ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="3" style={{ flexShrink: 0, marginTop: 2 }}><path d="M5 12l4 4L19 7"/></svg>
                ) : (
                  <div style={{ width: 14, height: 14, borderRadius: 7, background: '#fef4e2', color: '#a8590a', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 }}>?</div>
                )}
                <div style={{ fontSize: 12, color: row.s ? p.ink : p.inkSoft, fontWeight: row.s ? 500 : 400, lineHeight: 1.5 }}>{row.q}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3 tiers */}
      <div style={{ padding: '0 80px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, alignItems: 'stretch' }}>
        {tiers.map((t) => <TierCard key={t.key} t={t}/>)}
      </div>

      {/* Storage — the answer + the math */}
      <div style={{ padding: '64px 80px 24px' }}>
        <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 14, padding: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 48, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Photo storage</div>
              <h2 style={{ fontFamily: T.display, fontSize: 38, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.015em', margin: '0 0 14px', lineHeight: 1.05 }}>
                15 GB. 50% more than the typical legacy host, at lower cost.
              </h2>
              <p style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.65, margin: 0 }}>
                <strong style={{ color: p.ink }}>15 GB included for $99/yr · $1.50/GB/yr overage.</strong> A 50-scout troop typically uses ~1–2 GB/yr after auto-resize — plenty of headroom for years. Photos auto-resize to web sizes on upload (full-res original kept 90 days, then dropped unless you click "keep"). We email at <strong style={{ color: p.ink }}>80% full</strong> two months ahead, and will <strong style={{ color: p.ink }}>never block uploads</strong>.
              </p>
              <div style={{ marginTop: 22, padding: 14, background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Need more?</div>
                <div style={{ fontSize: 13, color: p.ink, lineHeight: 1.5 }}>
                  <strong>$1.50/GB/year</strong>, billed once at renewal. Or upgrade to Troop + AI for +35 GB → 50 GB total.
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>What 15 GB actually means</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  {
                    name: 'Small troop', sub: '15 scouts · ~6 campouts/yr',
                    annual: '~0.4 GB / yr', headroom: '35+ yrs of history',
                    color: p.success,
                  },
                  {
                    name: 'Active troop', sub: '50 scouts · ~15 campouts/yr',
                    annual: '~1.5 GB / yr', headroom: '~10 yrs of history',
                    color: p.success,
                  },
                  {
                    name: 'Mega troop', sub: '120 scouts · 30+ events/yr',
                    annual: '~4 GB / yr', headroom: '~3 yrs — then add 35 GB',
                    color: p.ember,
                  },
                ].map((s, i) => (
                  <div key={i} style={{ background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.name}</div>
                    <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', color: p.ink, marginTop: 6 }}>{s.annual}</div>
                    <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{s.sub}</div>
                    <div style={{ fontSize: 12, color: s.color, fontWeight: 600, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${p.lineSoft}`, lineHeight: 1.4 }}>✓ {s.headroom}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: 14, background: p.surfaceDark + '08', border: `1px solid ${p.lineSoft}`, borderRadius: 8, fontSize: 12, lineHeight: 1.6, color: p.inkSoft }}>
                <strong style={{ color: p.ink }}>The math behind 15 GB:</strong> typical event = 30 photos × ~3 MB raw = 90 MB; auto-resize to web brings it to ~25 MB per event. A 50-scout troop at 15 events/yr uses ~400 MB/yr compressed. We sized 15 GB to be <strong>roughly 10–20 years of headroom for the average troop</strong> while keeping our cloud bill honest — not a marketing fantasy that bankrupts us at scale. Mega-troops upgrade to Troop + AI (50 GB total) or buy $1.50/GB add-ons.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI — the harder open question */}
      <div style={{ padding: '0 80px 24px' }}>
        <div style={{ background: p.surfaceDark, color: '#fff', border: `1px solid ${p.line}`, borderRadius: 14, padding: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 48, alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'rgba(254,244,226,0.15)', color: '#f5d878', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                Bigger open question
              </div>
              <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.015em', margin: '0 0 14px', lineHeight: 1.1 }}>
                What is the AI tier, exactly, and what does it cost?
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, margin: 0 }}>
                The AI tier is the most strategic and the most uncertain piece. We have a hunch about which features matter — but the actual scope, the cost-to-serve, and the parent willingness-to-pay are all unknown. Worth iterating on before committing.
              </p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, margin: '14px 0 0' }}>
                Even the <strong style={{ color: '#fff' }}>shape</strong> isn't settled: a flat add-on? Per-feature opt-in? Usage-based? Each has very different cost structure for us and parsability for parents.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Where to start</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { i: '01', t: 'Rank the AI features by leader value', d: 'Auto-newsletter is probably the only must-have. Photo curation, section builder, parent replies are nice-to-haves.' },
                  { i: '02', t: 'Estimate per-troop API cost', d: 'Newsletter once a week + reminders + occasional gen ≈ $1–$3/troop/yr. Photo curation could swing this 3– 5×.' },
                  { i: '03', t: 'Pick the pricing shape', d: 'Flat add-on (simple) vs. per-feature (parsable) vs. usage-based (fair). Strong opinion: flat add-on.' },
                  { i: '04', t: 'Validate with 5 leader interviews', d: 'Show the auto-newsletter prototype, ask: "Would you pay $X/year for this if it saved 80% of your Sunday?"' },
                ].map((row) => (
                  <div key={row.i} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f5d878', letterSpacing: '0.08em', marginBottom: 4 }}>{row.i}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{row.t}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 1.5 }}>{row.d}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: 12, background: 'rgba(232,149,86,0.15)', border: '1px solid rgba(232,149,86,0.3)', borderRadius: 8, fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>
                <strong style={{ color: '#fff' }}>Cheap experiment:</strong> launch the base $99 tier first. Build the auto-newsletter as a Compass-included feature for the first 50 troops, see how often they actually use it, then price the AI tier from real data.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ strip */}
      <div style={{ padding: '24px 80px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            { q: 'What if we outgrow Starter?', a: 'Upgrade in one click — your data, photos, and site come with you. No migration headache.' },
            { q: 'Can we turn AI off?', a: 'Yes. Plus AI is opt-in feature-by-feature. Turn off auto-newsletter, keep AI photo curation. We bill the same flat rate either way.' },
            { q: 'What about Scouts BSA / Cub Scouts / Venturing?', a: 'All chartered BSA programs supported. The roster pulls from Scoutbook, so it just works.' },
            { q: 'Is the data ours?', a: 'Yes. One-click export of everything (people, photos, calendar) as ZIP at any time. We never sell or share.' },
            { q: 'Discount for new troops?', a: '90 days free on Starter. New chartering troops get $50 off the first year of Troop.' },
            { q: 'What if we hate it?', a: 'Full refund within 60 days, no questions, no clawback of your data.' },
          ].map((f, i) => (
            <div key={i}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontStyle: 'italic', fontWeight: 500, color: p.ink, marginBottom: 6 }}>{f.q}</div>
              <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.6 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Artboard 2: Admin storage dashboard ─────────────────────
const StorageDashboard = () => {
  const p = PLN.p(); const T = PLN.T();

  return (
    <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'grid', gridTemplateColumns: '220px 1fr' }}>
      {/* Sidebar (matches admin) */}
      <div style={{ background: p.surfaceDark, color: '#fff', padding: 20, fontSize: 13, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <SHMark size={22} color="#fff" accent={p.ember}/>
          <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>Compass</div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Troop 567</div>
        {['Dashboard','People','Calendar','Newsletter','Photos','Finance','Settings · Storage'].map((l, i) => (
          <div key={i} style={{
            padding: '8px 12px', borderRadius: 8, marginLeft: -8, marginRight: -8,
            background: l.startsWith('Settings') ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: l.startsWith('Settings') ? '#fff' : 'rgba(255,255,255,0.65)',
            fontWeight: l.startsWith('Settings') ? 600 : 400,
          }}>{l}</div>
        ))}
      </div>

      {/* Main */}
      <div style={{ overflow: 'auto', padding: '28px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Settings · Storage & plan</div>
            <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '4px 0 0', color: p.ink }}>
              You're using <em style={{ color: p.ember, fontStyle: 'italic' }}>6.2 GB of 15</em>.
            </h1>
            <p style={{ fontSize: 14, color: p.inkSoft, margin: '6px 0 0' }}>Plenty of room for spring campouts. We'll email at 80%.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: '6px 12px', background: p.ember + '15', color: p.ember, borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Troop · $99/yr</div>
            <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Upgrade →</button>
          </div>
        </div>

        {/* Big visualisation */}
        <div style={{ marginTop: 24, background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Storage usage · 6.2 GB / 15 GB</div>
            <div style={{ fontSize: 12, color: p.inkSoft }}>8.8 GB free · ~4,400 more photos</div>
          </div>
          <div style={{ height: 38, background: p.bg, borderRadius: 4, overflow: 'hidden', display: 'flex', position: 'relative' }}>
            {[
              { l: 'Photos · 28 GB', w: 56, c: p.ember, light: '#fff' },
              { l: 'Documents · 3 GB', w: 6, c: p.accent, light: '#fff' },
              { l: 'Backups · 2 GB', w: 4, c: p.teal, light: '#fff' },
              { l: 'Other · 1 GB', w: 2, c: p.plum, light: '#fff' },
            ].map((b, i) => (
              <div key={i} style={{ width: `${b.w}%`, background: b.c, color: b.light, padding: '0 10px', display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600, borderRight: '1px solid rgba(255,255,255,0.3)' }}>
                {b.w > 6 ? b.l : ''}
              </div>
            ))}
            <div style={{ flex: 1, background: 'transparent' }}/>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 11, color: p.inkSoft }}>
            {[['Photos', p.ember, '28 GB'],['Documents', p.accent, '3 GB'],['Backups', p.teal, '2 GB'],['Other', p.plum, '1 GB']].map(([l, c, v], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                <span>{l}</span>
                <span style={{ color: p.inkMuted }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginTop: 20 }}>
          {/* Left — albums by size */}
          <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Largest albums</div>
                <div style={{ fontSize: 13, color: p.ink, fontWeight: 500, marginTop: 2 }}>Where your photo storage actually goes</div>
              </div>
              <button style={{ background: 'transparent', border: `1px solid ${p.line}`, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: p.ink }}>Bulk archive</button>
            </div>

            {[
              { n: 'Spring Camporee 2024', d: 'Mar 22–24, 2024 · 312 photos · 4.8 GB', c: p.ember, w: 100 },
              { n: 'Philmont 2023 Trek', d: 'Jul 15–28, 2023 · 419 photos · 4.2 GB', c: p.teal, w: 88 },
              { n: 'Court of Honor + recap', d: 'Apr 13, 2024 · 178 photos · 2.6 GB', c: p.plum, w: 54 },
              { n: 'Hartley Hike & misc', d: 'Mar 8, 2024 · 14 photos · 220 MB', c: p.accent, w: 5 },
              { n: 'Older / loose photos', d: '2018–2022 · 1,422 photos · 16 GB', c: p.inkMuted, w: 95, suggest: true },
            ].map((a, i) => (
              <div key={i} style={{ padding: '12px 0', borderTop: i ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: p.ink, fontWeight: 600 }}>{a.n}</div>
                  {a.suggest && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: p.ember + '15', color: p.ember, borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
                      Compass: archive to free 16 GB
                    </div>
                  )}
                </div>
                <div style={{ height: 4, background: p.bg, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${a.w}%`, height: '100%', background: a.c }}/>
                </div>
                <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 4 }}>{a.d}</div>
              </div>
            ))}
          </div>

          {/* Right — usage trend + plan & upgrade */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Trend · last 12 months</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 500, color: p.ink }}>+0.18 GB / mo</div>
                <div style={{ fontSize: 11, color: p.success, fontWeight: 600 }}>15 GB hits ≈20 years out</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
                {[12, 16, 20, 21, 23, 24, 26, 28, 29, 30, 32, 34].map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${(v / 50) * 100}%`, background: i === 11 ? p.ember : p.accent + '88', borderRadius: '2px 2px 0 0', position: 'relative' }}>
                    {i === 11 && <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: p.ember, fontWeight: 700, whiteSpace: 'nowrap' }}>{v} GB</div>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: p.inkMuted, marginTop: 4 }}>
                <span>APR</span><span>JUL</span><span>OCT</span><span>JAN</span><span>NOW</span>
              </div>
            </div>

            <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Your plan</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 500, color: p.ink }}>Troop</div>
                <div style={{ fontSize: 14, color: p.ink, fontWeight: 600 }}>$99 / yr</div>
              </div>
              <div style={{ fontSize: 12, color: p.inkSoft, marginTop: 4 }}>Renews Aug 14, 2025 · auto-pay on</div>

              <div style={{ marginTop: 16, padding: 14, background: p.ember + '0d', border: `1px solid ${p.ember}33`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.ember} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
                  <div>
                    <div style={{ fontSize: 12, color: p.ink, fontWeight: 600 }}>Try Troop + AI</div>
                    <div style={{ fontSize: 11, color: p.inkSoft, marginTop: 2, lineHeight: 1.5 }}>Auto-newsletter writes your Sunday digest. ~90 min saved each week. +35 GB storage → 50 GB total.</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button style={{ background: p.ember, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Try free for 30 days</button>
                      <button style={{ background: 'transparent', color: p.inkSoft, border: 'none', padding: '6px', fontSize: 11, fontWeight: 500 }}>Compare plans</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: p.bg, border: `1px dashed ${p.line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Add-on storage</div>
              <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.5 }}>$1.50/GB/yr. Add 10 GB for $15. We'll email at 80%, never auto-charge without confirming.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.PlansPage = PlansPage;
window.StorageDashboard = StorageDashboard;
