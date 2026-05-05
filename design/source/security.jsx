// Security & Trust — written for committee chairs, treasurers, and parent volunteers.
// Plain-language. No jargon. Focus on: what we protect, who can see what,
// and what happens if something goes wrong. Optional "for the technical reader"
// callouts at the end keep the door open for engineers without burying everyone else.

const SecurityCard = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const dark = !!p.surfaceDark;

  return (
    <div style={{ width: 1200, minHeight: 1800, background: p.bg, color: p.ink, fontFamily: T.ui }}>
      {/* Header band */}
      <div style={{ padding: '56px 56px 44px', background: dark ? p.surfaceDark : p.surface, color: dark ? '#fff' : p.ink, borderBottom: `1px solid ${p.line}`, position: 'relative', overflow: 'hidden' }}>
        <TopoBg color={dark ? p.accent : p.primary} opacity={dark ? 0.08 : 0.04}/>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', background: dark ? 'rgba(255,255,255,0.08)' : p.surfaceAlt, border: `1px solid ${dark ? 'rgba(255,255,255,0.18)' : p.line}`, borderRadius: 999, fontSize: 11, color: dark ? '#fff' : p.primary, fontWeight: 600, marginBottom: 22, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Security & privacy
          </div>
          <h1 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: '0 0 18px', color: dark ? '#fff' : p.ink }}>
            What we do with <span style={{ fontStyle: 'italic', color: p.accent }}>your&nbsp;information</span>.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: dark ? 'rgba(255,255,255,0.78)' : p.inkSoft, margin: 0, maxWidth: 760 }}>
            A short, plain-language page for committee chairs and parents. What we collect, who sees it, and how we keep it safe.
          </p>
        </div>
      </div>

      {/* Promises — the headline */}
      <div style={{ padding: '48px 56px', borderTop: `1px solid ${p.line}` }}>
        <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Our promises to your troop</div>
        <h2 style={{ fontFamily: T.display, fontSize: 36, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 32px', maxWidth: 820 }}>
          Five things we will always do, and five we will never do.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <PromiseList p={p} title="We will always" tone="good" items={[
            'Treat youth information as the most sensitive data in the system.',
            'Hide phone numbers, addresses, and last names from the public side of your troop page.',
            'Require photo permission from a parent before a scout appears in any gallery.',
            'Let your committee export everything you have ever put into Compass, any time, in plain CSV.',
            'Tell you in plain English if anything ever goes wrong with your data, as soon as we know.',
          ]}/>
          <PromiseList p={p} title="We will never" tone="bad" items={[
            'Sell, rent, or share your troop\u2019s data with anyone, for any reason.',
            'Show ads &mdash; not to parents, not to scouts, not to leaders.',
            'Track your scouts across other websites or apps.',
            'Hold your data hostage if you decide to leave Compass.',
            'Add a new feature that touches youth data without telling your committee first.',
          ]}/>
        </div>
      </div>

      {/* Who can see what */}
      <Section p={p} kicker="Who sees what" title="A parent, a leader, and a stranger walk into your troop page&hellip;">
        <p style={{ fontSize: 15, lineHeight: 1.6, color: p.inkSoft, margin: '0 0 24px', maxWidth: 760 }}>
          Every piece of information in Compass is tagged for an audience. The same scout&rsquo;s record looks completely different depending on who is signed in &mdash; or whether anyone is signed in at all.
        </p>
        <AudienceTable p={p}/>
      </Section>

      {/* Sign-in & accounts */}
      <Section p={p} kicker="Signing in" title="How sign-in works.">
        <div style={{ maxWidth: 760 }}>
          <PlainPara p={p}>
            Most parents and leaders sign in with Google or Apple &mdash; the accounts they already use. Anyone with admin permissions (committee chair, scoutmaster, treasurer, webmaster) is required to sign in this way; passwords aren&rsquo;t an option for admin accounts.
          </PlainPara>
          <PlainPara p={p}>
            For parents who&rsquo;d rather use a password, it has to be at least 12 characters. Every failed sign-in attempt is logged, so an unusual pattern of guesses against a family is something a committee chair can review.
          </PlainPara>
        </div>
      </Section>

      {/* What happens to data */}
      <Section p={p} kicker="What happens to your data" title="Locked, logged, and yours to take with you.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <PlainCard p={p} title="Locked"
            body="Everything is encrypted on its way to us (TLS 1.2+) and while it sits on our servers (AES-256 at rest). Database backups are encrypted with a key that is unique to your troop, so a stolen backup tape isn&rsquo;t a stolen roster."
          />
          <PlainCard p={p} title="Logged"
            body="Every time a leader exports a roster, downloads a form, or changes a permission, we keep a record of who did what and when. Committee chairs can download this log any time."
          />
          <PlainCard p={p} title="Yours"
            body="Your troop owns your data. Click &lsquo;Export everything&rsquo; in settings and you get a ZIP with every roster, photo, message, and document &mdash; no questions, no waiting, no fee. If you ever leave Compass, you walk out with everything."
          />
        </div>
      </Section>

      {/* Youth-protection */}
      <Section p={p} kicker="Youth protection" title="The defaults a Scoutmaster would set, on by default.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {[
            { t: 'No youth contact info on the public page', b: 'Public troop pages show first name and last initial only. Phone numbers and addresses are never displayed to anyone outside the troop &mdash; not even to other parents in the troop unless that family opts in.' },
            { t: 'Photo opt-in, per scout', b: 'A scout&rsquo;s photo only appears in the gallery, on the website, or in newsletters if their parent has signed the photo release in Compass. Change your mind? One click and every photo of that scout is hidden everywhere.' },
            { t: 'Two-deep messaging', b: 'A leader cannot send a one-on-one message to a scout. Every direct conversation with a youth automatically copies a second registered adult and the parent &mdash; matching Scouting America&rsquo;s Youth Protection rules.' },
            { t: 'YPT status visible', b: 'Committee chairs can see at a glance which registered adults have a current Youth Protection Training certificate. Anyone overdue is flagged and can&rsquo;t be added to a campout roster.' },
          ].map((r, i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: p.ink, marginBottom: 8, lineHeight: 1.25 }}>{r.t}</div>
              <div style={{ fontSize: 13.5, color: p.inkSoft, lineHeight: 1.6 }}>{r.b}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* If something goes wrong */}
      <Section p={p} kicker="If something goes wrong" title="We&rsquo;ll tell you in plain English.">
        <PlainPara p={p}>
          Software has bugs and people make mistakes. If we ever discover a problem with your troop&rsquo;s data, we&rsquo;ll tell you what happened, what was involved, and what we recommend &mdash; in plain English, as soon as we know.
        </PlainPara>
      </Section>

      {/* Independent checks */}
      <Section p={p} kicker="Independent checks" title="A few things we lean on.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            ['PCI through Stripe', 'Credit cards for dues and trip fees are handled by Stripe. Compass never sees the card number.'],
            ['Parent-consent first', 'Anything involving a scout under 13 requires a verified parent account. No exceptions, no workarounds.'],
            ['Privacy laws', 'We respect GDPR (Europe) and CCPA (California) data-subject rights and will sign a Data Processing Agreement if your council requires one.'],
          ].map(([k, v], i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: 18 }}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink, marginBottom: 6 }}>{k}</div>
              <div style={{ fontSize: 12.5, color: p.inkSoft, lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <div style={{ padding: '32px 56px', background: p.surfaceAlt, borderTop: `1px solid ${p.line}`, fontSize: 12, color: p.inkMuted, display: 'flex', justifyContent: 'space-between' }}>
        <span>Last reviewed by our security team &middot; April 2026</span>
        <span>Questions? <a style={{ color: p.accent, textDecoration: 'none', fontWeight: 500 }}>security@compass.app</a></span>
      </div>
    </div>
  );
};

