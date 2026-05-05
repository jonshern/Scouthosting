// Marketing home — ported from design_handoff_compass/designs/marketing-balanced.jsx
// (Slate & Sky / "balanced" palette per the design handoff README).

import Link from "next/link";

const FEATURES = [
  {
    num: "01",
    kw: "Calendar",
    title: "A calendar that handles RSVPs, money, and rides.",
    body: "Publish a campout, attach the permission slip, accept payment, and assign carpools — without a single PDF email.",
    accent: "#1d4ed8",
  },
  {
    num: "02",
    kw: "Website",
    title: "A public homepage that recruits new families.",
    body: "Pick from six templates, drop in your unit number, and you're live on a custom subdomain. Scouts can edit it during a Tuesday meeting.",
    accent: "#f59e0b",
  },
  {
    num: "03",
    kw: "Messages",
    title: "Email & text that families actually read.",
    body: "Send a Sunday update or a 7am cancellation. Threaded replies. SMS for urgent. No more \u201Cdid you get the flier?\u201D",
    accent: "#0891b2",
  },
  {
    num: "04",
    kw: "Memories",
    title: "A photo library worth scrolling through.",
    body: "Drop 200 phone photos in after Friday's campout. Auto-organized by event. Families can request blurs on faces.",
    accent: "#475569",
  },
];

const STATS = [
  { n: "AES-256", l: "encryption at rest", c: "#1d4ed8" },
  { n: "SSO", l: "SAML \u00B7 OIDC \u00B7 WebAuthn", c: "#0891b2" },
  { n: "Two-deep", l: "YPT-aligned messaging audit", c: "#f59e0b" },
  { n: "60 days", l: "free trial \u00B7 no card required", c: "#bcd0f4" },
];

const IMPORT_SOURCES = [
  "TroopWebHost",
  "ScoutLander",
  "TroopTrack",
  "Wix / Squarespace",
  "Google Sites",
  "CSV / Excel",
  "Scoutbook export",
  "Internet Advancement",
  "A shared Drive folder",
];

