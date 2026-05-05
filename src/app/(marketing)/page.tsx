import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="bg-bone">
        <div className="mx-auto max-w-content px-6 py-20 md:py-28">
          <h1 className="font-display text-4xl md:text-6xl font-semibold tracking-tight text-ink">
            One hub for your unit&apos;s calendar, photos, and group email.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-muted">
            Compass gives every troop, pack, crew, or ship a modern, mobile-first website
            plus a private member hub. Scoutbook handles advancement; Compass handles
            everything else leaders are gluing together with seven different apps.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/signup" className="btn-primary text-base px-6 py-3">Start a site</Link>
            <Link href="/plans" className="btn-secondary text-base px-6 py-3">See pricing</Link>
          </div>
        </div>
      </section>
      <section className="bg-white border-y border-ink-muted/15">
        <div className="mx-auto max-w-content px-6 py-16 grid gap-10 md:grid-cols-3">
          <Feature title="Calendar that adds itself" body="Events on your site sync to a Google Calendar add-button per event, with directions and RSVP in one tap." />
          <Feature title="Group email that lands" body="Per-org sender, DKIM-aligned, bounce + complaint handling. Members reply and parents see it." />
          <Feature title="Trip + meal planner" body="Headcount in, recipe scaling and a printable shopping list out — minus the dietary-conflict allergens." />
          <Feature title="Photos parents will look at" body="Drag-and-drop albums, private to your unit by default, with face-tagging-free privacy." />
          <Feature title="A CMS leaders use" body="Block-based pages, announcements, custom forms. The next scoutmaster won&apos;t need a phone call to update the about page." />
          <Feature title="Defers to Scoutbook" body="Compass deep-links to Scoutbook for advancement instead of competing with it. One source of truth, in the right place." />
        </div>
      </section>
    </>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-ink-muted">{body}</p>
    </div>
  );
}
