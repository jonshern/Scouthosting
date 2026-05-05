import Link from "next/link";

const TIERS = [
  {
    id: "patrol",
    name: "Patrol",
    price: "Free",
    blurb: "For a single unit getting started.",
    features: ["Up to 50 members", "Calendar + photos", "Group email", "Page editor + announcements"],
  },
  {
    id: "troop",
    name: "Troop",
    price: "$99/mo",
    blurb: "For active units with 50+ members.",
    features: [
      "Unlimited members",
      "Trip + meal planner",
      "Custom forms + payments",
      "Custom domain",
      "Priority support",
    ],
  },
  {
    id: "council",
    name: "Council",
    price: "Talk to us",
    blurb: "For councils rolling out across multiple units.",
    features: ["Bulk provisioning", "SSO", "DPA + BAA", "Volume pricing", "Dedicated CSM"],
  },
];

export const metadata = { title: "Pricing" };

export default function PlansPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16">
      <h1 className="font-display text-4xl font-semibold">Pricing</h1>
      <p className="mt-4 max-w-2xl text-ink-muted">
        Flat-fee. No platform cut on dues, donations, or trip payments.
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <div key={tier.id} className="card">
            <div className="font-display text-2xl font-semibold">{tier.name}</div>
            <div className="mt-1 text-ink-muted">{tier.blurb}</div>
            <div className="mt-6 text-3xl font-semibold">{tier.price}</div>
            <ul className="mt-6 space-y-2 text-sm">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-forest" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-primary mt-8 w-full justify-center">
              Choose {tier.name}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
