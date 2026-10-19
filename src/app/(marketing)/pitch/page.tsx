import Link from "next/link";
import { InfoCard, PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "About" };

export default function PitchPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16 md:py-20">
      <PageHero
        eyebrow="About"
        title="About Compass"
        lede="Compass is the planning and communication hub for Scout units: the calendar, photos, group email, trip planning, getting new parents set up, and handing the unit to the next leader. Advancement stays in Scoutbook, Scouting America's official tool."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <InfoCard title="Why we're building it">
          Most volunteer leaders glue together six free tools and a paper binder. Compass replaces all of them, and
          the next scoutmaster doesn&apos;t need a 90-minute Zoom call to take over.
        </InfoCard>
        <InfoCard title="Who it's for">
          Troops, packs, crews, ships and posts. Council-wide setups on request.
        </InfoCard>
      </div>
      <p className="mt-10 text-sm text-muted">
        Questions? <Link href="/contact">Get in touch</Link>.
      </p>
    </section>
  );
}
