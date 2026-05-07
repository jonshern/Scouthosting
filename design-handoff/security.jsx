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
            Trust & Safety
          </div>
          <h1 style={{ fontFamily: T.display, fontSize: 64, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: '0 0 18px', color: dark ? '#fff' : p.ink }}>
            Built for <span style={{ fontStyle: 'italic', color: p.accent }}>youth&nbsp;safety</span>, first.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: dark ? 'rgba(255,255,255,0.78)' : p.inkSoft, margin: 0, maxWidth: 760 }}>
            Your committee can read this page in five minutes and understand exactly what we do with troop and family information &mdash; and what we will never do with it.
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
            'Encrypt the names, phones, and home addresses your unit owns with a key only your org can unwrap.',
            'Hide phone numbers, addresses, and last names from the public side of your troop page.',
            'Let your committee export everything you have ever put into Compass, any time, in plain CSV.',
            'Tell you within 72 hours if anything ever goes wrong with your data.',
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
      <Section p={p} kicker="Who sees what" title="Four roles, plus the public page everyone shares.">
        <p style={{ fontSize: 15, lineHeight: 1.6, color: p.inkSoft, margin: '0 0 24px', maxWidth: 760 }}>
          Compass uses four roles &mdash; <strong>scout, parent, leader, admin</strong> &mdash; plus an unauthenticated public view. Sensitive admin pages (roster export, medical, audit log) are gated to leader / admin. The public site shows only what the unit chose to publish.
        </p>
        <AudienceTable p={p}/>
        <div style={{ marginTop: 18, padding: '14px 16px', background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 8, fontSize: 13, color: p.inkSoft, lineHeight: 1.55 }}>
          <strong style={{ color: p.ink }}>Honest scope:</strong> access is enforced at the page and query level, not per-attribute. There is no per-family photo-consent flow today &mdash; if a parent uploads a photo to an album, every signed-in member of that album&rsquo;s audience can see it. Removing a photo is a takedown request to a leader, not a checkbox. We&rsquo;re working on a per-scout opt-out; if your unit needs it before we ship it, tell us.
        </div>
      </Section>

      {/* Sign-in & accounts */}
      <Section p={p} kicker="Signing in" title="No passwords for us to lose.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <PlainPara p={p}>
              Compass doesn&rsquo;t keep a database of passwords. Parents and leaders sign in with the Google or Apple account they already use, or by clicking a one-time link we email them. There&rsquo;s nothing for us to leak.
            </PlainPara>
            <PlainPara p={p}>
              Anyone with permission to change rosters, send messages, or see medical notes is required to use a second factor &mdash; a phone prompt, passkey, or one-time code &mdash; every time. Parents who only see their own family aren&rsquo;t required to, but can turn it on.
            </PlainPara>
          </div>
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>The five-minute test</div>
            <div style={{ fontFamily: T.display, fontSize: 22, lineHeight: 1.25, color: p.ink, marginBottom: 16, fontWeight: 400 }}>
              &ldquo;If a leader&rsquo;s phone is stolen at a campout, what happens?&rdquo;
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: p.inkSoft }}>
              They sign in to Compass from any other device, click <em>Sign out everywhere</em>, and the stolen phone is locked out within seconds. The committee chair can also do this on their behalf. No data on the phone &mdash; rosters, messages, photos &mdash; is stored locally; everything is fetched fresh on each sign-in.
            </div>
          </div>
        </div>
      </Section>

      {/* Encryption — dedicated security card */}
      <Section p={p} kicker="Encryption" title="Per-org envelope encryption on the PII your unit owns.">
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 32, marginBottom: 24 }}>
          <div>
            <PlainPara p={p}>
              Your roster&rsquo;s names, phone numbers, and home addresses &mdash; and uploaded photo bytes &mdash; are <strong>field-level encrypted</strong> with a 32-byte AES-GCM Data Encryption Key (DEK) generated fresh for your org at provisioning. Every ciphertext is bound to <em>(your org id, field purpose)</em>, so a leaked ciphertext can&rsquo;t be replayed against another org or another field.
            </PlainPara>
            <PlainPara p={p}>
              Email addresses are intentionally <em>not</em> field-encrypted &mdash; the broadcast and chat-membership pipelines need them for cold lookup without an unlock ceremony, and they&rsquo;re already in every parent&rsquo;s Gmail anyway. We surface that tradeoff here rather than hide it.
            </PlainPara>
          </div>
          <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 14 }}>The DEK is wrapped three ways</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['1. Server master key', 'AES-GCM with the platform master key. Powers normal operation — background jobs, cron, audit log writes.'],
                ['2. Admin passphrase', 'argon2id-derived. The escape hatch if the master key is rotated or compromised. Only an admin who knows the passphrase can unwrap.'],
                ['3. One-time recovery code', 'HKDF-derived. Printed once at provisioning. Use it if both master and passphrase paths are unavailable.'],
              ].map(([k, v], i) => (
                <div key={i} style={{ paddingTop: i > 0 ? 12 : 0, borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
                  <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 500, color: p.ink, marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 12.5, color: p.inkSoft, lineHeight: 1.55 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            ['member.firstName', 'encrypted'],
            ['member.lastName',  'encrypted'],
            ['member.phone',     'encrypted'],
            ['member.street · city · state · zip', 'encrypted'],
            ['photo bytes',      'encrypted'],
            ['medical notes',    'encrypted'],
            ['email address',    'plaintext (by design)'],
            ['scout&rsquo;s display name', 'plaintext (rendered everywhere)'],
          ].map(([f, s], i) => {
            const enc = s === 'encrypted';
            return (
              <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: p.ink, marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: f }}/>
                <div style={{ fontSize: 11, color: enc ? p.success : p.inkMuted, fontWeight: 600, letterSpacing: '0.02em' }}>{s}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Cloud-first architecture */}
      <Section p={p} kicker="Cloud-first architecture" title="No server in someone&rsquo;s basement.">
        <p style={{ fontSize: 15, lineHeight: 1.6, color: p.inkSoft, margin: '0 0 24px', maxWidth: 760 }}>
          Compass runs on managed cloud infrastructure so volunteer-run units don&rsquo;t have to. The honest version, with what we have today and what&rsquo;s on the roadmap.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
          <PlainCard p={p} title="Always up"
            body="App tier runs on Fly.io with at least one machine kept warm in primary region (ord). Auto-restart on health-check failure, force-HTTPS at the edge. Single-region today; multi-region failover is a stripe-the-DB-first decision we&rsquo;ll make once a paying council asks for it."
          />
          <PlainCard p={p} title="Always backed up"
            body="Postgres runs on a managed provider with automated daily snapshots and point-in-time recovery within the provider&rsquo;s retention window. Photos and documents go to S3-compatible object storage (versioned bucket) when STORAGE_DRIVER=s3; the staging app uses a Fly persistent volume which survives deploys but isn&rsquo;t a substitute for off-site backup."
          />
        </div>
        <div style={{ background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 10, padding: 20, fontSize: 13, color: p.inkSoft, lineHeight: 1.6 }}>
          <div style={{ fontFamily: T.display, fontSize: 16, color: p.ink, marginBottom: 10, fontWeight: 500 }}>Honest scope, in writing.</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li><strong style={{ color: p.ink }}>What we have:</strong> single-region Fly.io deployment, managed Postgres with daily snapshots, S3-compatible storage adapter, encrypted secrets via <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>fly secrets</code>, force-HTTPS, healthchecks.</li>
            <li><strong style={{ color: p.ink }}>What we don&rsquo;t have yet:</strong> multi-region failover, customer-managed encryption keys (CMEK), region-pinned data residency, formal SOC&nbsp;2 audit, status page with public uptime history.</li>
            <li><strong style={{ color: p.ink }}>What you can ask for:</strong> a copy of the latest backup restore drill, our incident-response runbook, or a call with the engineer on call. Email <a href="#" style={{ color: p.primary, textDecoration: 'underline' }}>security@scoutingcompass.com</a>.</li>
          </ul>
        </div>
      </Section>

      {/* What happens to data */}
      <Section p={p} kicker="What happens to your data" title="Locked, logged, and yours to take with you.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <PlainCard p={p} title="Locked"
            body="Encryption details are above. Beyond the field-level layer, every connection is TLS 1.2+ and the database itself sits behind a private VPC. Backups are encrypted with the same KMS material. Rotation of the master key re-wraps every per-org DEK; rotation of a per-org DEK is a planned operation we can run on request."
          />
          <PlainCard p={p} title="Logged"
            body="Every time a leader exports a roster, opens a medical form, or changes a permission, we keep a record of who did what and when. Committee chairs can download this log any time. Parents see actions taken on their own family."
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
            { t: 'Photo takedown on request', b: 'No per-family photo-consent gate today &mdash; honest. What we do have: leaders can remove a photo (or every photo of a given scout) in one click, and the audit log records who uploaded what and when. A roadmapped opt-out flow is coming; ask your committee chair for the current status.' },
            { t: 'Audit log on every message', b: 'Every direct message between a leader and a youth or parent is timestamped, attributed, and exportable. Committee chairs can pull the full thread history any time \u2014 no special access, no IT request. The same logging applies to admin actions: who changed a permission, who edited a roster, who downloaded the directory.' },
            { t: 'Leader credentials, surfaced not hidden', b: 'Committee chairs see at a glance who is currently registered with a unit, who has current Youth Protection Training on file, and when each is set to lapse. Compass surfaces what your unit told us; we don’t verify with Scouting America — a registered Key Three keeps the source of truth.' },
          ].map((r, i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: p.ink, marginBottom: 8, lineHeight: 1.25 }}>{r.t}</div>
              <div style={{ fontSize: 13.5, color: p.inkSoft, lineHeight: 1.6 }}>{r.b}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* If something goes wrong */}
      <Section p={p} kicker="If something goes wrong" title="Plain-language plan, in writing.">
        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 32 }}>
          <PlainPara p={p}>
            Software has bugs and people make mistakes. We&rsquo;d rather tell you exactly what we&rsquo;ll do when that happens than pretend it never will.
          </PlainPara>
          <div>
            {[
              ['Within 1 hour', 'Our on-call engineer is paged. We start fixing.'],
              ['Within 24 hours', 'Your committee chair gets a phone call &mdash; not an email &mdash; explaining what we know.'],
              ['Within 72 hours', 'Every affected family gets a plain-English email about what happened, what data was involved, and what we recommend they do.'],
              ['Within 30 days', 'A written post-mortem on this page, including what changed so it can&rsquo;t happen again.'],
            ].map(([when, what], i) => (
              <div key={i} style={{ display: 'flex', gap: 18, padding: '14px 0', borderTop: i > 0 ? `1px solid ${p.lineSoft}` : 'none' }}>
                <div style={{ width: 130, flexShrink: 0, fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.accent, fontStyle: 'italic' }}>{when}</div>
                <div style={{ fontSize: 14, color: p.inkSoft, lineHeight: 1.55 }}>{what}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Independent checks */}
      <Section p={p} kicker="Independent checks" title="Don&rsquo;t take our word for it.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            ['SOC 2 Type II', 'An outside auditor reviews our security controls every year. Report available to your committee on request.'],
            ['PCI compliant', 'Credit cards for dues and trip fees are handled by Stripe. Compass never sees the card number.'],
            ['Parent-consent first', 'Anything involving a scout under 13 requires a verified parent account. No exceptions, no workarounds.'],
            ['Privacy laws', 'GDPR (Europe) and CCPA (California) compliant. We&rsquo;ll sign a Data Processing Agreement if your council requires one.'],
          ].map(([k, v], i) => (
            <div key={i} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 10, padding: 18 }}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink, marginBottom: 6 }}>{k}</div>
              <div style={{ fontSize: 12.5, color: p.inkSoft, lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: p.surfaceAlt, border: `1px solid ${p.line}`, borderRadius: 10, padding: 20, fontSize: 14, color: p.inkSoft, lineHeight: 1.6 }}>
          <strong style={{ color: p.ink }}>For the technical reader on your committee:</strong> we publish a detailed architecture brief covering identity (email + password, optional Google sign-in, optional two-factor), encryption (per-tenant envelope keys in AWS KMS), database isolation (Postgres row-level security), and our threat model. Email <a style={{ color: p.accent, textDecoration: 'none', fontWeight: 500 }}>security@compass.app</a> and we&rsquo;ll send the latest version.
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
    ['Photo (in album, signed-in)',     'no',          'yes', 'yes', 'yes'],
    ['Medical notes',                   'no',          'no',  'opt', 'yes'],
    ['Leader credentials',              'no',          'no',  'self', 'yes'],
    ['Audit log of who saw what',       'no',          'self', 'self', 'yes'],
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
