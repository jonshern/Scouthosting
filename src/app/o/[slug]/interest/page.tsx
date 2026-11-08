// /o/[slug]/interest — "Join our troop": a family asks about joining.
// Sent to the Scoutmaster and added to the roster's Pending list
// (server-actions/interest.ts). Public; no account needed.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { INTEREST_AGES, unitWord } from "@/lib/members/interest-mail";
import { orgBasePath } from "@/lib/tenancy/base-path";
import { submitInterest } from "@/server-actions/interest";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug }, select: { unitType: true } });
  return { title: org ? `Join our ${unitWord(org.unitType)}` : "Join" };
}

export default async function InterestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await prisma.org.findUnique({
    where: { slug },
    select: { slug: true, displayName: true, unitType: true, meetingDay: true, meetingTime: true, meetingLocation: true, suspendedAt: true },
  });
  if (!org || org.suspendedAt) notFound();
  const base = await orgBasePath(slug);
  const word = unitWord(org.unitType);
  const meets = org.meetingDay
    ? `We meet ${org.meetingDay}${org.meetingTime ? ` at ${org.meetingTime}` : ""}${org.meetingLocation ? ` at ${org.meetingLocation}` : ""}.`
    : null;

  return (
    <section className="mx-auto grid max-w-content gap-10 px-6 pb-16 pt-12 md:grid-cols-[0.9fr_1.1fr] md:pt-16">
      <div className="space-y-4">
        <div className="eyebrow">Join us</div>
        <h1 className="text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink md:text-[44px]">
          Join our {word}
        </h1>
        <p className="text-[17px] leading-relaxed text-ink-2">
          Tell us a little about your family and a leader from {org.displayName} will get back to you, usually within a few days.
          Come visit a meeting first. No commitment.
        </p>
        {meets ? <p className="text-[15px] text-ink-2">{meets}</p> : null}
        <p className="text-sm text-muted">
          We only use this to write back to you. <Link href={`${base}/calendar`}>See what we&apos;re up to →</Link>
        </p>
      </div>

      {sp.sent ? (
        <div role="status" className="self-start rounded-xl border border-line bg-surface p-6">
          <h2 className="text-xl font-semibold text-ink">Thanks, we got it.</h2>
          <p className="mt-2 text-ink-2">A leader will write back to the email you gave us.</p>
          <Link href={base || "/"} className="btn-secondary mt-5 inline-flex no-underline">
            Back to {org.displayName}
          </Link>
        </div>
      ) : (
        <form action={submitInterest} className="card space-y-4 self-start">
          <CsrfTokenInput />
          <input type="hidden" name="orgSlug" value={org.slug} />
          {sp.error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              {sp.error}
            </p>
          ) : null}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink">You</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="firstName">First name</label>
                <input id="firstName" name="firstName" required maxLength={80} autoComplete="given-name" className="field w-full" />
              </div>
              <div>
                <label className="label" htmlFor="lastName">Last name</label>
                <input id="lastName" name="lastName" required maxLength={80} autoComplete="family-name" className="field w-full" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className="field w-full" />
              </div>
              <div>
                <label className="label" htmlFor="phone">
                  Phone <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" className="field w-full" />
              </div>
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink">
              Your scout <span className="font-normal text-muted">(optional)</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div>
                <label className="label" htmlFor="scoutName">Name</label>
                <input id="scoutName" name="scoutName" maxLength={80} className="field w-full" />
              </div>
              <div>
                <label className="label" htmlFor="scoutAge">Age</label>
                <select id="scoutAge" name="scoutAge" defaultValue="" className="field w-full">
                  <option value="">—</option>
                  {INTEREST_AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="message">
              Anything we should know? <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="message" name="message" maxLength={2000} rows={4} className="field w-full" />
          </div>
          <button type="submit" className="btn-primary min-h-[48px] w-full sm:w-auto">
            Send
          </button>
        </form>
      )}
    </section>
  );
}
