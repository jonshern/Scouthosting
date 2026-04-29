// BALANCED — Forest & Ember. Editorial magazine feel, pushed bolder:
// massive type, ember used as a real color block (not just italic), the
// spectrum applied across stats/features/events, dark-forest sections
// for visual rhythm, more contrast.
const MarketingBalanced = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const dark = p.surfaceDark || '#1d3a32';
  return (
    <div style={{ width: 1200, minHeight: 2400, background: p.bg, color: p.ink, fontFamily: T.ui, position: 'relative' }}>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 56px' }}>
        <SHWordmark p={p} size={20}/>
        <div style={{ display: 'flex', gap: 32, fontSize: 13, color: p.inkSoft, letterSpacing: '0.02em' }}>
          <span>The Product</span><span>For Troops & Packs</span><span>Pricing</span><span>Field Notes</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: p.inkSoft }}>Sign in</span>
          <button style={{ background: p.accent, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: T.ui }}>Start a trial</button>
        </div>
      </div>

      {/* Hero — magazine cover, BIGGER */}
      <div style={{ padding: '20px 56px 56px' }}>
        <div style={{ borderTop: `2px solid ${p.ink}`, paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontFamily: T.ui, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: p.inkSoft, marginBottom: 32 }}>
            <span>Volume 1 · Issue 04</span>
          <span>The Compass Field Notes</span>
          <span>Modern Software for Volunteer Units</span>
          <span>Independent · Not affiliated with BSA</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 48, alignItems: 'end' }}>
          <h1 style={{ fontFamily: T.display, fontSize: 116, fontWeight: 400, lineHeight: 0.92, letterSpacing: '-0.035em', margin: 0, color: p.ink }}>
            Your troop's<br/>
            website shouldn't<br/>
            <span style={{ background: p.accent, color: '#fff', padding: '4px 18px 8px', fontStyle: 'italic', fontWeight: 500, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', display: 'inline' }}>look like 2008.</span>
          </h1>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: p.ink, color: p.bg, borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 18 }}>
              <span style={{ width: 6, height: 6, background: p.accent, borderRadius: '50%' }}/>
              SECURITY-FIRST · BUILT FOR MINORS' DATA
            </div>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: p.inkSoft, margin: '0 0 24px' }}>
              Most volunteer units are stuck on hosting platforms designed before the iPhone. Compass is the modern, mobile-first, security-engineered alternative — the calendar, public site, photo library, and parent inbox your families actually want to use.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={{ background: p.ink, color: p.bg, border: 'none', padding: '14px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>Start free trial →</button>
              <button style={{ background: 'transparent', color: p.ink, border: `1.5px solid ${p.ink}`, padding: '14px 22px', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>See the security model</button>
            </div>
          </div>
        </div>

        {/* Hero photo strip with colored frames */}
        <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, height: 360 }}>
          <div style={{ borderRadius: 6, overflow: 'hidden', borderTop: `5px solid ${p.accent}` }}><Photo subject="canoe" w="100%" h="100%" p={p}/></div>
          <div style={{ borderRadius: 6, overflow: 'hidden', borderTop: `5px solid ${p.sky}` }}><Photo subject="troop" w="100%" h="100%" p={p}/></div>
          <div style={{ borderRadius: 6, overflow: 'hidden', borderTop: `5px solid ${p.raspberry}` }}><Photo subject="campfire" w="100%" h="100%" p={p}/></div>
        </div>
      </div>

      {/* Stats strip — trade vague metrics for a security/values band */}
      <div style={{ background: dark, color: '#fff', padding: '48px 56px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, position: 'relative' }}>
        {[
          { n: 'AES-256', l: 'encryption at rest', c: p.accent },
          { n: 'SSO', l: 'SAML · OIDC · WebAuthn', c: p.sky },
          { n: 'Two-deep', l: 'YPT-aligned messaging audit', c: p.butter },
          { n: '$12', l: 'flat per unit, per month', c: p.teal },
        ].map((s, i) => (
          <div key={i} style={{ borderTop: `3px solid ${s.c}`, paddingTop: 20 }}>
            <div style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, color: '#fff', lineHeight: 1, letterSpacing: '-0.025em' }}>{s.n}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Features — editorial blocks, BOLDER */}
      <div style={{ padding: '88px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 48 }}>
          <div>
            <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>§ The Product</div>
            <h2 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: 0, maxWidth: 820 }}>
              Built around the four things <span style={{ fontStyle: 'italic', color: p.accent }}>volunteers actually need.</span>
            </h2>
          </div>
        </div>

        {[
          { num: '01', kw: 'Calendar', title: 'A calendar that handles RSVPs, money, and rides.', body: 'Publish a campout, attach the permission slip, accept payment, and assign carpools — without a single PDF email.', img: 'forest', c: p.sky },
          { num: '02', kw: 'Website', title: 'A public homepage that recruits new families.', body: 'Pick from six templates, drop in your troop number, and you\'re live on a custom subdomain. Scouts can edit it during a Tuesday meeting.', img: 'troop', c: p.accent },
          { num: '03', kw: 'Messages', title: 'Email & text that families actually read.', body: 'Send a Sunday update or a 7am cancellation. Threaded replies. SMS for urgent. No more "did you get the flier?"', img: 'campfire', c: p.raspberry },
          { num: '04', kw: 'Memories', title: 'A photo library worth scrolling through.', body: 'Drop 200 phone photos in after Friday\'s campout. Auto-organized by event. Families can request blurs on faces.', img: 'canoe', c: p.plum },
        ].map((f, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: i % 2 === 0 ? '1fr 1.3fr' : '1.3fr 1fr',
            gap: 40,
            alignItems: 'center',
            padding: '48px 0',
            borderTop: `2px solid ${p.ink}`,
          }}>
            <div style={{ order: i % 2 === 0 ? 0 : 1, height: 360, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <Photo subject={f.img} w="100%" h="100%" p={p}/>
              <div style={{ position: 'absolute', top: 16, left: 16, background: f.c, color: '#fff', padding: '4px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', borderRadius: 4 }}>{f.kw.toUpperCase()}</div>
            </div>
            <div style={{ order: i % 2 === 0 ? 1 : 0, padding: '0 16px' }}>
              <div style={{ fontFamily: T.display, fontSize: 88, fontWeight: 400, color: f.c, lineHeight: 0.9, letterSpacing: '-0.03em', marginBottom: 18, fontStyle: 'italic' }}>{f.num}</div>
              <h3 style={{ fontFamily: T.display, fontSize: 40, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 18px' }}>{f.title}</h3>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: p.inkSoft, margin: 0 }}>{f.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Migration band — sand */}
      <div style={{ padding: '64px 56px', background: p.surfaceAlt, borderTop: `2px solid ${p.ink}`, borderBottom: `2px solid ${p.ink}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>§ Migration</div>
            <h3 style={{ fontFamily: T.display, fontSize: 48, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.025em', margin: '0 0 20px' }}>
              Bring your <span style={{ fontStyle: 'italic', color: p.accent }}>18 years</span> of troop history with you.
            </h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: p.inkSoft, margin: 0 }}>
              We import from TroopWebHost, ScoutLander, TroopTrack, and a folder of CSVs you found on the old committee chair's laptop. White-glove migration is included on every plan — book a 30-minute call and we'll have you running by Sunday.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {['TroopWebHost', 'ScoutLander', 'TroopTrack', 'Wix / Squarespace', 'Google Sites', 'CSV / Excel', 'Scoutbook export', 'Internet Advancement', 'A shared Drive folder'].map((src, i) => (
              <div key={i} style={{ background: p.bg, border: `1.5px solid ${p.line}`, borderRadius: 6, padding: '14px 16px', fontSize: 13, fontWeight: 500, color: p.ink, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.accent, flexShrink: 0 }}/>
                {src}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing — three tiers, ember-highlighted middle */}
      <div style={{ padding: '88px 56px' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>§ Pricing</div>
          <h2 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: 0, maxWidth: 900 }}>
            One price per unit — pack, troop, crew, ship, or post. No <span style={{ fontStyle: 'italic', color: p.accent }}>per-scout</span> fees, ever.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          {[
            { name: 'Unit', price: '$12', sub: '/ month, billed annually', desc: 'One pack, troop, crew, ship, or post. No per-scout fees, no per-leader fees, no setup fees.', features: ['Public website + custom subdomain', 'Calendar with RSVPs, permission slips, and Stripe payments', 'SMS for urgent alerts · email for everything else', 'Photo library (50 GB) with per-scout privacy controls', 'Carpool & ride coordination', 'Two-deep messaging audit (YPT-aligned)', 'Scoutbook one-way sync', 'White-glove migration from your old site'], cta: 'Start free trial', highlight: true },
            { name: 'District', price: 'Talk to us', sub: 'Multi-unit · custom', desc: 'For districts, councils, and large charter orgs running several units centrally.', features: ['Everything in Unit, for every unit you run', 'Centralized billing & multi-unit dashboard', 'SAML SSO + SCIM provisioning', 'Custom domain per unit', 'Audit-log export', 'Dedicated migration engineer'], cta: 'Book a call', highlight: false },
          ].map((tier, i) => (
            <div key={i} style={{
              background: tier.highlight ? p.ink : p.bg,
              color: tier.highlight ? '#fff' : p.ink,
              border: tier.highlight ? `2px solid ${p.ink}` : `2px solid ${p.line}`,
              borderRadius: 10,
              padding: '32px 28px',
              position: 'relative',
            }}>
              {tier.highlight && (
                <div style={{ position: 'absolute', top: -12, left: 28, background: p.accent, color: '#fff', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 4, letterSpacing: '0.12em' }}>MOST TROOPS</div>
              )}
              <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, fontStyle: 'italic', marginBottom: 8, color: tier.highlight ? p.accent : p.accent }}>{tier.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: T.display, fontSize: 56, fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1 }}>{tier.price}</span>
              </div>
              <div style={{ fontSize: 12, color: tier.highlight ? 'rgba(255,255,255,0.6)' : p.inkMuted, marginBottom: 20 }}>{tier.sub}</div>
              <div style={{ fontSize: 13, color: tier.highlight ? 'rgba(255,255,255,0.85)' : p.inkSoft, marginBottom: 24, paddingBottom: 24, borderBottom: tier.highlight ? '1px solid rgba(255,255,255,0.15)' : `1px solid ${p.line}` }}>{tier.desc}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tier.features.map((f, j) => (
                  <li key={j} style={{ fontSize: 13, color: tier.highlight ? 'rgba(255,255,255,0.9)' : p.ink, display: 'flex', gap: 10, lineHeight: 1.4 }}>
                    <span style={{ color: p.accent, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button style={{
                width: '100%',
                background: tier.highlight ? p.accent : 'transparent',
                color: tier.highlight ? '#fff' : p.ink,
                border: tier.highlight ? 'none' : `1.5px solid ${p.ink}`,
                padding: '13px 18px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: T.ui,
              }}>{tier.cta} →</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28, fontSize: 13, color: p.inkMuted, textAlign: 'center' }}>
          501(c)(3)? You get 20% off, automatically. Stripe fees passed through at cost (2.9% + 30¢).
        </div>
      </div>

      {/* Old vs new — comparison band on dark forest */}
      <div style={{ padding: '88px 56px', background: dark, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: p.accent, marginBottom: 14 }}>§ The status quo</div>
            <h2 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: 0, color: '#fff', maxWidth: 820 }}>
              The site your families see <span style={{ fontStyle: 'italic', color: p.accent }}>is your front door.</span>
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', maxWidth: 720, margin: '20px 0 0' }}>
              Recruiting families compare your unit to the soccer club, the Y, the music school. If your homepage looks like a 2008 phpBB install, you're losing scouts before the first parent night.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* OLD — TroopWebHost-style screenshot */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}/>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Today \u00b7 Old hosting platform</div>
              </div>
            </div>
            <div style={{ background: '#fff', color: '#000', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
              {/* fake browser chrome */}
              <div style={{ background: '#dcdfe2', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #b0b5b9' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#fb6964' }}/>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#fdc14b' }}/>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#34c64c' }}/>
                <div style={{ flex: 1, marginLeft: 10, background: '#fff', height: 16, borderRadius: 3, fontSize: 9, fontFamily: 'Arial, sans-serif', color: '#666', padding: '2px 6px' }}>https://www.oldhostingplatform.com/Troop12/Index.htm</div>
              </div>
              {/* page content */}
              <div style={{ padding: 0, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, color: '#000', minHeight: 360 }}>
                <div style={{ background: 'linear-gradient(180deg, #4a6e3a, #2f4d24)', color: '#ffe', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a2f10' }}>
                  <span style={{ fontFamily: 'Times, serif', fontSize: 22, fontWeight: 700, fontStyle: 'italic', textShadow: '1px 1px 2px rgba(0,0,0,0.4)' }}>Troop 12 - Anytown, USA</span>
                  <span style={{ fontSize: 10 }}>Login | Help</span>
                </div>
                <div style={{ background: '#e8e8d8', padding: '4px 14px', fontSize: 11, color: '#444', borderBottom: '1px solid #c0c0a8' }}>
                  Home &gt; Welcome
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', minHeight: 280 }}>
                  <div style={{ background: '#f0eed8', padding: '12px 10px', borderRight: '1px solid #c8c8b0', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#234' }}>MAIN MENU</div>
                    {['Home', 'About Our Troop', 'Calendar', 'Photo Gallery', 'Eagle Scouts', 'Documents', 'Forms', 'Contact Us', 'Members Only'].map((l, i) => (
                      <div key={i} style={{ padding: '3px 0', color: '#0050a0', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>\u00bb {l}</div>
                    ))}
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ fontFamily: 'Times, serif', fontSize: 18, fontWeight: 700, color: '#2f4d24', marginBottom: 8, borderBottom: '2px solid #2f4d24', paddingBottom: 4 }}>Welcome to Troop 12!</div>
                    <p style={{ margin: '6px 0', fontSize: 11, lineHeight: 1.5 }}>
                      <img src="data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;120&quot; height=&quot;90&quot; viewBox=&quot;0 0 120 90&quot;><rect width=&quot;120&quot; height=&quot;90&quot; fill=&quot;%23c8c8b0&quot;/><text x=&quot;60&quot; y=&quot;48&quot; text-anchor=&quot;middle&quot; font-family=&quot;Arial&quot; font-size=&quot;10&quot; fill=&quot;%23666&quot;>scouts.jpg</text></svg>" style={{ float: 'left', marginRight: 8, marginBottom: 4, border: '2px ridge #888' }}/>
                      Troop 12 has been serving Anytown since 1972. We meet every Tuesday at 7:00 PM at St. Mark's Community Church. New scouts are always welcome - please contact our Scoutmaster for more information.
                    </p>
                    <div style={{ background: '#fffacc', border: '1px solid #d4b850', padding: '6px 8px', margin: '8px 0', fontSize: 11 }}>
                      <b style={{ color: '#a05010' }}>NEW!</b> Spring Campout signup is now open. Permission slip <a style={{ color: '#0050a0', textDecoration: 'underline' }}>(click here)</a> must be returned by Friday.
                    </div>
                    <div style={{ fontFamily: 'Times, serif', fontSize: 14, fontWeight: 700, color: '#2f4d24', marginTop: 12, marginBottom: 4, borderBottom: '1px solid #2f4d24' }}>Upcoming Events</div>
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                      <tbody>
                        {[['03/21/26', 'Spring Campout - Birch Lake'], ['03/25/26', 'Troop Meeting'], ['04/04/26', 'Eagle Project - Jamie']].map((r, i) => (
                          <tr key={i} style={{ background: i % 2 ? '#f8f8e8' : '#fff' }}>
                            <td style={{ padding: '3px 6px', borderBottom: '1px dotted #aaa', fontFamily: 'Courier, monospace' }}>{r[0]}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px dotted #aaa', color: '#0050a0', textDecoration: 'underline' }}>{r[1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div style={{ background: '#2f4d24', color: '#cdcdb8', fontSize: 10, padding: '6px 14px', textAlign: 'center', borderTop: '2px solid #1a2f10' }}>
                  Powered by OldHostingPlatform.com - \u00a9 2009-2026 \u00b7 best viewed in IE7+
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>\u25cf</span> Broken on phones. No HTTPS-only enforcement. No SSO. No two-deep audit. Tables for layout. Member roster behind a single shared password.
            </div>
          </div>

          {/* NEW — Compass */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.accent }}/>
                <div style={{ fontSize: 12, color: p.accent, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Compass \u00b7 next Tuesday</div>
              </div>
            </div>
            <div style={{ background: '#fff', color: p.ink, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ background: p.surfaceAlt, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${p.line}` }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#fb6964' }}/>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#fdc14b' }}/>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#34c64c' }}/>
                <div style={{ flex: 1, marginLeft: 10, background: '#fff', height: 16, borderRadius: 8, fontSize: 9, color: p.inkMuted, padding: '2px 8px', fontFamily: T.ui, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="3"><path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z"/></svg>
                  troop12.compass.app
                </div>
              </div>
              <div style={{ minHeight: 360, background: p.bg, padding: 16, fontFamily: T.ui }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink }}>Troop 12 \u00b7 <span style={{ fontStyle: 'italic', color: p.inkSoft }}>Anytown</span></div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: p.inkSoft }}>
                    <span>About</span><span>Calendar</span><span>Photos</span><span>Join</span>
                  </div>
                </div>
                <div style={{ background: p.surfaceDark, color: '#fff', padding: 16, borderRadius: 8, position: 'relative', overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ position: 'absolute', top: -10, right: -10, width: 80, height: 80, borderRadius: '50%', background: p.accent, opacity: 0.25 }}/>
                  <div style={{ fontSize: 9, letterSpacing: '0.14em', color: p.accent, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>This Friday</div>
                  <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 400, lineHeight: 1.1, marginBottom: 6 }}>Spring Campout \u2014<br/>Birch Lake State Park</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>Fri 5:30 PM \u00b7 18 going \u00b7 permission slip + $35 due Thursday</div>
                  <div style={{ display: 'inline-block', background: p.accent, color: '#fff', padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 4 }}>Sign \u00b7 RSVP \u00b7 Pay \u2192</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
                  {[p.accent, p.sky, p.ember].map((c, i) => (
                    <div key={i} style={{ aspectRatio: '4/3', background: `linear-gradient(135deg, ${c}, ${c}99)`, borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                      <svg width="100%" height="100%" viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
                        <polygon points={`0,${50 + i*4} 30,${30 + i*3} 60,${45 - i*2} 100,${35 + i*4} 100,75 0,75`} fill="#0f172a"/>
                      </svg>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: p.inkMuted, display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${p.line}`, paddingTop: 8 }}>
                  <span>Hosted with Compass</span>
                  <span>HTTPS \u00b7 SSO \u00b7 Privacy controls</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
              <span style={{ color: p.accent, fontWeight: 700 }}>\u25cf</span> Mobile-first. HTTPS-only. SAML / OIDC SSO. Two-deep messaging audit. Per-scout photo privacy. Migrates from your old hosting in an afternoon.
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '96px 56px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: p.accent, color: '#fff', borderRadius: 999, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 24 }}>Free for 30 days</div>
        <h2 style={{ fontFamily: T.display, fontSize: 80, fontWeight: 400, lineHeight: 0.98, letterSpacing: '-0.03em', margin: '0 auto 32px', maxWidth: 900 }}>
          Set up your troop's home base <span style={{ fontStyle: 'italic', color: p.accent }}>before next week's meeting.</span>
        </h2>
        <div style={{ display: 'inline-flex', gap: 12, marginBottom: 24 }}>
          <button style={{ background: p.ink, color: p.bg, border: 'none', padding: '16px 28px', borderRadius: 999, fontSize: 15, fontWeight: 600 }}>Start free trial →</button>
          <button style={{ background: 'transparent', color: p.ink, border: `1.5px solid ${p.ink}`, padding: '16px 28px', borderRadius: 999, fontSize: 15, fontWeight: 500 }}>Talk to a person</button>
        </div>
        <div style={{ fontSize: 13, color: p.inkMuted }}>No credit card · cancel anytime · we'll migrate your old site for free</div>
      </div>

      {/* Footer */}
      <div style={{ padding: '32px 56px', borderTop: `1px solid ${p.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: p.inkMuted }}>
        <SHWordmark p={p} size={16}/>
        <div>© 2026 Compass · Independent · Not affiliated with Scouting America or BSA</div>
      </div>
    </div>
  );
};

window.MarketingBalanced = MarketingBalanced;
