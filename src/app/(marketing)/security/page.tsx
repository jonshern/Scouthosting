import Link from "next/link";
import { InfoCard, PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-16 md:py-20">
      <PageHero
        eyebrow="Security"
        title={
          <>
            Security and trust,{" "}
            <span className="text-muted">built in.</span>
          </>
        }
        lede="Units keep kids' names, addresses and medical notes in Compass. Here's how we look after them."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <InfoCard title="Two-deep leadership in chat">
          An adult can&apos;t message a scout one-on-one. A second adult has to be in the conversation, and the
          server checks it, not just the app.
        </InfoCard>
        <InfoCard title="Two-step sign-in for leaders">
          Leaders and admins sign in with a passkey, Google or Apple, or a password plus a code from an
          authenticator app. Backup codes cover a lost phone.
        </InfoCard>
        <InfoCard title="Encrypted roster and photos">
          Names, phone numbers, addresses and photos are encrypted with a key that belongs to your unit alone.
          Passwords are hashed with argon2id.
        </InfoCard>
        <InfoCard title="Each unit kept separate">
          Every record belongs to one unit, and every page and app request checks that you&apos;re a member
          before it shows anything.
        </InfoCard>
        <InfoCard title="A log of every change">
          When a leader changes the roster, the money or the site, Compass records who, what and when. Admins can
          read it any time.
        </InfoCard>
        <InfoCard title="Backups we actually test">
          Encrypted backups every day and before every update, kept off-site, and we practice restoring them.
        </InfoCard>
      </div>
      <p className="mt-10 text-sm text-muted">
        Found a problem? <Link href="/contact">Tell us</Link> and we&apos;ll get back to you quickly.
      </p>
    </section>
  );
}
