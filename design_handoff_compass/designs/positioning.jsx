// Compass — "No commodity markups" positioning artboard
//
// Single landing-page-style artboard that lays out the positioning principle:
// commodity infrastructure (DNS, storage, email, payments) is cheap. Charging
// big margins on it is a SaaS trick. We pass it through at cost, charge for
// software. This is both honest and competitively sharp.

const POS = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

const NoMarkupsPage = () => {
  const p = POS.p(); const T = POS.T();

  // Each row: commodity, real underlying cost, what TWH (or typical) charges,
  // what Compass charges, the takeaway.
  const rows = [
    {
      item: 'Custom domain hosting',
      what: 'Routing your troop567.org to our servers — one DNS record on your end, one row in our DB, an auto-renewing TLS cert.',
      cost: '~2¢ / yr',
      costNote: 'Let\'s Encrypt + a few CPU cycles',
      twh: '+$25 / yr',
      twhNote: 'On top of your registrar fee',
      us: '$0',
      usNote: 'BYO domain, we configure it free',
      math: 'Markup factor: ~1,250×',
    },
    {
      item: 'Photo storage',
      what: 'Object storage for compressed, web-resized photos. Auto-resize on upload keeps file sizes in check.',
      cost: '~$0.28 / GB / yr',
      costNote: 'S3-class storage at scale',
      twh: '$1 / GB / yr',
      twhNote: '10 GB included, then meter',
      us: '$1.50 / GB / yr',
      usNote: '15 GB included, transparent overage',
      math: 'Their markup ~3.5× cost · ours ~5×, but starts at 50% more headroom and we say so',
    },
    {
      item: 'Email from your own domain',
      what: 'The digest, RSVP confirms, password resets sent from scoutmaster@troop567.org — properly authenticated (SPF/DKIM/DMARC aligned to your domain), so it lands in inboxes and looks like it comes from your troop, not from us.',
      cost: '~$9 / yr / troop',
      costNote: 'Postmark, ~600 emails/mo on a 50-scout troop',
      twh: 'Sent from a shared domain',
      twhNote: 'Their domain, not yours — shared sender reputation, looks third-party in the inbox',
      us: '$0 extra',
      usNote: 'Add 3 DNS records, we handle the rest. Email actually comes from your troop.',
      math: 'Architecturally hard for shared-tenant systems to do — every troop on one sending domain is the design, not a setting.',
    },
    {
      item: 'Payment processing',
      what: 'Collecting dues, trip fees, fundraising via Stripe.',
      cost: '2.9% + 30¢',
      costNote: 'Stripe\'s actual rate',
      twh: 'Adds platform fee on top',
      twhNote: 'Often 1–2% over Stripe',
      us: '2.9% + 30¢ — at cost',
      usNote: 'We pass Stripe through. No markup.',
      math: 'On a $50,000 / yr troop budget, our pass-through saves ~$500–$1,000 vs typical platform fees',
    },
    {
      item: 'Bandwidth / hosting',
      what: 'Serving the public troop site, admin dashboard, mobile app.',
      cost: '~$1–3 / troop / yr',
      costNote: 'CDN + compute on Cloudflare/Render',
      twh: 'Bundled in $109 base',
      twhNote: 'Fine — but the base is what funds the markups above',
      us: 'Bundled in $99 base',
      usNote: 'Same — but our base is $10 less',
      math: 'Hosting itself is genuinely cheap. Always has been.',
    },
  ];

  return (
    <div style={{ width: 1440, height: 1900, background: p.bg, fontFamily: T.ui, color: p.ink }}>
      {/* Hero */}
      <div style={{ padding: '64px 80px 32px', borderBottom: `1px solid ${p.lineSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 12, color: p.ember, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>How we price</div>
            <h1 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.02, margin: '14px 0 0' }}>
              We charge you for <em style={{ fontStyle: 'italic', color: p.ember }}>software</em>.<br/>
              Not for <span style={{ textDecoration: 'line-through', textDecorationColor: p.inkMuted, textDecorationThickness: 2, opacity: 0.85 }}>DNS records</span>.
            </h1>
            <p style={{ fontSize: 18, color: p.inkSoft, lineHeight: 1.55, margin: '20px 0 0', maxWidth: 680 }}>
              The dirty secret of legacy scout software is that most of what you're paying for is commodity infrastructure marked up 10× to 1,000×. A custom domain costs us roughly two cents a year to host. Photo storage is pennies a gigabyte. Email is fractions of a fraction of a cent. Charging $25 a year to "host your domain" is theater.
            </p>
            <p style={{ fontSize: 18, color: p.ink, fontWeight: 500, lineHeight: 1.55, margin: '14px 0 0', maxWidth: 680 }}>
              So we don't. We pass the boring stuff through at cost and charge a fair, flat price for the part that's actually hard: the software.
            </p>
          </div>
          <div style={{ background: '#fff', border: `2px solid ${p.ember}`, borderRadius: 14, padding: 22, width: 280, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>The principle</div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 400, fontStyle: 'italic', color: p.ink, lineHeight: 1.25, marginBottom: 12 }}>
              "No commodity markups."
            </div>
            <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55 }}>
              If something is genuinely cheap for us, it should be cheap (or free) for you. We make money on a flat $99/yr — not on penny-ante markups your committee chair has to decode.
            </div>
          </div>
        </div>
      </div>

      {/* The table */}
      <div style={{ padding: '48px 80px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>
            What it actually costs vs. what they charge
          </h2>
          <div style={{ fontSize: 12, color: p.inkMuted, fontFamily: 'JetBrains Mono, monospace' }}>4 line items</div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 0.9fr 0.9fr', gap: 0, background: p.surfaceDark, color: '#fff', padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <div>Commodity</div>
            <div>Real cost</div>
            <div>Typical legacy host</div>
            <div style={{ color: p.bg }}>Compass</div>
          </div>

          {rows.map((r, i) => (
            <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${p.lineSoft}`, padding: '22px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 0.9fr 0.9fr', gap: 16, alignItems: 'flex-start' }}>
                {/* Commodity */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: p.ink, marginBottom: 4 }}>{r.item}</div>
                  <div style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.5 }}>{r.what}</div>
                </div>
                {/* Real cost */}
                <div>
                  <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.inkSoft, letterSpacing: '-0.01em' }}>{r.cost}</div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 4, lineHeight: 1.4 }}>{r.costNote}</div>
                </div>
                {/* TWH */}
                <div>
                  <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: '#a8590a', letterSpacing: '-0.01em' }}>{r.twh}</div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 4, lineHeight: 1.4 }}>{r.twhNote}</div>
                </div>
                {/* Us */}
                <div>
                  <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.success, letterSpacing: '-0.01em' }}>{r.us}</div>
                  <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 4, lineHeight: 1.4 }}>{r.usNote}</div>
                </div>
              </div>
              {/* Math row */}
              <div style={{ marginTop: 12, padding: '8px 12px', background: p.bg, borderRadius: 6, fontSize: 11, color: p.inkSoft, fontFamily: 'JetBrains Mono, monospace' }}>
                → {r.math}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Where we DO make money */}
      <div style={{ padding: '24px 80px 24px' }}>
        <div style={{ background: p.surfaceDark, color: '#fff', borderRadius: 14, padding: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 48, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: p.ember, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>So how do we make money?</div>
              <h3 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
                <em style={{ fontStyle: 'italic' }}>The software.</em><br/>That's it.
              </h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, marginTop: 16 }}>
                A flat $99/yr per troop. We make our margin on the part that's actually hard to build: a calendar that doesn't break, RSVPs that work on a parent's phone in a parking lot, a public site that doesn't look homemade, two-deep messaging that actually enforces two-deep.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>What our $99 actually pays for</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {[
                  ['Engineering', 'Two engineers, full-time. The product gets better every week.'],
                  ['Customer support', 'Real humans. ~30 min on the phone setting up your domain. Inbox triaged daily.'],
                  ['Security & compliance', 'Two-deep enforcement, audit logs, SOC 2 path, COPPA-aware data handling.'],
                  ['Roadmap research', 'We talk to scoutmasters every week. Features ship from your problems, not our PM\'s vibes.'],
                ].map(([t, s], i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{t}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The honest disclaimer */}
      <div style={{ padding: '24px 80px 64px' }}>
        <div style={{ background: '#fff', border: `1px dashed ${p.line}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: p.ember + '1a', color: p.ember, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700 }}>!</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: p.ink, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>The honest caveat</div>
              <div style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.65 }}>
                We're not better than the legacy alternatives on every line above by some heroic margin — we're <strong style={{ color: p.ink }}>structurally honest</strong> about which lines have margin and which don't. Storage still costs us real money (just less than typical pricing), so we still mark it up modestly and tell you so. Domains literally cost us pennies, so we charge you nothing extra. The point isn't "we're cheaper" — it's that <strong style={{ color: p.ink }}>the prices on this page will still make sense to you in five years</strong>, because they're tied to what things actually cost. Cloud prices fall. Ours will too.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.NoMarkupsPage = NoMarkupsPage;
