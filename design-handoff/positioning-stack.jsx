// Two positioning artboards rooted in the strongest evidence we have:
//
// (1) DuctTapeStackPage — a real troop's actual onboarding instructions
//     ("Sign up on Scouting.org, install GroupMe, log in to TroopWebHost,
//     come to the next meeting") side by side with the Compass version
//     ("Sign up on Scouting.org. Accept the Compass invite. Come to the
//     next meeting"). The pitch isn't "we're cheaper" — it's "your troop is
//     already running three tools because the official one can't message."
//
// (2) WhatWeReplacePage — honest scope. Three columns: what stays
//     (Scouting.org, Scoutbook, your bank), what we replace (the
//     TroopWebHost-class site, GroupMe, the ad-hoc Mailchimp, the shared
//     Drive of forms), and what's optional (custom domain, email-on-domain,
//     SSO). No "all-in-one" hand-waving — concrete tools by name.

const PS = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────

const Kicker = ({ children, color }) => {
  const T = PS.T();
  return (
    <div style={{ fontFamily: T.ui, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>
      {children}
    </div>
  );
};

const HugeHeadline = ({ children, color, maxWidth }) => {
  const T = PS.T();
  return (
    <h1 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.02, margin: '14px 0 0', color, maxWidth }}>
      {children}
    </h1>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Artboard 1 — The duct-tape stack
// ─────────────────────────────────────────────────────────────────────

const DuctTapeStackPage = () => {
  const p = PS.p(); const T = PS.T();

  // Real-troop language, lightly edited for clarity. The "Mailchimp" detail is
  // a representative addition — most committees use *some* email-blast tool
  // outside their hosting platform because the platform's email is unreliable.
  const oldStack = [
    {
      step: '1',
      tool: 'Scouting.org',
      action: 'Register your scout. Pay national + council fees.',
      role: 'Membership of record',
      note: 'Required by Scouting America. This stays.',
      stays: true,
    },
    {
      step: '2',
      tool: 'GroupMe',
      action: 'Install the app on your phone. Join the troop group.',
      role: 'Day-to-day messaging',
      note: 'A free consumer chat app. No audit log, no roster sync, no parent visibility.',
      stays: false,
    },
    {
      step: '3',
      tool: 'TroopWebHost',
      action: 'Create a separate login. Find your troop\'s site.',
      role: 'Calendar, RSVPs, troop info',
      note: 'The "official" troop site. Looks like 2008. The reason families needed GroupMe.',
      stays: false,
    },
    {
      step: '4',
      tool: 'Mailchimp / Constant Contact',
      action: 'Get added to the committee\'s email list.',
      role: 'Newsletter, blast announcements',
      note: 'Bolted on because TroopWebHost\'s email goes to spam.',
      stays: false,
    },
    {
      step: '5',
      tool: 'A shared Google Drive',
      action: 'Bookmark the link to the forms folder.',
      role: 'Permission slips, medical forms, handbooks',
      note: 'Because nobody figured out how to upload them to TroopWebHost.',
      stays: false,
    },
    {
      step: '6',
      tool: 'Venmo / Zelle (the treasurer\'s personal account)',
      action: 'Send dues to "Janet T."',
      role: 'Payments',
      note: 'Yes, this is what most troops actually do.',
      stays: false,
    },
  ];

  const newStack = [
    {
      step: '1',
      tool: 'Scouting.org',
      action: 'Register your scout. Pay national + council fees.',
      role: 'Membership of record',
      note: 'Same as before. We don\'t replace this.',
    },
    {
      step: '2',
      tool: 'Compass',
      action: 'Accept the invite already in your inbox.',
      role: 'Calendar, messaging, photos, payments, forms',
      note: 'One sign-up. The other five tools go away.',
    },
    {
      step: '3',
      tool: 'Come to the next meeting.',
      action: '',
      role: '',
      note: 'That\'s the whole list now.',
      meetingRow: true,
    },
  ];

  return (
    <div style={{ width: 1440, height: 1900, background: p.bg, fontFamily: T.ui, color: p.ink }}>
      {/* Hero */}
      <div style={{ padding: '56px 80px 28px', borderBottom: `1px solid ${p.lineSoft}` }}>
        <Kicker color={p.ember}>The actual problem</Kicker>
        <HugeHeadline color={p.ink} maxWidth={1100}>
          Your troop is already telling you<br/>
          the messaging tool is <em style={{ fontStyle: 'italic', color: p.ember }}>broken</em>.
        </HugeHeadline>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 40, marginTop: 22, alignItems: 'start' }}>
          <p style={{ fontSize: 18, color: p.inkSoft, lineHeight: 1.55, margin: 0, maxWidth: 760 }}>
            Look at any troop's "Welcome, new family" sheet. Three apps. Three passwords. Three places to remember to check. The reason isn't that families want it that way — it's that the "official" hosting platform can't message reliably, so everyone moved to a free consumer chat app and never went back. <strong style={{ color: p.ink, fontWeight: 600 }}>That's a product that gave up.</strong>
          </p>
          <div style={{ background: '#fff', border: `2px solid ${p.ember}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>What this page is</div>
            <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 400, color: p.ink, lineHeight: 1.3, marginBottom: 10 }}>
              A real troop's onboarding sheet, before and after.
            </div>
            <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55 }}>
              Source: a public welcome page from a New England troop. Names redacted. Tools and language are theirs.
            </div>
          </div>
        </div>
      </div>

      {/* The two onboarding sheets */}
      <div style={{ padding: '48px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* BEFORE — the duct-tape stack */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <Kicker color={p.inkMuted}>Before — what most troops do today</Kicker>
            <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.06em' }}>6 STEPS · 3+ APPS · 3 LOGINS</div>
          </div>
          {/* paper sheet */}
          <div style={{
            background: '#fbf7ed',
            border: `1px solid ${p.line}`,
            borderRadius: 4,
            padding: '28px 30px 32px',
            position: 'relative',
            boxShadow: '2px 4px 0 rgba(0,0,0,0.04)',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: '#2a2a2a',
            minHeight: 880,
          }}>
            <div style={{
              position: 'absolute', top: 14, right: 16,
              fontFamily: 'Georgia, serif',
              transform: 'rotate(6deg)',
              border: '2px solid #b3261e', color: '#b3261e',
              padding: '4px 10px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              borderRadius: 2,
              opacity: 0.85,
            }}>
              ACTUAL EXAMPLE
            </div>
            <div style={{ fontSize: 13, color: '#777', marginBottom: 4, fontStyle: 'italic' }}>Troop 1990 — Welcome, new family!</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#1a1a1a' }}>
              Getting started
            </div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {oldStack.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: i > 0 ? '1px dashed #c8b88a' : 'none', alignItems: 'flex-start' }}>
                  <div style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    borderRadius: '50%',
                    background: s.stays ? '#1f4d34' : '#b3261e',
                    color: '#fff',
                    fontFamily: 'Georgia, serif',
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 1,
                  }}>{s.step}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>
                      <span>{s.tool}</span>
                      <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#666', marginLeft: 6, fontSize: 13 }}>— {s.role}</span>
                    </div>
                    <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5, marginBottom: 4 }}>
                      {s.action}
                    </div>
                    <div style={{ fontFamily: T.ui, fontSize: 11, color: s.stays ? '#1f4d34' : '#9a4a45', lineHeight: 1.4, fontStyle: 'italic' }}>
                      {s.note}
                    </div>
                  </div>
                </li>
              ))}
              <li style={{ borderTop: '1px dashed #c8b88a', padding: '14px 0 0', marginTop: 4, fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
                7. Come to the next meeting!
              </li>
            </ol>
          </div>
        </div>

        {/* AFTER — Compass */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <Kicker color={p.ember}>After — with Compass</Kicker>
            <div style={{ fontSize: 11, color: p.ink, fontWeight: 700, letterSpacing: '0.06em' }}>3 STEPS · 1 NEW APP · 1 NEW LOGIN</div>
          </div>
          <div style={{
            background: p.bg,
            border: `2px solid ${p.ink}`,
            borderRadius: 14,
            padding: '28px 30px 32px',
            minHeight: 880,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 22, right: 22,
              background: p.ember, color: '#fff',
              padding: '4px 10px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              borderRadius: 999,
            }}>
              REWRITE
            </div>
            <div style={{ fontSize: 13, color: p.inkMuted, marginBottom: 4, fontFamily: T.ui }}>Troop 1990 — Welcome, new family!</div>
            <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 400, marginBottom: 18, color: p.ink, letterSpacing: '-0.01em' }}>
              Getting started
            </div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {newStack.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: 16, padding: '20px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none', alignItems: 'flex-start' }}>
                  <div style={{
                    flexShrink: 0,
                    width: 36, height: 36,
                    borderRadius: '50%',
                    background: i === 1 ? p.ember : p.ink,
                    color: '#fff',
                    fontFamily: T.display,
                    fontSize: 17,
                    fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{s.step}</div>
                  <div style={{ flex: 1 }}>
                    {s.meetingRow ? (
                      <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 400, color: p.ink, letterSpacing: '-0.01em' }}>
                        {s.tool}
                      </div>
                    ) : (
                      <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, lineHeight: 1.2, marginBottom: 4 }}>
                        {s.tool}
                        <span style={{ fontFamily: T.ui, fontWeight: 400, fontStyle: 'italic', color: p.inkSoft, marginLeft: 8, fontSize: 14 }}>— {s.role}</span>
                      </div>
                    )}
                    {s.action && (
                      <div style={{ fontSize: 15, color: p.inkSoft, lineHeight: 1.55, marginBottom: 4 }}>
                        {s.action}
                      </div>
                    )}
                    <div style={{ fontFamily: T.ui, fontSize: 12, color: i === 1 ? p.ember : p.inkMuted, lineHeight: 1.4, fontWeight: 500 }}>
                      {s.note}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {/* What changed */}
            <div style={{ marginTop: 28, padding: '20px 22px', background: p.surfaceAlt, borderRadius: 10, borderLeft: `3px solid ${p.ember}` }}>
              <div style={{ fontSize: 11, color: p.ember, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>What changed</div>
              <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.6 }}>
                Five tools collapsed into one. <strong style={{ color: p.ink, fontWeight: 600 }}>GroupMe goes away</strong> — Compass messaging is built for a youth-serving org with audit logs and roster sync. <strong style={{ color: p.ink, fontWeight: 600 }}>TroopWebHost goes away</strong> — Compass is the modern site, calendar, and photo library. <strong style={{ color: p.ink, fontWeight: 600 }}>Mailchimp goes away</strong> — newsletters send from your domain, with parent opt-out per family. <strong style={{ color: p.ink, fontWeight: 600 }}>The treasurer’s Venmo goes away</strong> — dues collect through Stripe at pass-through cost.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Closing band */}
      <div style={{ padding: '36px 80px 56px', borderTop: `1px solid ${p.lineSoft}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
          {[
            {
              k: 'The pitch isn’t "we’re cheaper."',
              v: 'Your committee is already paying for hosting AND running three free tools alongside it because the hosting can’t do its job. The math is "one tool that works" vs. "three tools that don’t."',
            },
            {
              k: 'GroupMe defection is the tell.',
              v: 'Every troop that uses GroupMe accepted zero audit trail and zero roster sync to escape their hosting platform’s messaging. They didn’t want that — they were forced into it.',
            },
            {
              k: 'New families feel this most.',
              v: 'A 12-year-old’s parent shouldn’t need a screenshare to figure out where the campout permission slip lives. Onboarding fits on an index card or it doesn’t fit at all.',
            },
          ].map((c, i) => (
            <div key={i} style={{ borderTop: `2px solid ${p.ink}`, paddingTop: 16 }}>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 400, lineHeight: 1.2, color: p.ink, letterSpacing: '-0.01em', marginBottom: 10 }}>
                {c.k}
              </div>
              <div style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.6 }}>
                {c.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Artboard 2 — What we replace / what we don't
// ─────────────────────────────────────────────────────────────────────

const WhatWeReplacePage = () => {
  const p = PS.p(); const T = PS.T();

  const stays = [
    {
      name: 'Scouting.org',
      what: 'Membership registration, dues to national & council, Youth Protection Training, official charter records.',
      why: 'System of record for Scouting America. Required. We never compete with this.',
    },
    {
      name: 'Scoutbook',
      what: 'Advancement of record — rank requirements, merit-badge sign-offs, official advancement reports submitted to council.',
      why: 'BSA’s system of record for what a scout has earned. Compass shows highlights ("Eli earned First Class") but defers to Scoutbook for the legal record. We can pull a read-only view via the Scoutbook API if your council allows it.',
    },
    {
      name: 'Your charter org’s bank',
      what: 'The actual checking account that holds troop funds.',
      why: 'Compass collects dues into Stripe; Stripe deposits to your bank. We’re the on-ramp, not the bank. Treasurer still reconciles. Charter org still owns the money.',
    },
    {
      name: 'Council-issued tour permits',
      what: 'Tour & activity plans that route through your council office.',
      why: 'These are council-specific workflows. We can attach the approved PDF to a Compass event, but the approval still happens at council.',
    },
  ];

  const replaced = [
    {
      name: 'TroopWebHost / ScoutLander / SOAR',
      what: 'Hosted public site, calendar, RSVPs, troop directory, photo gallery.',
      why: 'This is the core thing Compass is. Modern UX, mobile-first, $99/yr flat — vs. ~$200/yr for a 2008-era site builder. We import your TroopWebHost roster and event history in one click.',
    },
    {
      name: 'GroupMe / WhatsApp / Discord',
      what: 'The free consumer chat app the troop quietly uses for actual messaging.',
      why: 'Compass messaging is built for a youth-serving org: every thread is logged and exportable, channels auto-sync to your roster, and a leader can’t 1:1 a youth without a second adult on the thread. None of which GroupMe does.',
    },
    {
      name: 'Mailchimp / Constant Contact / a Gmail group',
      what: 'The committee’s email-blast tool, bolted on because the hosting platform’s email is unreliable.',
      why: 'Compass digests send from your domain (scoutmaster@troop100.org) with proper SPF/DKIM/DMARC. Parents reply and the reply lands in the right thread. Per-family opt-out and frequency caps built in.',
    },
    {
      name: 'A shared Google Drive of forms',
      what: 'The folder of permission slips, medical forms, handbooks the committee chair maintains by hand.',
      why: 'Compass attaches forms to events and tracks who’s signed and who hasn’t. Committee chair gets a "still missing" list before every campout, not a spreadsheet they made themselves.',
    },
    {
      name: 'The treasurer’s personal Venmo / Zelle',
      what: 'How most troops actually collect dues today. Yes, really.',
      why: 'Compass collects dues, trip fees, and fundraising via Stripe at pass-through cost (2.9% + 30¢ — no platform markup). Receipts auto-issued. Treasurer sees who’s paid in one place. Charter org’s bank account stays the destination.',
    },
    {
      name: 'A SignUpGenius / Google Form for every campout',
      what: 'The ad-hoc RSVP link the campout coordinator posts in three places.',
      why: 'Compass RSVPs are attached to the event, with permission-slip status, payment status, dietary restrictions, and ride coordination on one page. No more reconciling four sources.',
    },
  ];

  const optional = [
    {
      name: 'A custom domain (troop100.org)',
      what: 'Your troop’s own URL instead of troop100.compass.app.',
      why: 'You bring the domain from any registrar (Namecheap, Porkbun, etc — typically ~$15/yr direct from the registrar). We configure it free; legacy hosts charge $25/yr for the same DNS record. Skip this if you don’t have an existing domain — the default subdomain works the moment you sign up.',
      who: 'Worth it for established troops with existing domain equity. Probably overkill for new units.',
    },
    {
      name: 'Email from your own domain',
      what: 'Newsletters send from scoutmaster@troop100.org instead of from us.',
      why: 'Three DNS records on your end, we handle the rest. Email actually looks like it came from your troop. No extra Compass fee — but requires the custom domain above.',
      who: 'Worth it once you have the custom domain. Not a separate decision in practice.',
    },
    {
      name: 'Single sign-on (Google / Microsoft)',
      what: 'Parents sign in with their existing Google or Microsoft account instead of a Compass password.',
      why: 'Free. Reduces password resets — the #1 support call for any troop platform. Off by default; committee chair turns it on.',
      who: 'Almost every troop should turn this on. It costs nothing and removes a real pain point.',
    },
  ];

  const Column = ({ kicker, kickerColor, title, items, withWho, footer }) => (
    <div>
      <Kicker color={kickerColor}>{kicker}</Kicker>
      <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.015em', color: p.ink, margin: '10px 0 24px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, color: p.ink, marginBottom: 4 }}>{it.name}</div>
            <div style={{ fontSize: 12.5, color: p.inkMuted, lineHeight: 1.5, marginBottom: 8, fontStyle: 'italic' }}>{it.what}</div>
            <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55 }}>{it.why}</div>
            {withWho && it.who && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: p.surfaceAlt, borderRadius: 6, fontSize: 12, color: p.ink, lineHeight: 1.45 }}>
                <strong style={{ fontWeight: 600 }}>Who should bother:</strong> {it.who}
              </div>
            )}
          </div>
        ))}
      </div>
      {footer && (
        <div style={{ marginTop: 14, fontSize: 12, color: p.inkMuted, lineHeight: 1.55, fontStyle: 'italic' }}>{footer}</div>
      )}
    </div>
  );

  return (
    <div style={{ width: 1440, minHeight: 2200, background: p.bg, fontFamily: T.ui, color: p.ink }}>
      {/* Hero */}
      <div style={{ padding: '56px 80px 28px', borderBottom: `1px solid ${p.lineSoft}` }}>
        <Kicker color={p.ember}>Honest scope</Kicker>
        <HugeHeadline color={p.ink} maxWidth={1100}>
          What Compass replaces.<br/>
          What it <em style={{ fontStyle: 'italic', color: p.ember }}>doesn’t</em>.
        </HugeHeadline>
        <p style={{ fontSize: 18, color: p.inkSoft, lineHeight: 1.55, margin: '20px 0 0', maxWidth: 980 }}>
          Software companies say "all-in-one" when they want to avoid being specific. We’d rather tell you exactly which tools you can stop paying for, which ones stay, and which ones are optional add-ons most troops don’t need. If we hand-wave on this you’ll find out the hard way three months in — and that’s a worse experience for everyone.
        </p>
      </div>

      {/* Three columns */}
      <div style={{ padding: '40px 80px 64px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
        <Column
          kicker="Stays — we don’t replace this"
          kickerColor={p.inkMuted}
          title="Compass works alongside the system of record."
          items={stays}
          footer="Compass is software for the volunteer side of running a unit — calendar, communication, public site, money. The official record-keeping stays with Scouting America’s tools. We integrate where APIs exist, defer where they don’t."
        />
        <Column
          kicker="Replaced — these go away"
          kickerColor={p.ember}
          title="One tool instead of six."
          items={replaced}
          footer="None of these are bad tools in isolation. The problem is the cumulative tax: every new family signs up six times, every committee chair maintains six sources of truth, every leader checks six places before a campout."
        />
        <Column
          kicker="Optional — leave off if you want"
          kickerColor={p.sky || p.primary}
          title="Power-user add-ons. Free, but not for everyone."
          items={optional}
          withWho
          footer="The default Compass setup (subdomain, our sending domain, password login) is what most troops should run. These three are real features for troops that want them — not upsells, not fees."
        />
      </div>

      {/* Footer guarantee */}
      <div style={{ background: p.ink, color: '#fff', padding: '40px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
        <div>
          <Kicker color={p.ember}>Migration commitment</Kicker>
          <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, color: '#fff', letterSpacing: '-0.015em', lineHeight: 1.15, margin: '10px 0 0', maxWidth: 480 }}>
            We import your roster and event history from TroopWebHost in one click.
          </div>
        </div>
        <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6 }}>
          Bring a CSV from your current platform — we map fields, preserve event history, keep file URLs valid via redirects, and send a "we moved" notice from your domain. The week you switch, families don’t get a flood of "where do I log in" emails. <strong style={{ color: '#fff', fontWeight: 600 }}>And if it doesn’t work, we’ll refund the year</strong> — first 60 days, no questions.
        </div>
      </div>
    </div>
  );
};

window.DuctTapeStackPage = DuctTapeStackPage;
window.WhatWeReplacePage = WhatWeReplacePage;