// — helpers —
const Section = ({ p, kicker, title, children }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ padding: '48px 56px', borderTop: `1px solid ${p.line}` }}>
      <div style={{ fontSize: 11, color: p.inkMuted, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>{kicker}</div>
      <h2 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.02em', margin: '0 0 28px', maxWidth: 820 }} dangerouslySetInnerHTML={{ __html: title }}/>
      {children}
    </div>
  );
};

const PlainPara = ({ p, children }) => (
  <p style={{ fontSize: 15, lineHeight: 1.65, color: p.inkSoft, margin: '0 0 16px' }}>{children}</p>
);

const PlainCard = ({ p, title, body }) => {
  const T = window.SH_TYPE;
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, padding: 22 }}>
      <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 400, fontStyle: 'italic', color: p.accent, marginBottom: 10 }}>{title}.</div>
      <div style={{ fontSize: 13.5, color: p.inkSoft, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: body }}/>
    </div>
  );
};

const PromiseList = ({ p, title, tone, items }) => {
  const T = window.SH_TYPE;
  const isGood = tone === 'good';
  const dotColor = isGood ? p.success : p.danger;
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 14, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor }}/>
        <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, fontStyle: isGood ? 'normal' : 'italic' }}>{title}</div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none', fontSize: 14, lineHeight: 1.55, color: p.inkSoft }}>
            <span style={{ color: dotColor, fontWeight: 700, flexShrink: 0, fontFamily: T.display, fontSize: 16 }}>{isGood ? '\u2713' : '\u2715'}</span>
            <span dangerouslySetInnerHTML={{ __html: it }}/>
          </li>
        ))}
      </ul>
    </div>
  );
};

