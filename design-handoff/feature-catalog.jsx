// FEATURE CATALOG — Everything Compass does, organized by audience.
// Anchored to the actual codebase: src/app/o/[slug]/* routes,
// src/lib/* libraries, src/lib/features/index.ts feature flags.
// Tone: positive, capability-first, no comparisons.

const FeatureCatalog = ({ palette: p }) => {
  const T = window.SH_TYPE;
  const dark = p.surfaceDark || '#1d3a32';

  const SECTIONS = [
    {
      audience: 'For families',
      tagline: 'One app for everything your scout has going on.',
      color: p.sky,
      groups: [
        {
          title: 'Calendar & RSVPs',
          items: [
            ['Month, week, and agenda views', 'Color-coded by category — meetings, campouts, service, courts of honor.'],
            ['One-tap RSVP', 'Yes / No / Maybe with a +1 count for siblings or guests.'],
            ['Event detail with weather', '10-day forecast appears once we\'re inside the window.'],
            ['Permission slips inline', 'Sign on your phone. PDF goes to the leader. No printer required.'],
            ['Carpool sign-up', 'Drivers post seats; families claim them. Pickup addresses included.'],
            ['Per-event payments', 'Pay the campout fee with Apple Pay. Receipt emailed.'],
            ['Calendar subscription', 'iCal feed — your family calendar shows troop events alongside soccer.'],
            ['Push reminders', 'Day-before nudges, departure-time alerts, weather changes.'],
          ],
        },
        {
          title: 'Messages & posts',
          items: [
            ['Group email', 'Sunday newsletter, mid-week reminders, quick announcements.'],
            ['Threaded replies', 'Replies go to the thread, not 70 inboxes.'],
            ['Direct messages', 'One-on-one or small group, with two-deep enforced.'],
            ['Post feed', 'Photos, achievements, news, polls — like a private Facebook for the troop.'],
            ['Reactions & comments', 'Moderated. Leaders can pin or remove.'],
            ['Push notifications', 'Optional, per-channel. Quiet hours respected.'],
          ],
        },
        {
          title: 'Photos',
          items: [
            ['Auto-organized by event', 'Drop 200 phone photos in after a campout — the album builds itself.'],
            ['Faces & names', 'Tag once, the rest of the album learns.'],
            ['Permissions', 'Each family controls whether their scout appears in the public gallery.'],
            ['Original-quality download', 'No re-compression for keepsakes.'],
            ['Public gallery', 'Selected albums appear on the unit homepage. Toggleable per album.'],
          ],
        },
      ],
    },
    {
      audience: 'For leaders',
      tagline: 'Run the unit without a second job in tech support.',
      color: p.accent,
      groups: [
        {
          title: 'Roster & directory',
          items: [
            ['Member directory', 'Searchable. Phone, email, emergency contacts, dietary, medical.'],
            ['Pack & troop hierarchy', 'Dens / patrols / committees — channels and posts auto-target.'],
            ['Adult roles & training', 'YPT expiration tracked. Position-of-responsibility tags.'],
            ['Merit badge counselors', 'Searchable list with badges held and contact info.'],
            ['Eagle candidate tracker', 'Project status, board-of-review scheduling, advancement notes.'],
            ['OA membership', 'Order of the Arrow status & induction tracking.'],
            ['Bulk invites', 'Paste a CSV; we send the invite emails and verify each adult.'],
            ['Scoutbook deep-link', 'Advancement stays in Scoutbook; we link to it from the member page.'],
          ],
        },
        {
          title: 'Trip & event planning',
          items: [
            ['Event composer', 'Date, location, cost, RSVP cap, gear list, permission slip — one form.'],
            ['Recurring events', 'Weekly meetings handled with iCal RRULE — exceptions per week.'],
            ['Course-of-Honor scheduling', 'Awards queue, certificate generation, family invitations.'],
            ['Trip planning workspace', 'Menu planning, dietary roll-up, shopping list auto-generated.'],
            ['Car ride coordination', 'Match drivers to families based on address. Mileage tracked.'],
            ['Tour permits & checklists', 'Reminders to file with council. Checklist per trip type.'],
            ['Post-trip recap', 'Auto-drafts a recap email with photos and attendance.'],
          ],
        },
        {
          title: 'Communications',
          items: [
            ['Newsletter composer', 'AI-drafted Sunday digest from real troop data. 5-minute review.'],
            ['Group email', 'To roster, to a den/patrol, to a custom audience. Open & click tracking.'],
            ['SMS broadcast', 'For time-sensitive alerts. Per-org credentials.'],
            ['Targeted announcements', 'New-Scout welcome, Eagle congratulations, Court-of-Honor invites.'],
            ['Drip rules', 'RSVP nudges, dues reminders, campout countdown — fire automatically.'],
            ['Tracked-message log', 'Every email and SMS is logged. Searchable. Exportable.'],
            ['Reply-by-email', 'Family replies land in the thread, not lost in a personal inbox.'],
          ],
        },
        {
          title: 'Treasury & forms',
          items: [
            ['Online dues', 'Stripe-powered. Annual, monthly, or per-event.'],
            ['Per-event payments', 'Campout fees, summer camp deposits, popcorn pre-orders.'],
            ['Reimbursements', 'Leaders submit a receipt photo; treasurer approves and issues payment.'],
            ['Refunds', 'Full or partial, with audit trail.'],
            ['Treasurer report', 'Income, outflows, by event and by member.'],
            ['Forms & waivers', 'Build a custom form, route to a leader for signature, store the PDF.'],
            ['Surveys', 'Pre-trip preferences, post-event feedback, parent interest survey.'],
          ],
        },
      ],
    },
    {
      audience: 'For the public',
      tagline: 'A homepage that recruits new families.',
      color: p.raspberry,
      groups: [
        {
          title: 'Public site',
          items: [
            ['Curated themes', '8 finished looks. No color-picker chaos.'],
            ['42 specific blocks', 'Hero, About, Calendar, Gallery, Eagle wall, Sponsor strip, Contact form, Map.'],
            ['Live data blocks', 'Calendar pulls from your unit; gallery from your photos. Always fresh.'],
            ['AI assist', 'Describe the section you want; we draft it from real troop data.'],
            ['Custom subdomain', 'Free: troop100.compass.app. Bring your own domain at no markup.'],
            ['SEO basics', 'Structured data, sitemap, OG cards. Council finds you on Google.'],
            ['Public calendar', 'Visiting families see meeting times before they sign up.'],
            ['Contact form', 'Inquiries route to the membership chair.'],
          ],
        },
        {
          title: 'Brand & polish',
          items: [
            ['Mobile-first', 'Looks right on phones — where most prospects find you.'],
            ['Accessible', 'WCAG AA contrast in every theme. Keyboard nav, screen-reader labels.'],
            ['Fast', 'Static-rendered pages. Hosted on a global edge.'],
            ['Custom email-on-domain', 'scoutmaster@troop100.org — included if you bring a domain.'],
          ],
        },
      ],
    },
    {
      audience: 'For the platform',
      tagline: 'Trust, security, and operability — built in.',
      color: p.teal || p.primary,
      groups: [
        {
          title: 'Identity & access',
          items: [
            ['Sign in with Google or Apple', 'No new password to remember.'],
            ['Email + password fallback', 'Argon2id hashed. Strong-password enforced.'],
            ['Mobile bearer tokens', 'In-app browser auth → deep-link callback. No password in the app.'],
            ['Per-role permissions', 'Scout, parent, leader, committee, admin, super-admin.'],
            ['YPT-aware messaging', 'Two-deep enforced on every chat write. Adult-only channels supported.'],
            ['Session controls', 'See active sessions, sign out everywhere, rotate tokens.'],
          ],
        },
        {
          title: 'Data protection',
          items: [
            ['Per-org encryption', 'Each unit has its own data encryption key (DEK).'],
            ['Field-level encryption', 'Names, phone, address, medical — encrypted at rest with the DEK.'],
            ['Three-way key wrapping', 'MASTER_KEY (server), org passphrase (admin), recovery code (one-time).'],
            ['Encrypted photo bytes', 'Images stored encrypted on S3 / GCS / local.'],
            ['Encrypted backups', 'Daily, off-site, retention configurable.'],
            ['Data export', 'JSON of your roster, calendar, posts. Yours to take.'],
            ['Data residency', 'US Postgres, US S3 by default.'],
          ],
        },
        {
          title: 'Audit & oversight',
          items: [
            ['Tamper-evident audit log', 'Every chat, email, role change, photo upload — logged.'],
            ['YPT auto-suspend', 'Channels with youth and < 2 YPT-current adults pause until fixed.'],
            ['Leader oversight view', 'Read-only window into all channels for committee chair.'],
            ['Background-check status', 'Surface adult clearance from your records. Don\'t hide it.'],
            ['Incident reporting', 'In-app form, routed to designated leader, with audit trail.'],
            ['Super-admin console', 'Per-org feature flags, billing state, recovery flows.'],
          ],
        },
        {
          title: 'Operations & reliability',
          items: [
            ['99.9% uptime SLA', 'Posted status page. Incident postmortems published.'],
            ['Daily encrypted backups', '30-day point-in-time recovery available.'],
            ['Health check endpoints', '/health for liveness, /health/ready for readiness.'],
            ['Background jobs', 'pg-boss workers — newsletter scheduling, push, email retry.'],
            ['Storage tiers', 'Local / S3 / GCS via a single facade.'],
            ['Per-org feature flags', 'Roll out new features unit-by-unit, dark-launch in beta.'],
            ['Pre-launch invite codes', 'Founders, design partners, press — separate enrollment paths.'],
          ],
        },
      ],
    },
  ];

  return (
    <div style={{ width: 1440, background: p.bg, color: p.ink, fontFamily: T.ui }}>
      {/* Header */}
      <div style={{ background: dark, color: '#fff', padding: '64px 72px 56px', position: 'relative', overflow: 'hidden' }}>
        <TopoBg color={p.accent} opacity={0.08}/>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>§ Everything Compass does</div>
          <h1 style={{ fontFamily: T.display, fontSize: 80, fontWeight: 400, lineHeight: 0.96, letterSpacing: '-0.03em', margin: 0, maxWidth: 1100 }}>
            The complete <span style={{ fontStyle: 'italic', color: p.accent }}>capability map.</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.78)', maxWidth: 720, margin: '24px 0 0', lineHeight: 1.55 }}>
            Organized by who the feature serves: families, leaders, the visiting public, and the platform itself. Anchored to what actually ships in the codebase — not roadmap promises.
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 40, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <span>4 audiences</span>
            <span>·</span>
            <span>14 groups</span>
            <span>·</span>
            <span>~90 concrete capabilities</span>
            <span>·</span>
            <span>One platform</span>
          </div>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((sec, si) => (
        <div key={si} style={{ borderTop: si === 0 ? 'none' : `1px solid ${p.line}` }}>
          {/* Audience header */}
          <div style={{ padding: '64px 72px 32px', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 11, color: sec.color, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>§ {String(si + 1).padStart(2, '0')}</div>
              <h2 style={{ fontFamily: T.display, fontSize: 52, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em', margin: 0 }}>{sec.audience}</h2>
            </div>
            <div style={{ fontFamily: T.display, fontSize: 26, fontStyle: 'italic', color: p.inkSoft, lineHeight: 1.3, fontWeight: 400, paddingTop: 8 }}>
              {sec.tagline}
            </div>
          </div>

          {/* Groups */}
          <div style={{ padding: '0 72px 64px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '32px 48px' }}>
            {sec.groups.map((g, gi) => (
              <div key={gi} style={{ borderTop: `2px solid ${sec.color}`, paddingTop: 18 }}>
                <h3 style={{ fontFamily: T.display, fontSize: 24, fontWeight: 500, margin: '0 0 16px', letterSpacing: '-0.01em' }}>{g.title}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {g.items.map(([title, body], ii) => (
                    <div key={ii} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 12, alignItems: 'baseline' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sec.color, marginTop: 7 }}/>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: p.ink, marginBottom: 2 }}>{title}</div>
                        <div style={{ fontSize: 13, color: p.inkSoft, lineHeight: 1.5 }}>{body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Footer band */}
      <div style={{ background: p.surfaceAlt, borderTop: `2px solid ${p.ink}`, padding: '48px 72px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: p.accent, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>§ All in one plan</div>
          <div style={{ fontFamily: T.display, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Every capability above is included. <span style={{ fontStyle: 'italic', color: p.accent }}>$99 per unit, per year.</span>
          </div>
        </div>
        <button style={{ background: p.ink, color: p.bg, border: 'none', padding: '16px 26px', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: T.ui }}>
          Start free trial →
        </button>
      </div>
    </div>
  );
};

window.FeatureCatalog = FeatureCatalog;
