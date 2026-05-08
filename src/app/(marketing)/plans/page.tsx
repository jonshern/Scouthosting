// Pricing — design idiom from design_handoff_compass/designs/plans.jsx,
// shipped with concrete Standard / Premium pricing instead of the TBD
// working-doc framing in the mock.

import Link from "next/link";

type Feature = [label: string, value: React.ReactNode | null, inherited?: boolean];

const STANDARD: Feature[] = [
  ["Public site", "Unlimited pages, six themes, custom domain at no markup."],
  ["Calendar & events", "Unlimited. RSVP, permission slips, payment links."],
  ["Members & roster", "Unlimited. Two-deep YPT enforced on messaging."],
  [
    "Group email",
    <>
      Per-org sender aligned with your domain — emails come from{" "}
      <strong className="text-ink">scoutmaster@yourtroop.org</strong>, not ours.
    </>,
  ],
  [
    "Photo library",
    <>
      <strong className="text-ink">15 GB included</strong> — auto-resize on upload, ~7,500
      web-quality images. Per-scout privacy controls.
    </>,
  ],
  ["Trip + meal planner", "Headcount-driven recipe scaling and printable shopping lists."],
  ["Custom forms", "Permission slips, sign-ups, surveys."],
  ["Migration", "White-glove import from TroopWebHost, ScoutLander, TroopTrack, CSVs."],
];

const PREMIUM: Feature[] = [
  ["Everything in Standard", null, true],
  [
    "Group SMS broadcasts",
    "Twilio-backed urgent alerts. 7am cancellations actually arrive on time.",
  ],
  [
    "Push + DMs",
    "Native push notifications + 1:1 messaging in the parent mobile app.",
  ],
  [
    "Channels",
    "Patrol, den, parents, leaders. Two-deep audit on every leader↔youth thread.",
  ],
  ["Priority support", "First-line response within one business day."],
];

const NOT_INCLUDED_STANDARD = ["Group SMS", "Mobile push", "DMs / channels"];

