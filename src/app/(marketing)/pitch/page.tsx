export const metadata = { title: "About" };

export default function PitchPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16 prose prose-stone max-w-3xl">
      <h1 className="font-display text-4xl font-semibold">About Compass</h1>
      <p className="text-ink-muted">
        Compass is the planning and communication hub for Scout units. We
        defer advancement tracking to Scoutbook (Scouting America&apos;s
        official tool) and focus on every other piece of the operating
        system: the calendar, the photos, the group email, the trip
        planning, the parent on-ramp, and the leader transition story.
      </p>
      <h2>Why we&apos;re building it</h2>
      <p>
        Most volunteer leaders glue together six free tools and a paper
        binder. Compass is the one thing that replaces all of them — and
        the one thing the next scoutmaster doesn&apos;t need a 90-minute
        Zoom call to take over.
      </p>
      <h2>Who it&apos;s for</h2>
      <p>
        Troops, packs, crews, ships, and posts. Council-level rollouts on
        request.
      </p>
    </section>
  );
}
