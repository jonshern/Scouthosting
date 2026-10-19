import Link from "next/link";
import { InfoCard, PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Why Compass" };

export default function PositioningPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16 md:py-20">
      <PageHero
        eyebrow="Why Compass"
        title={
          <>
            Why Compass{" "}
            <span className="text-muted">and not the usual mix.</span>
          </>
        }
        lede="Most units run on a Facebook group, a spreadsheet, a group text and a site from 2008. Here's how Compass compares."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <InfoCard title="vs. a Facebook group">
          Events get buried and parents who aren&apos;t on Facebook never see the meeting time. Compass gives you a
          real website, email list and calendar.
        </InfoCard>
        <InfoCard title="vs. Scoutbook">
          Scoutbook handles advancement and we don&apos;t compete with it. Compass links to it instead of asking you
          to type the same thing twice.
        </InfoCard>
        <InfoCard title="vs. the old troop hosting sites">
          They work, but they look and feel like 2008. Compass works on a phone, it&apos;s quick, and it&apos;s
          built for the volunteer with 12 minutes before tonight&apos;s meeting.
        </InfoCard>
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/start" className="btn-primary">
          Start a trial
        </Link>
        <Link href="/plans" className="btn-secondary">
          See pricing
        </Link>
      </div>
    </section>
  );
}
