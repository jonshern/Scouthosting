import Link from "next/link";

const TIERS = [
  {
    id: "standard",
    name: "Standard",
    price: "$99",
    cadence: "/mo",
    blurb: "Everything most units need.",
    features: [
      "Unlimited members",
      "Calendar + RSVP",
      "Photo albums",
      "Group email (Resend-backed)",
      "Page editor + announcements",
      "Trip + meal planner",
      "Custom forms",
      "Custom domain",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$119",
    cadence: "/mo",
    blurb: "Everything in Standard, plus messaging.",
    popular: true,
    features: [
      "Everything in Standard",
      "Group SMS broadcasts (Twilio)",
      "Push notifications (mobile app)",
      "Direct messages (1:1 + DMs)",
      "Patrol / den / parents channels",
      "Two-deep YPT compliance gate",
      "Priority support",
    ],
  },
];

export const metadata = { title: "Pricing" };

export default function PlansPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-medium text-forest">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-forest" />
          60 days free — no credit card required
        </span>
        <h1 className="mt-6 font-display text-4xl md:text-5xl font-semibold">
          Simple pricing, two flavors.
        </h1>
        <p className="mt-4 mx-auto max-w-2xl text-ink-muted">
          Flat-fee. No platform cut on dues, donations, or trip payments.
          Cancel anytime.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`card relative ${
              tier.popular ? "ring-2 ring-forest shadow-md" : ""
            }`}
          >
            {tier.popular && (
              <span className="absolute -top-3 left-6 rounded-full bg-forest px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                Most popular
              </span>
            )}
            <div className="font-display text-2xl font-semibold">{tier.name}</div>
            <div className="mt-1 text-ink-muted">{tier.blurb}</div>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-4xl font-semibold">{tier.price}</span>
              <span className="text-ink-muted">{tier.cadence}</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-forest"
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className={`mt-8 w-full justify-center ${
                tier.popular ? "btn-primary" : "btn-secondary"
              }`}
            >
              Start {tier.name} — 60 days free
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-12 text-center text-sm text-ink-muted">
        Need bulk provisioning or SSO across many units?{" "}
        <a href="mailto:hello@compass.app" className="underline">
          Talk to us
        </a>
        .
      </p>
    </section>
  );
}
