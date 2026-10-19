// /start — self-serve sign-up. Step 1 creates the adult's account
// (or signs in), step 2 creates the unit and starts its free trial
// (lib/provision/self-serve.ts). Every "Start your free trial" button
// on the marketing site and the family landing page points here.

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { accountStanding, CONFIRM_ADULT_PAGE, withNext } from "@/lib/auth/requirements";
import { prisma } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/billing/trial";
import { PRICES } from "@/lib/billing/pricing";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { SignupForm } from "@/components/auth/SignupForm";
import { StartTrialForm } from "@/components/auth/StartTrialForm";

export const metadata = { title: "Start your free trial" };
export const dynamic = "force-dynamic";

const NEXT = "/start";

function Step({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <li className={`flex items-center gap-2 ${active ? "text-ink font-semibold" : "text-slate-muted"}`}>
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${active ? "bg-sky text-white" : "border border-line"}`}
      >
        {n}
      </span>
      {label}
    </li>
  );
}

export default async function StartPage() {
  const { user } = await getSession();
  const standing = user ? await accountStanding(user.id) : null;
  const owned = user
    ? await prisma.org.findMany({
        where: { ownerId: user.id },
        select: { slug: true, displayName: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <section className="mx-auto grid max-w-content gap-12 px-6 py-14 md:grid-cols-[1fr_440px]">
      <div className="max-w-[520px]">
        <span className="inline-flex items-center gap-2 rounded-full bg-sky px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
          {TRIAL_DAYS} days free · no card required
        </span>
        <h1 className="mt-6 font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.02em] md:text-[56px]">
          Set up your unit{" "}
          <em className="font-normal text-sky">in about five minutes.</em>
        </h1>
        <p className="mt-6 text-[16px] leading-[1.6] text-slate-soft">
          One account covers the whole family: Compass for your troop or pack&apos;s site and
          calendar, Waypoint for merit badge counselors and badge days, and Lantern for each
          scout&apos;s path. Your first month is free. If it works for your unit, keep it for{" "}
          {PRICES.year.long} or {PRICES.month.long}, billed automatically after the trial. If
          not, do nothing and nothing is charged.
        </p>
        <ol className="mt-8 space-y-3 text-sm">
          <Step n={1} label="Create your adult account" active={!user} />
          <Step n={2} label="Name your unit" active={!!user} />
          <Step n={3} label="Invite your leaders and families" active={false} />
        </ol>
      </div>

      <div className="rounded-xl border border-line bg-white p-7">
        {!user ? (
          <>
            <h2 className="font-display text-2xl font-semibold">Create your account</h2>
            <p className="mt-1 text-sm text-slate-muted">
              Already have one?{" "}
              <Link href={`/login?next=${encodeURIComponent(NEXT)}`} className="font-medium text-sky">
                Sign in
              </Link>
              .
            </p>
            <div className="mt-6 grid gap-2.5">
              <a
                href={`/api/auth/google/begin?next=${encodeURIComponent(NEXT)}`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink hover:border-slate-ink/40"
              >
                Continue with Google
              </a>
              <a
                href={`/api/auth/apple/begin?next=${encodeURIComponent(NEXT)}`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink hover:border-slate-ink/40"
              >
                Continue with Apple
              </a>
            </div>
            <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-muted">
              <span className="h-px flex-1 bg-line" />
              <span>Or with email</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <SignupForm csrf={<CsrfTokenInput />} next={NEXT} />
          </>
        ) : !standing?.adultConfirmed ? (
          <>
            <h2 className="font-display text-2xl font-semibold">One quick check</h2>
            <p className="mt-2 text-sm text-slate-soft">
              Units are run by adults. Confirm you&apos;re 18 or older to continue.
            </p>
            <Link href={withNext(CONFIRM_ADULT_PAGE, NEXT)} className="btn-primary mt-6 w-full justify-center">
              Continue →
            </Link>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold">Tell us about your unit</h2>
            <p className="mt-1 text-sm text-slate-muted">
              Signed in as {user.email}. You&apos;ll be the unit&apos;s admin.
            </p>
            {owned.length > 0 && (
              <p className="mt-3 rounded-md bg-bg p-3 text-xs text-slate-soft">
                You already run{" "}
                {owned.map((o, i) => (
                  <span key={o.slug}>
                    {i > 0 && ", "}
                    <Link href={`/o/${o.slug}/admin`} className="font-medium text-sky">
                      {o.displayName}
                    </Link>
                  </span>
                ))}
                . Fill this in only to add another unit.
              </p>
            )}
            <div className="mt-6">
              <StartTrialForm csrf={<CsrfTokenInput />} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
