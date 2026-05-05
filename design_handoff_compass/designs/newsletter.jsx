// Compass Auto-Newsletter — the "5-minute Sunday email" for busy scoutmasters
// Premise: Compass drafts the weekly digest from calendar/RSVP/photo/achievement data.
// Leader reviews, edits inline, hits send. Goes out every Sunday automatically.
// 4 artboards: schedule overview, draft review (the magic), automated reminders, recipient inbox preview.

const NL = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─── Shared chrome ───────────────────────────────────────────
const NLChrome = ({ p, T, children, active = 'newsletter' }) => (
  <div style={{ width: 1440, height: 900, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'grid', gridTemplateColumns: '220px 1fr' }}>
    {/* Sidebar */}
    <div style={{ background: p.surfaceDark, color: '#fff', padding: 20, fontSize: 13, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <SHMark size={22} color="#fff" accent={p.ember}/>
        <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>Compass</div>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Troop 567</div>
      {[
        { l: 'Dashboard', i: 'M3 12l2-2 7-7 7 7 2 2v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z' },
        { l: 'People', i: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
        { l: 'Calendar', i: 'M7 3v2M17 3v2M4 8h16 M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
        { l: 'Newsletter', i: 'M3 7l9 6 9-6 M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-9 6L3 7z', active: active === 'newsletter' },
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
    {children}
  </div>
);

const NLSubnav = ({ p, T, active }) => (
  <div style={{ borderBottom: `1px solid ${p.line}`, background: '#fff', padding: '0 28px', display: 'flex', alignItems: 'center', gap: 24, height: 48, fontSize: 13 }}>
    {[
      { k: 'schedule', l: 'Schedule', sub: 'next Sun · auto' },
      { k: 'drafts',   l: 'This week\'s draft', sub: '8 edits left' },
      { k: 'reminders',l: 'Reminders & rules', sub: '4 active' },
      { k: 'sent',     l: 'Sent', sub: '24 issues' },
    ].map((t, i) => (
      <div key={i} style={{
        padding: '14px 0', borderBottom: t.k === active ? `2px solid ${p.ember}` : '2px solid transparent',
        marginBottom: -1, display: 'flex', alignItems: 'baseline', gap: 8,
        color: t.k === active ? p.ink : p.inkSoft, fontWeight: t.k === active ? 600 : 500,
        cursor: 'pointer',
      }}>
        {t.l}
        <span style={{ fontSize: 11, color: p.inkMuted, fontWeight: 500 }}>{t.sub}</span>
      </div>
    ))}
  </div>
);

// ─── Artboard 1: Schedule overview — "what's going out automatically" ─────────
const NewsletterSchedule = () => {
  const p = NL.p(); const T = NL.T();
  return (
    <NLChrome p={p} T={T}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <NLSubnav p={p} T={T} active="schedule"/>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'flex-start' }}>
          {/* Left column */}
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Newsletter · Troop 567</div>
            <h1 style={{ fontFamily: T.display, fontSize: 38, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0, color: p.ink }}>
              Your weekly digest. <em style={{ color: p.ember, fontStyle: 'italic' }}>Mostly written for you.</em>
            </h1>
            <p style={{ fontSize: 15, color: p.inkSoft, margin: '10px 0 0', maxWidth: 580, lineHeight: 1.55 }}>
              Every Sunday at 7 PM, Compass drafts a newsletter from your week — events, RSVPs, photos, scout milestones. You spend 5 minutes reviewing it Sunday morning, hit send, done.
            </p>

            {/* Hero status card */}
            <div style={{
              marginTop: 24, padding: 24,
              background: '#fff', border: `1.5px solid ${p.ember}`,
              borderRadius: 14, position: 'relative',
              boxShadow: `0 0 0 4px ${p.ember}11`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: p.ember + '18', color: p.ember, borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: p.ember, animation: 'pulse 2s infinite' }}/>
                  Drafting now · ready Sun 7 AM
                </div>
                <div style={{ fontSize: 12, color: p.inkMuted }}>Issue #25 · "Week of Mar 15"</div>
              </div>
              <h2 style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, letterSpacing: '-0.015em', margin: '0 0 4px', color: p.ink }}>
                Spring Campout this Friday — and 3 other things this week.
              </h2>
              <p style={{ fontSize: 13, color: p.inkSoft, margin: 0, lineHeight: 1.55 }}>
                Compass found 4 stories worth telling: campout RSVPs (24/28 spots), Eli's Eagle BoR, a service event opening, and 14 new photos from last weekend's hike.
              </p>

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Review draft now →</button>
                <button style={{ background: 'transparent', color: p.ink, border: `1px solid ${p.line}`, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>Send as-is on Sunday</button>
                <button style={{ background: 'transparent', color: p.inkMuted, border: 'none', padding: '10px 8px', fontSize: 13, fontWeight: 500 }}>Skip this week</button>
              </div>
            </div>

            {/* Upcoming schedule strip */}
            <div style={{ marginTop: 32, fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Upcoming sends</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { d: 'Sun · Mar 15', sub: '7:00 PM CT · in 6 days', t: 'Weekly digest', kind: 'auto', n: '4 stories drafted' },
                { d: 'Wed · Mar 18', sub: '3:00 PM CT · in 9 days',  t: 'RSVP reminder · Spring Campout', kind: 'reminder', n: '4 families haven\'t answered' },
                { d: 'Sun · Mar 22', sub: '7:00 PM CT · in 13 days', t: 'Weekly digest', kind: 'auto', n: 'Will draft Sat morning' },
                { d: 'Mon · Mar 23', sub: 'after campout · auto',    t: 'Recap · Spring Campout', kind: 'recap', n: 'Triggers when 5+ photos uploaded' },
                { d: 'Sun · Mar 29', sub: '7:00 PM CT · in 20 days', t: 'Weekly digest', kind: 'auto', n: 'Next Eagle BoR coming up' },
              ].map((row, i) => (
                <ScheduleRow key={i} row={row} p={p} T={T}/>
              ))}
            </div>
          </div>

          {/* Right column — settings + brand */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="Default schedule" p={p} T={T}>
              <SettingRow p={p} l="Cadence" v="Every Sunday"/>
              <SettingRow p={p} l="Time" v="7:00 PM CT"/>
              <SettingRow p={p} l="Sender name" v="Eric Schulz · SM"/>
              <SettingRow p={p} l="Reply-to" v="schulz.eric@gmail.com"/>
              <SettingRow p={p} l="Pause weeks" v="Skip if &lt;2 stories"/>
            </Card>

            <Card title="Audience" p={p} T={T} action="Edit segments →">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { l: 'All troop families', n: 72, on: true },
                  { l: 'Adult leaders only',  n: 11, on: false },
                  { l: 'Patrol: Hawks',       n: 18, on: false },
                  { l: 'Eagle candidates',    n: 4,  on: false },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: 4,
                        background: s.on ? p.ember : 'transparent',
                        border: `1.5px solid ${s.on ? p.ember : p.line}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {s.on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 12l4 4L19 7"/></svg>}
                      </div>
                      <span style={{ color: s.on ? p.ink : p.inkSoft }}>{s.l}</span>
                    </div>
                    <span style={{ color: p.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Brand" p={p} T={T} action="Customize →">
              <div style={{ height: 92, background: p.surfaceDark, borderRadius: 8, padding: 14, color: '#fff', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SHMark size={18} color="#fff" accent={p.ember}/>
                  <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 500 }}>Troop 567</span>
                </div>
                <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 12 }}>The Weekly Trail Mix</div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {[p.ember, p.accent, p.teal, p.plum, p.surfaceDark].map((c, i) => (
                  <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: c, border: i === 0 ? `2px solid ${p.ink}` : '2px solid #fff', boxShadow: '0 0 0 1px ' + p.line }}/>
                ))}
              </div>
            </Card>

            <Card title="Last 6 weeks" p={p} T={T}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
                {[68, 71, 64, 73, 78, 76].map((v, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '100%', height: `${v - 50}%`, background: i === 5 ? p.ember : p.accent + '88', borderRadius: '3px 3px 0 0', position: 'relative' }}>
                      {i === 5 && <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: p.ember, fontWeight: 700 }}>{v}%</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
                <span style={{ fontSize: 11, color: p.inkMuted }}>Open rate</span>
                <span style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink }}>76%</span>
              </div>
              <div style={{ fontSize: 11, color: p.success, fontWeight: 600, marginTop: 2 }}>↑ 8 pts vs your old MailChimp list</div>
            </Card>
          </div>
        </div>
      </div>
    </NLChrome>
  );
};

const Card = ({ p, T, title, action, children }) => (
  <div style={{ background: '#fff', border: `1px solid ${p.line}`, borderRadius: 12, padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
      {action && <div style={{ fontSize: 11, color: p.accent, fontWeight: 600, cursor: 'pointer' }}>{action}</div>}
    </div>
    {children}
  </div>
);

const SettingRow = ({ p, l, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: `1px solid ${p.lineSoft}`, fontSize: 12 }}>
    <span style={{ color: p.inkMuted }}>{l}</span>
    <span style={{ color: p.ink, fontWeight: 500 }} dangerouslySetInnerHTML={{ __html: v }}/>
  </div>
);

const ScheduleRow = ({ row, p, T }) => {
  const tagColor = row.kind === 'auto' ? p.ember
                : row.kind === 'reminder' ? p.accent
                : p.teal;
  const tagLabel = row.kind === 'auto' ? 'Auto digest'
                : row.kind === 'reminder' ? 'Reminder'
                : 'Auto recap';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 110px 1fr auto', gap: 16, alignItems: 'center', padding: '12px 14px', background: '#fff', border: `1px solid ${p.lineSoft}`, borderRadius: 10 }}>
      <div>
        <div style={{ fontFamily: T.display, fontSize: 14, color: p.ink, fontWeight: 500 }}>{row.d}</div>
        <div style={{ fontSize: 11, color: p.inkMuted }}>{row.sub}</div>
      </div>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 5, padding: '3px 8px', background: tagColor + '18', color: tagColor, borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', width: 'fit-content' }}>
        <div style={{ width: 5, height: 5, borderRadius: 3, background: tagColor }}/>
        {tagLabel}
      </div>
      <div>
        <div style={{ fontSize: 13, color: p.ink, fontWeight: 500 }}>{row.t}</div>
        <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1 }}>{row.n}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  );
};

// ─── Artboard 2: Draft review — the killer feature ─────────────
// AI-drafted newsletter, leader reviews each "card", inline edits, accepts.
const NewsletterDraftReview = () => {
  const p = NL.p(); const T = NL.T();
  return (
    <NLChrome p={p} T={T}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <NLSubnav p={p} T={T} active="drafts"/>

        {/* Header strip */}
        <div style={{ padding: '20px 32px 16px', borderBottom: `1px solid ${p.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Issue #25 · 5 minutes left</div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', marginTop: 2 }}>Spring Campout this Friday — and 3 other things.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.inkSoft }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={p.success} strokeWidth="2.5"><path d="M5 12l4 4L19 7"/></svg>
              4 cards approved · 1 needs review
            </div>
            <button style={{ background: 'transparent', color: p.ink, border: `1px solid ${p.line}`, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Preview</button>
            <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>Approve & schedule send →</button>
          </div>
        </div>

        {/* Three-column workspace */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 320px', minHeight: 0 }}>
          {/* Left — story queue */}
          <div style={{ borderRight: `1px solid ${p.line}`, background: p.surface, padding: '16px 14px', overflow: 'auto' }}>
            <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Stories Compass found</div>
            {[
              { n: '01', t: 'Spring Campout · this Friday', sub: 'Calendar event · 24/28 RSVPs', src: 'Calendar', state: 'approved', active: false },
              { n: '02', t: 'Eli M. earns Eagle Scout', sub: 'BoR passed Mar 9 · scoutbook sync', src: 'Scoutbook', state: 'approved', active: false },
              { n: '03', t: 'Park cleanup needs 4 more', sub: 'Service event · Sat 9 AM', src: 'Calendar', state: 'review', active: true },
              { n: '04', t: '14 photos from Hartley Hike', sub: 'Uploaded by Mr. Patel · Sat', src: 'Photos', state: 'approved', active: false },
              { n: '05', t: 'Treasurer note · dues Q2', sub: 'Suggested by Compass', src: 'Suggestion', state: 'rejected', active: false },
              { n: '06', t: 'Welcome new scout: Theo R.', sub: 'Joined Mar 4', src: 'People', state: 'pending', active: false },
            ].map((s, i) => (
              <div key={i} style={{
                padding: '10px 12px', marginBottom: 6,
                background: s.active ? '#fff' : 'transparent',
                border: s.active ? `1.5px solid ${p.ember}` : `1px solid transparent`,
                borderRadius: 8, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: p.inkMuted, fontWeight: 600 }}>{s.n}</span>
                  <StoryStatus state={s.state} p={p}/>
                  <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 5px', background: p.bg, color: p.inkMuted, borderRadius: 3, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${p.lineSoft}` }}>{s.src}</span>
                </div>
                <div style={{ fontSize: 13, color: p.ink, fontWeight: 600, lineHeight: 1.3 }}>{s.t}</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
            <button style={{ width: '100%', background: 'transparent', border: `1px dashed ${p.line}`, color: p.inkMuted, fontSize: 12, padding: 10, borderRadius: 8, fontWeight: 600, marginTop: 6 }}>+ Add a story manually</button>
          </div>

          {/* Center — preview / edit a card */}
          <div style={{ overflow: 'auto', padding: '24px 32px', background: p.bg }}>
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              {/* Approved cards (collapsed previews) */}
              <CollapsedCard p={p} T={T} n="01" t="Spring Campout · this Friday"
                preview="The Spring Camporee at Tomahawk SR runs Fri May 15 — Sun May 17. **24 of 28 spots are taken.** RSVPs close Wed May 8. Bring sleeping bag, mess kit, Class A + B uniform. Pamphlets for Cooking and Camping merit badges available at Tuesday's meeting."
              />

              {/* Active card — being reviewed */}
              <ActiveCard p={p} T={T}/>

              <CollapsedCard p={p} T={T} n="02" t="Eli M. earns Eagle Scout"
                preview="**Eli Martinez passed his Eagle Board of Review on March 9** — our 34th Eagle since the troop chartered in 1962. Court of Honor is Sunday April 13 at 4 PM. Eli's project rebuilt the bird-watching boardwalk at Anderson Park."
                approved
              />

              <CollapsedCard p={p} T={T} n="04" t="14 photos from Hartley Hike"
                preview="Mr. Patel uploaded 14 photos from Saturday's Hartley Nature Center hike — 8 scouts, 4 miles, perfect 52° weather. **See the gallery →**"
                approved
              />
            </div>
          </div>

          {/* Right — inspector for active card */}
          <div style={{ borderLeft: `1px solid ${p.line}`, background: '#fff', padding: '20px 18px', overflow: 'auto' }}>
            <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Editing card 03</div>
            <div style={{ fontFamily: T.display, fontSize: 16, color: p.ink, fontWeight: 500, marginBottom: 16 }}>Park cleanup needs 4 more</div>

            {/* Source data */}
            <div style={{ padding: 12, background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Source data</div>
              <div style={{ fontSize: 12, color: p.ink, lineHeight: 1.5 }}>
                <div>📅 <strong>Anderson Park cleanup</strong></div>
                <div style={{ color: p.inkSoft, marginTop: 2 }}>Sat Mar 14 · 9 AM – 12 PM</div>
                <div style={{ color: p.inkSoft }}>Currently 6 RSVPs · need 10</div>
              </div>
            </div>

            {/* Tone selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, marginBottom: 6 }}>Tone</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 3, background: p.bg, borderRadius: 7 }}>
                {['Friendly', 'Direct', 'Urgent'].map((t, i) => (
                  <div key={i} style={{
                    padding: '6px 4px', textAlign: 'center', borderRadius: 5,
                    background: i === 0 ? '#fff' : 'transparent',
                    color: i === 0 ? p.ink : p.inkSoft,
                    fontSize: 12, fontWeight: i === 0 ? 600 : 500,
                    boxShadow: i === 0 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}>{t}</div>
                ))}
              </div>
            </div>

            {/* Length */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, marginBottom: 6 }}>Length</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 3, background: p.bg, borderRadius: 7 }}>
                {['Short', 'Medium', 'Long'].map((t, i) => (
                  <div key={i} style={{
                    padding: '6px 4px', textAlign: 'center', borderRadius: 5,
                    background: i === 1 ? '#fff' : 'transparent',
                    color: i === 1 ? p.ink : p.inkSoft,
                    fontSize: 12, fontWeight: i === 1 ? 600 : 500,
                    boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}>{t}</div>
                ))}
              </div>
            </div>

            {/* Include */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600, marginBottom: 6 }}>Include</div>
              {[
                { l: 'RSVP button', on: true },
                { l: 'Map preview', on: true },
                { l: 'Spots-left counter', on: true },
                { l: 'Photo from last cleanup', on: false },
              ].map((c, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: p.ink }}>
                  <div style={{
                    width: 28, height: 16, borderRadius: 8, padding: 2,
                    background: c.on ? p.ember : p.line,
                    display: 'flex', alignItems: 'center',
                    justifyContent: c.on ? 'flex-end' : 'flex-start',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: '#fff' }}/>
                  </div>
                  {c.l}
                </label>
              ))}
            </div>

            <button style={{ width: '100%', background: 'transparent', color: p.inkSoft, border: `1px solid ${p.line}`, padding: '8px', borderRadius: 7, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>↻ Regenerate copy</button>
            <button style={{ width: '100%', background: p.success, color: '#fff', border: 'none', padding: '10px', borderRadius: 7, fontSize: 13, fontWeight: 600 }}>✓ Approve card</button>
          </div>
        </div>
      </div>
    </NLChrome>
  );
};

const StoryStatus = ({ state, p }) => {
  const cfg = state === 'approved' ? { c: p.success, l: '✓' }
            : state === 'review'   ? { c: p.ember, l: '!' }
            : state === 'rejected' ? { c: p.inkMuted, l: '×' }
            : { c: p.accent, l: '?' };
  return (
    <div style={{ width: 14, height: 14, borderRadius: 7, background: cfg.c + '22', color: cfg.c, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {cfg.l}
    </div>
  );
};

const CollapsedCard = ({ p, T, n, t, preview, approved }) => (
  <div style={{
    background: '#fff', border: `1px solid ${p.line}`, borderRadius: 10,
    padding: '14px 18px', marginBottom: 10,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: p.inkMuted, fontWeight: 600 }}>{n}</span>
        <span style={{ fontSize: 13, color: p.ink, fontWeight: 600 }}>{t}</span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: p.success + '18', color: p.success, borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l4 4L19 7"/></svg>
        Approved
      </div>
    </div>
    <p style={{ fontSize: 12, color: p.inkSoft, lineHeight: 1.55, margin: 0, fontFamily: T.display, fontStyle: 'normal' }}
       dangerouslySetInnerHTML={{ __html: preview.replace(/\*\*(.*?)\*\*/g, `<strong style="color: ${p.ink}">$1</strong>`) }}/>
  </div>
);

const ActiveCard = ({ p, T }) => (
  <div style={{
    background: '#fff', border: `2px solid ${p.ember}`, borderRadius: 12,
    padding: 22, marginBottom: 10, boxShadow: `0 0 0 4px ${p.ember}11`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: p.inkMuted, fontWeight: 600 }}>03</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: p.ember + '18', color: p.ember, borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 8v4M12 16h.01"/></svg>
          Reviewing
        </div>
      </div>
      <div style={{ fontSize: 11, color: p.accent, fontWeight: 600, cursor: 'pointer' }}>↻ Try a different version</div>
    </div>

    {/* Generated body — with one phrase being inline-edited */}
    <h3 style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', margin: '0 0 6px', color: p.ink }}>
      Park cleanup needs 4 more hands.
    </h3>
    <p style={{ fontSize: 14, color: p.inkSoft, margin: '0 0 14px', lineHeight: 1.6 }}>
      Saturday morning, our troop is helping clean up Anderson Park before the spring season opens.{' '}
      <span style={{
        background: p.ember + '1f',
        outline: `1.5px solid ${p.ember}`,
        outlineOffset: 0,
        padding: '0 3px',
        borderRadius: 2,
        position: 'relative',
      }}>
        We've got 6 scouts so far — looking for 4 more to make it a real crew.
        <span style={{
          position: 'absolute', top: -22, left: 0,
          padding: '2px 7px', background: p.ember, color: '#fff',
          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          borderRadius: 3, whiteSpace: 'nowrap',
        }}>You · editing</span>
      </span>
      {' '}It's a great service hour for rank advancement.
    </p>

    <div style={{ background: p.bg, border: `1px solid ${p.lineSoft}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 8, fontSize: 12 }}>
        <div style={{ color: p.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>When</div>
        <div style={{ color: p.ink }}>Sat March 14 · 9:00 AM – 12:00 PM</div>
        <div style={{ color: p.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Where</div>
        <div style={{ color: p.ink }}>Anderson Park · meet at the south parking lot</div>
        <div style={{ color: p.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bring</div>
        <div style={{ color: p.ink }}>Work gloves, water bottle, sturdy shoes</div>
      </div>
    </div>

    {/* Counter + button */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>I'll be there →</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 70, height: 6, background: p.lineSoft, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: '60%', height: '100%', background: p.ember }}/>
        </div>
        <div style={{ fontSize: 11, color: p.inkSoft }}><strong style={{ color: p.ink }}>6 of 10</strong> · need 4 more</div>
      </div>
    </div>
  </div>
);

// ─── Artboard 3: Reminders & rules ──────────────────────────────
// "Set it once, runs forever" rules.
const NewsletterReminders = () => {
  const p = NL.p(); const T = NL.T();
  return (
    <NLChrome p={p} T={T}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <NLSubnav p={p} T={T} active="reminders"/>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Automation rules</div>
              <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '4px 0 0', color: p.ink }}>
                Set it once. <em style={{ color: p.ember }}>Runs forever.</em>
              </h1>
            </div>
            <button style={{ background: p.ink, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>+ New rule</button>
          </div>
          <p style={{ fontSize: 14, color: p.inkSoft, maxWidth: 580, lineHeight: 1.55, margin: '6px 0 24px' }}>
            Reminders that fire on their own — no Sunday-night scrambles, no "did anyone email about the campout?" texts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <RuleCard
              p={p} T={T}
              icon="⏰"
              title="RSVP nudge · 7 days before"
              desc="Email scouts who haven't RSVP'd to any event with a sign-up deadline this week."
              fires="Every day at 3 PM"
              last="Sent Wed · 4 reminders fired"
              audience="Unresponded only · 4 of 72 families"
              on
            />
            <RuleCard
              p={p} T={T}
              icon="💳"
              title="Dues reminder · 14 / 7 / 1 days"
              desc="Three escalating nudges before quarterly dues hit. Stops automatically when paid."
              fires="14, 7, and 1 day before due"
              last="Q1 collected: 70/72 paid"
              audience="Owe-balance only"
              on
            />
            <RuleCard
              p={p} T={T}
              icon="📸"
              title="Auto recap · after major events"
              desc="When 5+ photos are uploaded within 48 hrs of a campout, send a recap with highlights."
              fires="2 days after campouts"
              last="Recap sent for Hartley Hike"
              audience="All families"
              on
            />
            <RuleCard
              p={p} T={T}
              icon="🦅"
              title="Eagle Court of Honor invite"
              desc="When a scout passes BoR, schedule a CoH invite 30 days out. Track RSVPs."
              fires="On Scoutbook BoR pass"
              last="Eli M. · 23 of 72 RSVP'd"
              audience="All troop families + extended family list"
              on
            />
            <RuleCard
              p={p} T={T}
              icon="🆕"
              title="Welcome new families · 3-day onboarding"
              desc="When a scout joins, drip 3 emails over a week: welcome, what to bring, intro to leadership."
              fires="On scout join"
              last="Theo R. · in day 3 of 3"
              audience="New scout's family"
              on
            />
            <RuleCard
              p={p} T={T}
              icon="💤"
              title="Re-engage quiet scouts"
              desc="If a scout misses 3 meetings in a row, send a personal-feeling note from the SM."
              fires="After 3 missed meetings"
              last="Triggered · paused 1 family at SM request"
              audience="Quiet scouts only"
              off
            />
          </div>

          {/* Suggested rules */}
          <div style={{ marginTop: 36 }}>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Suggested by Compass</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { i: '🎂', t: 'Birthday shoutouts', d: 'Friendly note in the Sunday digest on a scout\'s birthday week.' },
                { i: '🏕', t: 'Pre-campout packing list', d: 'Send the packing list 5 days before any campout. Auto-pulled from event detail.' },
                { i: '📋', t: 'BSA medical form expiry', d: 'Annual reminder 30 days before each scout\'s medical form expires.' },
              ].map((s, i) => (
                <div key={i} style={{ background: '#fff', border: `1px dashed ${p.line}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{s.i}</div>
                  <div style={{ fontSize: 13, color: p.ink, fontWeight: 600, marginBottom: 4 }}>{s.t}</div>
                  <div style={{ fontSize: 11, color: p.inkSoft, lineHeight: 1.5 }}>{s.d}</div>
                  <button style={{ marginTop: 10, background: 'transparent', color: p.accent, border: `1px solid ${p.accent}`, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Turn on</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </NLChrome>
  );
};

const RuleCard = ({ p, T, icon, title, desc, fires, last, audience, on, off }) => (
  <div style={{
    background: '#fff', border: `1px solid ${off ? p.lineSoft : p.line}`,
    borderRadius: 12, padding: 18, opacity: off ? 0.7 : 1,
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 14, color: p.ink, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 1 }}>Fires: {fires}</div>
        </div>
      </div>
      {/* Toggle */}
      <div style={{
        width: 32, height: 18, borderRadius: 9, padding: 2,
        background: on ? p.success : p.line,
        display: 'flex', alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: '#fff' }}/>
      </div>
    </div>
    <p style={{ fontSize: 12, color: p.inkSoft, margin: '4px 0 12px', lineHeight: 1.5 }}>{desc}</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, paddingTop: 10, borderTop: `1px solid ${p.lineSoft}` }}>
      <div>
        <div style={{ color: p.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Last run</div>
        <div style={{ color: p.ink, marginTop: 2 }}>{last}</div>
      </div>
      <div>
        <div style={{ color: p.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Audience</div>
        <div style={{ color: p.ink, marginTop: 2 }}>{audience}</div>
      </div>
    </div>
  </div>
);

// ─── Artboard 4: Recipient inbox preview — Sunday morning ────────
// Shows what a parent sees in their phone Inbox.
const NewsletterRecipientView = () => {
  const p = NL.p(); const T = NL.T();
  return (
    <IOSDevice width={402} height={874} title="Mail · Inbox">
      <div style={{ background: '#f2f2f7', minHeight: '100%', fontFamily: T.ui }}>
        <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f2f2f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 17, color: '#007aff' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            Inbox
          </div>
          <div style={{ display: 'flex', gap: 16, color: '#007aff' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h6l3-9 6 18 3-9h3"/></svg>
          </div>
        </div>

        <div style={{ background: '#fff' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5ea' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#000', margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
              The Weekly Trail Mix · #25
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11 }}>ES</div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ color: '#000' }}><strong>Eric Schulz</strong> · Troop 567</div>
                <div style={{ color: '#8e8e93', fontSize: 11 }}>Sunday 7:02 AM · via Compass</div>
              </div>
            </div>
          </div>

          {/* Branded header */}
          <div style={{ background: p.surfaceDark, color: '#fff', padding: '24px 20px', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SHMark size={20} color="#fff" accent={p.ember}/>
                <span style={{ fontFamily: T.display, fontSize: 14, fontWeight: 500 }}>Troop 567</span>
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Issue · 25</span>
            </div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', marginTop: 16, lineHeight: 1.2 }}>
              The Weekly Trail Mix
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4, fontStyle: 'italic', fontFamily: T.display }}>Week of March 15</div>
          </div>

          {/* Hero promo */}
          <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${p.lineSoft}` }}>
            <div style={{ fontSize: 10, color: p.ember, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Top story</div>
            <h2 style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.2, margin: 0, color: p.ink }}>
              Spring Campout this Friday — and 3 other things this week.
            </h2>
            <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55, margin: '10px 0 0' }}>
              Hi Troop 567 families — quick rundown of the week ahead. Tap any card to RSVP or learn more. — Eric
            </p>
          </div>

          {/* Story 1 */}
          <ItemRow p={p} T={T}
            tag="Campout · 3 days"
            tagColor={p.ember}
            title="Spring Campout · Tomahawk SR"
            sub="Fri May 15 → Sun May 17 · $45/scout"
            body="24 of 28 spots taken — a few left for late deciders. RSVPs close Wed."
            cta="RSVP & pay $45 →"
            counter="14 going · 10 spots left"
          />

          {/* Story 2 */}
          <ItemRow p={p} T={T}
            tag="Achievement"
            tagColor={p.raspberry}
            title="🦅 Eli M. earns Eagle"
            sub="Board of Review passed Mar 9"
            body="Our 34th Eagle since 1962. Court of Honor April 13."
            cta="Add CoH to my calendar →"
          />

          {/* Story 3 */}
          <ItemRow p={p} T={T}
            tag="Service · 4 needed"
            tagColor={p.teal}
            title="Park cleanup needs 4 more hands"
            sub="Sat Mar 14 · 9 AM – 12 PM · Anderson Park"
            body="6 scouts so far. It's a great service hour for rank advancement."
            cta="I'll be there →"
            counter="6 of 10 going"
          />

          {/* Story 4 — photos */}
          <div style={{ padding: '20px', borderBottom: `1px solid ${p.lineSoft}` }}>
            <div style={{ fontSize: 10, color: p.accent, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Last weekend · 14 photos</div>
            <h3 style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 10px', color: p.ink }}>Hartley Hike — perfect 52° weather.</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 12 }}>
              {[p.teal, p.ember, p.plum, p.accent, p.raspberry, p.mustard].map((c, i) => (
                <div key={i} style={{ aspectRatio: '1/1', background: `linear-gradient(135deg, ${c}, ${c}99)`, borderRadius: 4, position: 'relative' }}>
                  {i === 5 && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: T.display, fontSize: 14, fontWeight: 500 }}>+8</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>See the gallery →</div>
          </div>

          {/* Sign-off */}
          <div style={{ padding: '24px 20px', background: p.bg }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: p.plum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>ES</div>
              <div>
                <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 500, color: p.ink, fontStyle: 'italic' }}>"See you Tuesday at 7 PM."</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 4 }}>Eric Schulz · Scoutmaster</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 20px 24px', borderTop: `1px solid ${p.lineSoft}`, fontSize: 10, color: p.inkMuted, lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <SHMark size={11} color={p.inkMuted} accent={p.ember}/>
              <span>Sent via <strong style={{ color: p.inkSoft }}>Compass</strong> · troop567.compass.app</span>
            </div>
            <div style={{ marginBottom: 4 }}>72 troop families · your address stays private (each gets a personal copy).</div>
            <div>
              <span style={{ color: p.accent, fontWeight: 600 }}>Manage notifications</span>
              <span style={{ margin: '0 5px' }}>·</span>
              <span style={{ color: p.accent, fontWeight: 600 }}>Unsubscribe</span>
            </div>
          </div>
        </div>
      </div>
    </IOSDevice>
  );
};

const ItemRow = ({ p, T, tag, tagColor, title, sub, body, cta, counter }) => (
  <div style={{ padding: '20px', borderBottom: `1px solid ${p.lineSoft}` }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: tagColor + '18', color: tagColor, borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
      <div style={{ width: 4, height: 4, borderRadius: 2, background: tagColor }}/>
      {tag}
    </div>
    <h3 style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', margin: 0, color: p.ink, lineHeight: 1.2 }}>{title}</h3>
    <div style={{ fontSize: 12, color: p.inkMuted, fontFamily: T.display, fontStyle: 'italic', marginTop: 3 }}>{sub}</div>
    <p style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55, margin: '10px 0 12px' }}>{body}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <a style={{ display: 'inline-block', textDecoration: 'none', background: p.ink, color: '#fff', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>{cta}</a>
      {counter && <div style={{ fontSize: 11, color: p.inkMuted }}>{counter}</div>}
    </div>
  </div>
);

window.NewsletterSchedule = NewsletterSchedule;
window.NewsletterDraftReview = NewsletterDraftReview;
window.NewsletterReminders = NewsletterReminders;
window.NewsletterRecipientView = NewsletterRecipientView;