const AudienceTable = ({ p }) => {
  const T = window.SH_TYPE;
  const cols = ['A stranger on the public page', 'A parent in the troop', 'A registered leader', 'A committee chair'];
  const rows = [
    ['Scout\u2019s first name',         'yes-partial', 'yes', 'yes', 'yes'],
    ['Scout\u2019s last name',          'no',          'opt', 'yes', 'yes'],
    ['Phone & address',                 'no',          'opt', 'yes', 'yes'],
    ['Photo (with parent consent)',     'opt',         'yes', 'yes', 'yes'],
    ['Allergies & dietary flags',       'no',          'opt', 'yes', 'yes'],
    ['YPT training status',             'no',          'yes', 'yes', 'yes'],
  ];
  const cell = (v) => {
    if (v === 'yes')         return { label: 'Yes',           bg: p.success, fg: '#fff' };
    if (v === 'yes-partial') return { label: 'First + initial', bg: p.success, fg: '#fff' };
    if (v === 'opt')         return { label: 'Opt-in',        bg: p.butter,  fg: p.ink };
    if (v === 'self')        return { label: 'Own family',    bg: p.skySoft, fg: p.primary };
    return                          { label: 'No',            bg: p.lineSoft, fg: p.inkMuted };
  };
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 1fr)', background: p.surfaceAlt, borderBottom: `1px solid ${p.line}` }}>
        <div style={{ padding: '14px 18px', fontSize: 11, color: p.inkMuted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Information</div>
        {cols.map((c, i) => (
          <div key={i} style={{ padding: '14px 12px', fontSize: 12, color: p.ink, fontWeight: 600, textAlign: 'center', borderLeft: `1px solid ${p.line}`, lineHeight: 1.3 }}>{c}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 1fr)', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
          <div style={{ padding: '14px 18px', fontSize: 14, color: p.ink, fontWeight: 500 }}>{r[0]}</div>
          {r.slice(1).map((v, j) => {
            const c = cell(v);
            return (
              <div key={j} style={{ padding: 12, borderLeft: `1px solid ${p.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, letterSpacing: '0.02em' }}>{c.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

window.SecurityCard = SecurityCard;
