// Signup page. Same layout as /login (Modern Clean, shared sign-in
// board): the form on the left, the one-account panel on the right.

import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { SignupForm } from "@/components/auth/SignupForm";
import { SuiteApps } from "@/components/auth/SuiteApps";
import { SocialSignIn, socialSignInAvailable } from "@/components/auth/SocialSignIn";

export const metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Kept through sign-up so the phone apps' sign-in (/auth/mobile/begin)
  // comes back to the app after a new account is made.
  const { next } = await searchParams;
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="bg-bg md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <section className="flex flex-col justify-center px-6 py-14 md:px-12 md:py-20">
        <div className="mx-auto w-full max-w-[400px]">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em]">Create your account</h1>
          <p className="mt-2 text-[15px] text-muted">
            Already have one?{" "}
            <Link href={`/login${nextQuery}`} className="font-medium no-underline">
              Sign in
            </Link>
            .
          </p>

          {socialSignInAvailable() && (
            <>
              <SocialSignIn next={next} className="mt-8" />
              <div className="mt-7 flex items-center gap-3 text-[13px] text-muted">
                <span className="h-px flex-1 bg-line" />
                <span>Or with email</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <div className="mt-6">
            <SignupForm csrf={<CsrfTokenInput />} next={next} />
          </div>
        </div>
      </section>

      <aside className="flex flex-col justify-center gap-7 border-t border-line bg-surface px-6 py-12 md:border-l md:border-t-0 md:px-10">
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow">One account</span>
          <h2 className="max-w-[400px] text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]">
            Start with your first meeting on the calendar.
          </h2>
          <p className="max-w-[420px] text-[15px] leading-[1.55] text-ink-2">
            Compass is invite-only for now. Your scoutmaster sets up
            the unit, then sends you a link — no password to remember if you
            don&apos;t want one.
          </p>
        </div>
        <SuiteApps />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>Encrypted at rest</span>
          <span aria-hidden>·</span>
          <span>COPPA-conscious</span>
          <span aria-hidden>·</span>
          <span>US-hosted</span>
        </div>
      </aside>
    </main>
  );
}
