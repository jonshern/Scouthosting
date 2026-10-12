// Pricing — design idiom from design_handoff_compass/designs/plans.jsx,
// shipped as one plan paid yearly or monthly (lib/billing/pricing.ts)
// instead of the TBD working-doc framing in the mock.

import Link from "next/link";
import { PRICES, PRICE_LINE, YEARLY_SAVINGS_USD } from "@/lib/billing/pricing";

type Feature = [label: string, value: React.ReactNode | null, inherited?: boolean];

// Everything is in the one plan (lib/billing/pricing.ts).
const INCLUDED: Feature[] = [
  ["Website", "As many pages as you want, six themes, your own domain."],
  ["Calendar & events", "RSVPs, permission slips, payment links."],
  ["Roster", "Unlimited. A parent is copied on every message to a scout."],
  [
    "Email",
    <>
      Sent from <strong className="text-ink">scoutmaster@yourtroop.org</strong>, not from us.
    </>,
  ],
  ["Photos", <><strong className="text-ink">15 GB</strong>, with privacy settings per scout.</>],
  ["Trips & meals", "Recipes scale to headcount. Printable shopping lists."],
  ["Forms", "Permission slips, sign-ups, surveys."],
  ["Moving in", "We'll help bring over your old site."],
  ["Family app", "Push notifications and messages on their phone."],
  ["Chats", "Patrols, dens, parents, leaders. Logged."],
  ["Waypoint", "Merit badge kits and badge days."],
  ["Lantern", "Each scout's path to Eagle."],
];

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
          <span>Pricing</span>
          <span className="md:text-right">
            No per-scout fees. Cancel any time.
          </span>
        </div>

        <div className="grid md:grid-cols-[1.4fr_0.6fr] gap-12 items-start">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-sky text-white px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase mb-6">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
              30 days free · no card
            </span>
            <h1 className="font-display text-[44px] md:text-[72px] font-normal leading-[0.95] tracking-[-0.025em]">
              One plan,{" "}
              <em className="text-sky font-normal">one price.</em>
            </h1>
            <p className="mt-6 max-w-2xl text-slate-soft text-[16px] leading-[1.65]">
              {PRICES.year.long} or {PRICES.month.long} per unit. First month is free.
              Everything&apos;s included, Waypoint and Lantern too.
            </p>
          </div>

          <div className="bg-white border border-line rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-slate-muted font-bold mb-3">
              The short version
            </div>
            {[
              "First month free, no card",
              "Your own domain, no extra charge",
              "Help moving your old site",
              "Card fees at cost",
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

      {/* Two ways to pay for the same plan */}
      <section className="mx-auto max-w-content px-6 pb-20">
        <div className="grid md:grid-cols-2 gap-5 items-stretch">
          <div className="relative rounded-[14px] bg-surface-dark text-white p-7 md:p-8 flex flex-col border-2 border-amber">
            <span className="absolute -top-3 left-7 bg-amber text-white text-[10px] font-bold tracking-[0.08em] uppercase px-2.5 py-1 rounded">
              Saves ${YEARLY_SAVINGS_USD}
            </span>
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/55">Yearly</div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-[56px] font-normal tracking-[-0.02em] leading-[0.9]">
                {PRICES.year.short}
              </span>
              <span className="text-white/60 text-[14px]">/ year</span>
            </div>
            <div className="text-[12px] text-white/75 mt-2 leading-[1.5]">
              Per unit. First month free.
            </div>
            <Link
              href="/start"
              className="mt-5 inline-flex items-center justify-center w-full rounded-md bg-amber text-white px-4 py-3 text-[14px] font-semibold hover:opacity-90"
            >
              Start your free month →
            </Link>
          </div>

          <div className="rounded-[14px] bg-white border border-line p-7 md:p-8 flex flex-col">
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-muted">Monthly</div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-[56px] font-normal tracking-[-0.02em] leading-[0.9]">
                {PRICES.month.short}
              </span>
              <span className="text-slate-muted text-[14px]">/ month</span>
            </div>
            <div className="text-[12px] text-slate-soft mt-2 leading-[1.5]">
              Per unit. First month free. Cancel any time.
            </div>
            <Link
              href="/start"
              className="mt-5 inline-flex items-center justify-center w-full rounded-md border-[1.5px] border-ink text-ink px-4 py-3 text-[14px] font-semibold hover:bg-ink hover:text-white transition-colors"
            >
              Start your free month →
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-[14px] bg-white border border-line p-7 md:p-8">
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-muted">
            Both get everything
          </div>
          <ul className="list-none p-0 mt-4 grid md:grid-cols-2 gap-x-10">
            {INCLUDED.map((f) => (
              <FeatureRow key={f[0]} feat={f} />
            ))}
          </ul>
          <p className="mt-6 text-[13px] text-slate-muted">{PRICE_LINE}.</p>
        </div>
      </section>

      {/* Comparison — "no commodity markups" idiom from positioning.jsx */}
      <section className="bg-surface-alt border-y border-line">
        <div className="mx-auto max-w-content px-6 py-16 grid md:grid-cols-[1fr_1.4fr] gap-12 items-start">
          <div>
            <h3 className="font-display text-[32px] md:text-[40px] font-normal leading-[1.05] tracking-[-0.025em] mb-4">
              Other hosts charge extra{" "}
              <em className="text-sky font-normal">for the basics.</em>
            </h3>
            <p className="text-slate-soft text-[15px] leading-[1.65]">
              Your own domain and email on it shouldn&apos;t cost extra. Most hosts
              charge for each. We don&apos;t.
            </p>
          </div>
          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface-alt text-slate-muted text-[11px] uppercase tracking-[0.06em]">
                  <th className="px-4 py-3 text-left font-bold">Item</th>
                  <th className="px-4 py-3 text-right font-bold">Other hosts</th>
                  <th className="px-4 py-3 text-right font-bold">Compass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {[
                  ["Use your own domain", "+$25/yr", "Included"],
                  ["Email on your domain", "+$9–25/yr", "Included"],
                  ["Photo storage", "10 GB", "15 GB"],
                  ["Per-scout fees", "$0–$3/yr", "None"],
                  ["Moving your old site", "On your own", "We help"],
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
          Running a lot of units?{" "}
          <a href="mailto:hello@compass.app" className="underline text-ink font-medium">
            Talk to us
          </a>
          .
        </p>
      </section>
    </main>
  );
}