function FeatureRow({ feat, dark = false }: { feat: Feature; dark?: boolean }) {
  const [label, value, inherited] = feat;
  const fg = dark ? "text-white" : "text-ink";
  const fgSoft = dark ? "text-white/75" : "text-slate-soft";
  return (
    <li
      className="flex gap-3 py-2.5 border-b last:border-b-0"
      style={{ borderColor: dark ? "rgba(255,255,255,0.10)" : "#eef1f5" }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1d4ed8"
        strokeWidth="3"
        className="shrink-0 mt-1"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <div>
        <div
          className={`text-[13px] ${fg} ${inherited ? "font-semibold" : "font-medium"}`}
        >
          {label}
        </div>
        {value && (
          <div className={`text-[12px] mt-0.5 leading-[1.5] ${fgSoft}`}>{value}</div>
        )}
      </div>
    </li>
  );
}

export const metadata = { title: "Plans & pricing" };

export default function PlansPage() {
  return (
    <main>
      {/* Header band */}
      <section className="mx-auto max-w-content px-6 pt-10 pb-12">
        <div className="border-t-2 border-ink pt-4 grid md:grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-soft mb-10">
          <span>§ Plans & pricing</span>
          <span className="md:text-right">
            No per-scout fees. No platform cut. Cancel anytime.
          </span>
        </div>

        <div className="grid md:grid-cols-[1.4fr_0.6fr] gap-12 items-start">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-sky text-white px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase mb-6">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
              60 days free · no card required
            </span>
            <h1 className="font-display text-[44px] md:text-[72px] font-normal leading-[0.95] tracking-[-0.025em]">
              Two flavors,{" "}
              <em className="text-sky font-normal">no commodity markups.</em>
            </h1>
            <p className="mt-6 max-w-2xl text-slate-soft text-[16px] leading-[1.65]">
              Custom domains, BYO email, and 15 GB photo storage are{" "}
              <strong className="text-ink">included on every plan</strong> — we don't
              charge $25 extra for the things our hosts charge us pennies for. The only
              premium add-on is messaging (SMS, push, DMs) because Twilio actually costs
              money.
            </p>
          </div>

          <div className="bg-white border border-line rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-slate-muted font-bold mb-3">
              What's settled
            </div>
            {[
              "60-day money-back guarantee",
              "Custom domain, no markup",
              "501(c)(3) discount: 20% off",
              "White-glove migration included",
              "Stripe fees passed through at cost",
            ].map((s) => (
              <div
                key={s}
                className="flex gap-2 py-1.5 text-[13px] text-ink leading-[1.45] font-medium"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#059669"
                  strokeWidth="3"
                  className="shrink-0 mt-1"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tier grid — Premium dark + ribboned, Standard light */}
      <section className="mx-auto max-w-content px-6 pb-20">
        <div className="grid md:grid-cols-2 gap-5 items-stretch">
          {/* Premium */}
          <div className="relative rounded-[14px] bg-surface-dark text-white p-7 md:p-8 flex flex-col shadow-[0_0_0_4px_rgba(245,158,11,0.10),0_12px_32px_rgba(245,158,11,0.10)] border-2 border-amber">
            <span className="absolute -top-3 left-7 bg-amber text-white text-[10px] font-bold tracking-[0.08em] uppercase px-2.5 py-1 rounded">
              Most units pick this
            </span>
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/55">
              Premium
            </div>
            <div className="font-display italic text-[19px] font-medium mt-1.5 leading-[1.3]">
              Everything in Standard, plus the messaging stack — SMS, push, DMs,
              channels.
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-[56px] font-normal tracking-[-0.02em] leading-[0.9]">
                $119
              </span>
              <span className="text-white/60 text-[14px]">/ month</span>
            </div>
            <div className="text-[12px] text-white/75 mt-2 leading-[1.5]">
              Flat per unit — pack, troop, crew, ship, or post. 60-day free trial.
              Cancel anytime.
            </div>
            <Link
              href="/signup?plan=premium"
              className="mt-5 inline-flex items-center justify-center w-full rounded-md bg-amber text-white px-4 py-3 text-[14px] font-semibold hover:opacity-90"
            >
              Start Premium — 60 days free →
            </Link>
            <ul className="list-none p-0 mt-7 space-y-0">
              {PREMIUM.map((f) => (
                <FeatureRow key={f[0]} feat={f} dark />
              ))}
            </ul>
          </div>

          {/* Standard */}
          <div className="rounded-[14px] bg-white border border-line p-7 md:p-8 flex flex-col">
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-muted">
              Standard
            </div>
            <div className="font-display italic text-[19px] font-medium mt-1.5 leading-[1.3]">
              Everything most units need to ship a real public site and run a real
              calendar.
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-[56px] font-normal tracking-[-0.02em] leading-[0.9]">
                $99
              </span>
              <span className="text-slate-muted text-[14px]">/ month</span>
            </div>
            <div className="text-[12px] text-slate-soft mt-2 leading-[1.5]">
              Flat per unit. 60-day free trial. Cancel anytime.
            </div>
            <Link
              href="/signup?plan=standard"
              className="mt-5 inline-flex items-center justify-center w-full rounded-md border-[1.5px] border-ink text-ink px-4 py-3 text-[14px] font-semibold hover:bg-ink hover:text-white transition-colors"
            >
              Start Standard — 60 days free →
            </Link>
            <ul className="list-none p-0 mt-7 space-y-0">
              {STANDARD.map((f) => (
                <FeatureRow key={f[0]} feat={f} />
              ))}
            </ul>
            <div className="mt-5 pt-5 border-t border-line-soft">
              <div className="text-[11px] uppercase tracking-[0.08em] text-slate-muted font-bold mb-2">
                Not in Standard
              </div>
              {NOT_INCLUDED_STANDARD.map((n) => (
                <div
                  key={n}
                  className="flex items-center gap-2.5 py-1 text-[12px] text-slate-muted"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="shrink-0"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  {n} — upgrade to Premium for messaging.
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison — "no commodity markups" idiom from positioning.jsx */}
      <section className="bg-surface-alt border-y border-line">
        <div className="mx-auto max-w-content px-6 py-16 grid md:grid-cols-[1fr_1.4fr] gap-12 items-start">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky mb-3">
              § What's actually included
            </div>
            <h3 className="font-display text-[32px] md:text-[40px] font-normal leading-[1.05] tracking-[-0.025em] mb-4">
              The legacy hosts charge a markup{" "}
              <em className="text-sky font-normal">on basically everything.</em>
            </h3>
            <p className="text-slate-soft text-[15px] leading-[1.65]">
              Custom domains cost $0.02/yr at the registry. Email-on-your-domain costs
              ~$9/yr at Postmark. Most platforms charge $25/yr extra for each. Compass
              passes them through free.
            </p>
          </div>
          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface-alt text-slate-muted text-[11px] uppercase tracking-[0.06em]">
                  <th className="px-4 py-3 text-left font-bold">Item</th>
                  <th className="px-4 py-3 text-right font-bold">Legacy host</th>
                  <th className="px-4 py-3 text-right font-bold">Compass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {[
                  ["Use your own domain", "+$25/yr", "Included"],
                  ["Email on your domain", "+$9–25/yr", "Included"],
                  ["Photo storage", "10 GB", "15 GB"],
                  ["Per-scout fees", "$0–$3/yr", "None"],
                  ["Migration", "DIY", "White-glove"],
                ].map(([k, l, c]) => (
                  <tr key={k}>
                    <td className="px-4 py-3 font-medium text-ink">{k}</td>
                    <td className="px-4 py-3 text-right text-slate-soft">{l}</td>
                    <td className="px-4 py-3 text-right font-semibold text-sky">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section className="mx-auto max-w-content px-6 py-12 text-center">
        <p className="text-[14px] text-slate-soft">
          Need bulk provisioning or SSO across many units?{" "}
          <a href="mailto:hello@compass.app" className="underline text-ink font-medium">
            Talk to us
          </a>{" "}
          — we'll figure out a council deal.
        </p>
      </section>
    </main>
  );
}