function PhotoTile({ tone, label }: { tone: string; label: string }) {
  // Gradient stand-in. Production swaps in real unit photos.
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-md"
      style={{ background: `linear-gradient(135deg, ${tone}, ${tone}aa 60%, #0f172a)` }}
    >
      <svg
        viewBox="0 0 100 75"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-30"
      >
        <polygon points="0,55 30,32 60,48 100,38 100,75 0,75" fill="#0f172a" />
      </svg>
      <span className="absolute bottom-3 left-4 text-xs font-medium uppercase tracking-[0.16em] text-white/85">
        {label}
      </span>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <>
      {/* Hero — kicker masthead + oversized italic headline */}
      <section className="mx-auto max-w-content px-6 pt-6 pb-14">
        <div className="border-t-2 border-ink pt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-soft mb-8">
          <span>Volume 1 \u00B7 Issue 04</span>
          <span className="hidden md:block">The Compass Field Notes</span>
          <span className="hidden md:block">Modern Software for Volunteer Units</span>
          <span className="hidden md:block">Independent \u00B7 Not affiliated with BSA</span>
        </div>

        <div className="grid gap-12 md:grid-cols-[1.3fr_0.7fr] items-end">
          <h1 className="font-display font-normal leading-[0.92] tracking-[-0.035em] text-[64px] md:text-[96px] lg:text-[116px]">
            Your unit's
            <br />
            website shouldn't
            <br />
            <span className="inline bg-sky text-white italic font-medium px-3 md:px-4 py-1">
              look like 2008.
            </span>
          </h1>
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-ink text-white px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] mb-5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky" />
              SECURITY-FIRST \u00B7 BUILT FOR MINORS' DATA
            </span>
            <p className="text-slate-soft text-[17px] leading-[1.55] mb-6">
              Most volunteer units are stuck on hosting platforms designed before the iPhone.
              Compass is the modern, mobile-first, security-engineered alternative — the
              calendar, public site, photo library, and parent inbox your families actually
              want to use.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary text-base px-5 py-3">
                Start free trial \u2192
              </Link>
              <Link href="/security" className="btn-secondary text-base px-5 py-3">
                See the security model
              </Link>
            </div>
          </div>
        </div>

        {/* Hero photo strip — colored top borders */}
        <div className="mt-12 grid gap-2 md:grid-cols-[2fr_1fr_1fr] h-[260px] md:h-[360px]">
          <div className="border-t-[5px] border-sky overflow-hidden rounded-md">
            <PhotoTile tone="#0891b2" label="Canoe trip" />
          </div>
          <div className="border-t-[5px] border-amber overflow-hidden rounded-md">
            <PhotoTile tone="#1d4ed8" label="Troop meeting" />
          </div>
          <div className="border-t-[5px] border-plum overflow-hidden rounded-md">
            <PhotoTile tone="#f59e0b" label="Campfire" />
          </div>
        </div>
      </section>

      {/* Stats strip — dark slate band with spectrum top-borders */}
      <section className="bg-surface-dark text-white">
        <div className="mx-auto max-w-content px-6 py-12 grid gap-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div
              key={s.n}
              className="pt-5 border-t-[3px]"
              style={{ borderColor: s.c }}
            >
              <div className="font-display text-[44px] md:text-[56px] font-normal leading-none tracking-[-0.025em]">
                {s.n}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.04em] text-white/70">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — editorial blocks alternating image/text */}
      <section className="mx-auto max-w-content px-6 py-20">
        <div className="mb-12">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky mb-3">
            \u00A7 The Product
          </div>
          <h2 className="font-display text-[40px] md:text-[56px] font-normal leading-none tracking-[-0.025em] max-w-3xl">
            Built around the four things{" "}
            <em className="text-sky font-normal">volunteers actually need.</em>
          </h2>
        </div>

        {FEATURES.map((f, i) => {
          const reversed = i % 2 === 1;
          return (
            <div
              key={f.num}
              className={`grid gap-10 items-center py-10 border-t-2 border-ink ${
                reversed ? "md:grid-cols-[1.3fr_1fr]" : "md:grid-cols-[1fr_1.3fr]"
              }`}
            >
              <div
                className={`relative h-[260px] md:h-[360px] rounded-md overflow-hidden ${
                  reversed ? "md:order-2" : ""
                }`}
              >
                <PhotoTile tone={f.accent} label={f.kw} />
                <span
                  className="absolute top-4 left-4 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm px-2.5 py-1 text-white"
                  style={{ background: f.accent }}
                >
                  {f.kw}
                </span>
              </div>
              <div className={reversed ? "md:order-1" : ""}>
                <div
                  className="font-display italic text-[64px] md:text-[88px] font-normal leading-[0.9] tracking-[-0.03em] mb-4"
                  style={{ color: f.accent }}
                >
                  {f.num}
                </div>
                <h3 className="font-display text-[28px] md:text-[40px] font-normal leading-[1.1] tracking-[-0.02em] mb-4">
                  {f.title}
                </h3>
                <p className="text-slate-soft text-base leading-relaxed">{f.body}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Migration band */}
      <section className="border-y-2 border-ink bg-surface-alt">
        <div className="mx-auto max-w-content px-6 py-16 grid gap-12 md:grid-cols-[1fr_1.4fr] items-center">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky mb-3">
              \u00A7 Migration
            </div>
            <h3 className="font-display text-[32px] md:text-[44px] font-normal leading-[1.05] tracking-[-0.025em] mb-4">
              Bring your <em className="text-sky font-normal">18 years</em> of unit
              history with you.
            </h3>
            <p className="text-slate-soft text-[15px] leading-relaxed">
              We import from TroopWebHost, ScoutLander, TroopTrack, and a folder of CSVs
              you found on the old committee chair's laptop. White-glove migration is
              included on every plan — book a 30-minute call and we'll have you running
              by Sunday.
            </p>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {IMPORT_SOURCES.map((src) => (
              <div
                key={src}
                className="bg-bone border border-line rounded-md px-4 py-3 text-[13px] font-medium flex items-center gap-2.5"
              >
                <span aria-hidden className="h-2 w-2 rounded-full bg-sky shrink-0" />
                {src}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser — Standard + Premium, 60-day free */}
      <section className="mx-auto max-w-content px-6 py-20">
        <div className="mb-12">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky mb-3">
            \u00A7 Pricing
          </div>
          <h2 className="font-display text-[40px] md:text-[56px] font-normal leading-none tracking-[-0.025em] max-w-4xl">
            One price per unit.{" "}
            <em className="text-sky font-normal">No per-scout</em> fees, ever.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="relative rounded-xl border-2 border-ink bg-surface-dark text-white p-8">
            <span className="absolute -top-3 left-7 bg-sky text-white text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded">
              Most units
            </span>
            <div className="font-display italic text-[24px] text-sky mb-2">Premium</div>
            <div className="font-display text-[56px] font-normal leading-none tracking-[-0.03em]">
              $119
            </div>
            <div className="text-xs text-white/60 mt-1 mb-6">/ month</div>
            <p className="text-sm text-white/85 mb-6 pb-6 border-b border-white/15">
              Everything in Standard, plus the messaging stack — SMS broadcasts, push,
              DMs, channels with two-deep YPT compliance.
            </p>
            <ul className="space-y-2.5 text-sm mb-7">
              {[
                "Unlimited members \u00B7 calendar \u00B7 RSVPs \u00B7 photos",
                "Group email (Resend-backed sender)",
                "Trip + meal planner",
                "Custom forms + custom domain",
                "Group SMS broadcasts (Twilio)",
                "Push + DMs + patrol/parents channels",
                "Two-deep YPT compliance gate",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex gap-2.5 leading-snug text-white/90">
                  <span className="text-sky font-bold shrink-0">\u2713</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center w-full rounded-md bg-sky text-white px-4 py-3 text-sm font-semibold hover:bg-white hover:text-ink transition-colors"
            >
              Start Premium — 60 days free \u2192
            </Link>
          </div>

          <div className="rounded-xl border-2 border-line bg-bone p-8">
            <div className="font-display italic text-[24px] text-sky mb-2">Standard</div>
            <div className="font-display text-[56px] font-normal leading-none tracking-[-0.03em]">
              $99
            </div>
            <div className="text-xs text-slate-muted mt-1 mb-6">/ month</div>
            <p className="text-sm text-slate-soft mb-6 pb-6 border-b border-line">
              Everything most units need — public site, calendar, photos, group email,
              page editor.
            </p>
            <ul className="space-y-2.5 text-sm mb-7">
              {[
                "Unlimited members",
                "Calendar + RSVP",
                "Photo albums",
                "Group email",
                "Trip + meal planner",
                "Custom forms",
                "Custom domain",
              ].map((f) => (
                <li key={f} className="flex gap-2.5 leading-snug">
                  <span className="text-sky font-bold shrink-0">\u2713</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-secondary w-full justify-center">
              Start Standard — 60 days free \u2192
            </Link>
          </div>
        </div>

        <p className="mt-7 text-center text-[13px] text-slate-muted">
          501(c)(3)? You get 20% off, automatically. \u00B7{" "}
          <Link href="/plans" className="underline">
            Compare full plans
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-content px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky text-white text-[11px] font-bold tracking-[0.14em] uppercase mb-6">
          Free for 60 days
        </span>
        <h2 className="font-display text-[44px] md:text-[72px] font-normal leading-[0.98] tracking-[-0.03em] max-w-3xl mx-auto mb-8">
          Set up your unit's home base{" "}
          <em className="text-sky font-normal">before next week's meeting.</em>
        </h2>
        <div className="flex flex-wrap gap-3 justify-center mb-6">
          <Link href="/signup" className="btn-primary text-[15px] px-7 py-4 rounded-full">
            Start free trial \u2192
          </Link>
          <Link
            href="mailto:hello@compass.app"
            className="btn-secondary text-[15px] px-7 py-4 rounded-full"
          >
            Talk to a person
          </Link>
        </div>
        <p className="text-[13px] text-slate-muted">
          No credit card \u00B7 cancel anytime \u00B7 we'll migrate your old site for free
        </p>
      </section>
    </>
  );
}
