// Compass — In-app Feedback & Support hub
//
// Pattern lifted from TroopWebHost (which does this well) but executed cleanly:
// • Public roadmap board — Submitted / Triaged / Building / Shipped
// • Vote/second on requests so we see real demand signal
// • Submit your own request inline
// • Separate Support panel for "I'm stuck right now" issues with real ticket form
// • Filter by category, search, your-troop-only toggle
//
// Two artboards:
//   1. Feedback board (the public list — voting, statuses)
//   2. New request composer (modal-style, inline category + scope picker)

const FB = {
  p: () => window.SH_PALETTES.balanced,
  T: () => window.SH_TYPE,
};

// ─── Artboard 1: Feedback board ──────────────────────────────
const FeedbackBoard = () => {
  const p = FB.p(); const T = FB.T();

  const requests = [
    {
      id: 247, status: 'building', votes: 142, mine: false, you: true,
      title: 'Recurring events that auto-skip school holidays',
      cat: 'Calendar',
      desc: 'Our weekly meeting takes a break for spring break, Thanksgiving, and Christmas. Right now I have to manually delete those occurrences. The calendar should know our school district\'s calendar and skip them.',
      author: 'Sarah K · Troop 412 · Austin TX',
      date: '3 weeks ago',
      comments: 18,
      lastUpdate: 'Started build · ETA late April · Eng note: pulling US school calendars from CDC dataset, troop picks district',
    },
    {
      id: 312, status: 'triaged', votes: 89, mine: true, you: true,
      title: 'Bulk-mark RSVPs for scouts who showed up but didn\'t respond',
      cat: 'Events',
      desc: 'Half my scouts forget to RSVP and just show up. After the campout I want to bulk-mark them as "attended" without going through 30 individual checkboxes.',
      author: 'You · Troop 567 New Hope',
      date: '5 days ago',
      comments: 7,
      lastUpdate: 'Triaged · queued for May. We\'re thinking a post-event "who showed up?" prompt.',
    },
    {
      id: 198, status: 'shipped', votes: 234, mine: false,
      title: 'iCal feed so events sync to family Google/Apple calendars',
      cat: 'Calendar',
      desc: 'Parents shouldn\'t have to manually re-add troop events to their personal calendars. Compass should publish a per-troop iCal subscription URL.',
      author: 'Mike R · Troop 88 · Denver CO',
      date: '2 months ago',
      comments: 31,
      lastUpdate: 'Shipped Mar 12 · find it under Settings → Calendar feed',
    },
    {
      id: 301, status: 'submitted', votes: 67, mine: false,
      title: 'Two-deep enforcement on phone calls (not just messaging)',
      cat: 'Safety',
      desc: 'YPT requires two-deep on phone calls too. Compass should let leaders log call-with-scout events with a second adult attested, just like the messaging flow.',
      author: 'Janet T · Troop 1990 · Portland OR',
      date: '1 week ago',
      comments: 4,
      lastUpdate: null,
    },
    {
      id: 289, status: 'building', votes: 118, mine: false, you: true,
      title: 'Print-friendly roster with merit badge progress',
      cat: 'Members',
      desc: 'For Court of Honor I print a packet for each scout. Need a one-page-per-scout PDF with their photo, rank, partials, and merit badge progress, formatted for a binder.',
      author: 'David L · Troop 567 New Hope',
      date: '6 weeks ago',
      comments: 22,
      lastUpdate: 'In design · sharing layout drafts in #scoutmasters Slack this Friday',
    },
    {
      id: 156, status: 'triaged', votes: 54, mine: false,
      title: 'Scoutbook sync: pull rank advancement automatically',
      cat: 'Integrations',
      desc: 'Right now I export from Scoutbook and import to Compass. The two should just talk to each other.',
      author: 'Amy B · Troop 24 · Chicago IL',
      date: '3 weeks ago',
      comments: 14,
      lastUpdate: 'Triaged · waiting on Scoutbook API access (we\'ve applied)',
    },
    {
      id: 223, status: 'submitted', votes: 32, mine: false,
      title: 'Spanish-language version of family-facing emails',
      cat: 'Communications',
      desc: '40% of our pack speaks Spanish at home. The English-only digest is a real adoption barrier.',
      author: 'Carlos M · Pack 309 · El Paso TX',
      date: '2 weeks ago',
      comments: 9,
      lastUpdate: null,
    },
    {
      id: 178, status: 'shipped', votes: 412, mine: false,
      title: 'AI-drafted weekly digest from calendar + photos',
      cat: 'Communications',
      desc: 'Writing the Sunday newsletter takes 2+ hours every week. The data is all in Compass already. Why am I rewriting it into an email?',
      author: 'Original idea · Troop 88',
      date: '4 months ago',
      comments: 67,
      lastUpdate: 'Shipped Feb 28 · Auto-newsletter (Troop + AI tier)',
    },
  ];

  const STATUS_META = {
    submitted: { label: 'Submitted',   color: p.inkMuted, bg: '#f1efe7', dot: p.inkMuted },
    triaged:   { label: 'Triaged',     color: '#7a5a1a',  bg: '#fef4e2', dot: '#c9892a' },
    building:  { label: 'Building',    color: '#2d5836',  bg: '#dceadd', dot: p.success },
    shipped:   { label: 'Shipped',     color: p.bg,       bg: p.surfaceDark, dot: '#9bd0a8' },
  };

  const counts = {
    submitted: requests.filter(r => r.status === 'submitted').length,
    triaged:   requests.filter(r => r.status === 'triaged').length,
    building:  requests.filter(r => r.status === 'building').length,
    shipped:   requests.filter(r => r.status === 'shipped').length,
  };

  return (
    <div style={{ width: 1440, height: 1100, background: p.bg, fontFamily: T.ui, color: p.ink, display: 'grid', gridTemplateColumns: '240px 1fr' }}>
      {/* Left rail (admin nav stub) */}
      <div style={{ background: '#fff', borderRight: `1px solid ${p.line}`, padding: '24px 16px' }}>
        <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, color: p.ink, padding: '4px 8px 18px', letterSpacing: '-0.01em' }}>
          Compass <span style={{ color: p.inkMuted, fontSize: 11, fontWeight: 400, marginLeft: 4 }}>Troop 567</span>
        </div>
        {[
          ['Dashboard', false],
          ['Calendar', false],
          ['People', false],
          ['Communications', false],
          ['Site editor', false],
          ['Photos', false],
          ['Settings', false],
          ['—', null],
          ['Feedback & roadmap', true],
          ['Get help', false],
        ].map(([label, active], i) => (
          label === '—' ? (
            <div key={i} style={{ height: 1, background: p.lineSoft, margin: '12px 8px' }}></div>
          ) : (
            <div key={i} style={{
              padding: '7px 10px', borderRadius: 6, fontSize: 13,
              color: active ? p.ember : p.inkSoft,
              background: active ? p.ember + '12' : 'transparent',
              fontWeight: active ? 600 : 400, marginBottom: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{label}</span>
              {label === 'Feedback & roadmap' && (
                <span style={{ fontSize: 10, fontWeight: 700, color: p.ember, fontFamily: 'JetBrains Mono, monospace' }}>NEW</span>
              )}
            </div>
          )
        ))}
      </div>

      {/* Main */}
      <div style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '28px 36px 20px', background: '#fff', borderBottom: `1px solid ${p.lineSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Public roadmap</div>
              <h1 style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '6px 0 0', color: p.ink }}>
                <em style={{ color: p.ember, fontStyle: 'italic' }}>What gets built next</em> is up to you.
              </h1>
              <p style={{ fontSize: 14, color: p.inkSoft, margin: '8px 0 0', maxWidth: 640, lineHeight: 1.55 }}>
                Every Compass feature started as a request from a real troop. Vote on what matters, watch it ship, request what's missing. We read every one and reply within a week.
              </p>
            </div>
            <button style={{ background: p.ember, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 0 rgba(0,0,0,0.08)' }}>
              + Suggest a feature
            </button>
          </div>

          {/* Status pills row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            {[
              { key: 'all', label: 'All', count: requests.length, active: true },
              { key: 'submitted', label: STATUS_META.submitted.label, count: counts.submitted },
              { key: 'triaged', label: STATUS_META.triaged.label, count: counts.triaged },
              { key: 'building', label: STATUS_META.building.label, count: counts.building },
              { key: 'shipped', label: STATUS_META.shipped.label, count: counts.shipped },
            ].map((tab) => (
              <div key={tab.key} style={{
                padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                border: `1px solid ${tab.active ? p.ink : p.line}`,
                background: tab.active ? p.ink : 'transparent',
                color: tab.active ? '#fff' : p.inkSoft,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{tab.label}</span>
                <span style={{ fontSize: 11, color: tab.active ? 'rgba(255,255,255,0.6)' : p.inkMuted, fontFamily: 'JetBrains Mono, monospace' }}>{tab.count}</span>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${p.line}`, borderRadius: 8, fontSize: 12, color: p.inkSoft, background: '#fff' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
                <span style={{ color: p.inkMuted }}>Search…</span>
              </div>
              <div style={{ padding: '6px 10px', border: `1px solid ${p.line}`, borderRadius: 8, fontSize: 12, color: p.inkSoft, background: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Sort:</span><strong style={{ color: p.ink }}>Most votes</strong>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ padding: '20px 36px 36px', height: 800, overflowY: 'hidden' }}>
          {requests.map((r, i) => {
            const meta = STATUS_META[r.status];
            return (
              <div key={r.id} style={{
                background: '#fff', border: `1px solid ${r.mine ? p.ember + '55' : p.line}`,
                borderLeft: r.mine ? `3px solid ${p.ember}` : `1px solid ${p.line}`,
                borderRadius: 10, padding: '16px 20px', marginBottom: 10,
                display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 18, alignItems: 'flex-start',
              }}>
                {/* Vote */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <button style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: r.you ? p.ember + '14' : '#fff',
                    border: `1px solid ${r.you ? p.ember : p.line}`,
                    color: r.you ? p.ember : p.inkSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                  </button>
                  <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 600, color: p.ink }}>{r.votes}</div>
                </div>

                {/* Body */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      background: meta.bg, color: meta.color,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: meta.dot }}></span>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 600 }}>{r.cat}</div>
                    {r.mine && (
                      <div style={{ fontSize: 10, color: p.ember, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your request</div>
                    )}
                    {!r.mine && r.you && (
                      <div style={{ fontSize: 10, color: p.success, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>You voted</div>
                    )}
                    <div style={{ fontSize: 11, color: p.inkMuted, marginLeft: 'auto' }}>#{r.id} · {r.date}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: p.ink, lineHeight: 1.35 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.55, marginTop: 4 }}>{r.desc}</div>
                  {r.lastUpdate && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: meta.bg, borderRadius: 6, fontSize: 12, color: meta.color, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/></svg>
                      <span><strong>Update:</strong> {r.lastUpdate}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: p.inkMuted }}>
                    <span>{r.author}</span>
                    <span>{r.comments} comments</span>
                  </div>
                </div>

                {/* Right rail */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <button style={{ background: 'transparent', border: 'none', fontSize: 12, color: p.inkSoft, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                    Open thread →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Artboard 2: New request composer ────────────────────────
const FeedbackCompose = () => {
  const p = FB.p(); const T = FB.T();

  return (
    <div style={{ width: 1440, height: 900, background: 'rgba(40,40,38,0.4)', fontFamily: T.ui, color: p.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 720, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${p.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>New request</div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: p.ink, marginTop: 2, letterSpacing: '-0.01em' }}>Tell us what's missing</div>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: p.inkMuted, cursor: 'pointer', padding: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M6 18L18 6"/></svg>
          </button>
        </div>

        {/* Type toggle: Feature vs Bug vs Question */}
        <div style={{ padding: '20px 28px 0' }}>
          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>What kind of request?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { key: 'feature', label: 'Feature request', sub: 'Something we should build', active: true },
              { key: 'bug',     label: 'Bug report',      sub: 'Something is broken',   active: false },
              { key: 'help',    label: 'Get help now',    sub: 'I\'m stuck (private ticket)',  active: false, accent: true },
            ].map((t) => (
              <div key={t.key} style={{
                padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${t.active ? p.ember : p.line}`,
                background: t.active ? p.ember + '0c' : '#fff',
                cursor: 'pointer',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.active ? p.ember : p.ink }}>{t.label}</div>
                <div style={{ fontSize: 11, color: p.inkMuted, marginTop: 2 }}>{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Title */}
        <div style={{ padding: '18px 28px 0' }}>
          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Title — one short sentence</div>
          <div style={{ border: `1px solid ${p.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: p.ink, background: '#fff', fontWeight: 500 }}>
            Bulk-mark RSVPs for scouts who showed up but didn't respond
            <span style={{ display: 'inline-block', width: 1, height: 14, background: p.ember, marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s infinite' }}></span>
          </div>
        </div>

        {/* Category */}
        <div style={{ padding: '14px 28px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Category</div>
            <div style={{ border: `1px solid ${p.line}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: p.ink, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><strong>Events</strong> · RSVPs, attendance, signups</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Visibility</div>
            <div style={{ border: `1px solid ${p.line}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: p.ink, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><strong>Public roadmap</strong> · others can vote</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={p.inkMuted} strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 28px 0' }}>
          <div style={{ fontSize: 11, color: p.inkMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Tell us more — what would this fix?</div>
          <div style={{ border: `1px solid ${p.line}`, borderRadius: 8, padding: '12px', fontSize: 13, color: p.ink, lineHeight: 1.55, background: '#fff', minHeight: 120 }}>
            Half my scouts forget to RSVP and just show up. After the campout I want to bulk-mark them as "attended" without going through 30 individual checkboxes.<br/><br/>
            Even better: a "post-event" prompt on Sunday morning that says "who actually showed up?" and lets me check off names in one screen.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: p.inkMuted }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <span>📎 Attach a screenshot</span>
              <span>🎥 Record a screen-recording</span>
            </div>
            <span>312 / 2000</span>
          </div>
        </div>

        {/* Auto-include context */}
        <div style={{ padding: '14px 28px 0' }}>
          <div style={{ background: p.bg, border: `1px dashed ${p.line}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.inkSoft} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <div style={{ fontSize: 11, color: p.inkSoft, lineHeight: 1.6 }}>
                <strong style={{ color: p.ink }}>We'll attach context automatically:</strong> Troop 567 New Hope, your role (Scoutmaster), browser (Chrome 122 · macOS), and a redacted snapshot of your last visited page (Events list, no scout names). You can review and remove any of this before submit.
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${p.lineSoft}`, marginTop: 16 }}>
          <div style={{ fontSize: 11, color: p.inkMuted, lineHeight: 1.5 }}>
            We reply to every request within <strong style={{ color: p.ink }}>5 business days</strong>.<br/>
            Public requests appear on the roadmap once triaged (~24h).
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'transparent', border: `1px solid ${p.line}`, color: p.inkSoft, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Save draft</button>
            <button style={{ background: p.ember, color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Submit request</button>
          </div>
        </div>
      </div>
    </div>
  );
};

window.FeedbackBoard = FeedbackBoard;
window.FeedbackCompose = FeedbackCompose;
