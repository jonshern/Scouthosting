// Login page (Modern Clean, shared sign-in board): the sign-in form on
// the left, a white panel on the right saying one account covers every
// unit and app. Google and Apple come first when their keys are set
// (components/auth/SocialSignIn.tsx), then passkeys, and email +
// password is folded behind a small link (open when the browser has no
// passkeys). With no Google/Apple keys the page starts at passkeys.

import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PasskeySignIn, PasswordSignIn } from "@/components/auth/PasskeySignIn";
import { readCsrfToken } from "@/lib/security/csrf";
import { supportEmail } from "@/lib/support";
import { SuiteApps } from "@/components/auth/SuiteApps";
import { SocialSignIn, socialSignInAvailable } from "@/components/auth/SocialSignIn";

export const metadata = { title: "Sign in" };

// Google/Apple sign-in failures come back as /login?error=<code>.
function ssoErrorMessage(code: string): string {
  if (code === "account_not_linked") {
    return "There's already a Compass account with that email. Sign in with your password, confirm your email from your profile page, then Google or Apple sign-in will work too.";
  }
  if (code === "email_not_found") {
    return "Your Google or Apple account didn't share an email address, so we can't sign you in with it.";
  }
  return "Google or Apple sign-in didn't finish. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const signupQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const ssoError = error ? ssoErrorMessage(error) : null;
  const csrf = (await readCsrfToken()) ?? "";
  return (
    <main className="bg-bg md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      {/* Sign-in form */}
      <section className="flex flex-col justify-center px-6 py-14 md:px-12 md:py-20">
        <div className="mx-auto w-full max-w-[400px]">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em]">Sign in</h1>
          <p className="mt-2 text-[15px] text-muted">
            Welcome back. Pick up where the troop left off. New here?{" "}
            <Link href={`/signup${signupQuery}`} className="font-medium no-underline">
              Create an account
            </Link>
            .
          </p>

          {ssoError && (
            <div role="alert" className="mt-6 rounded-md border border-danger-line bg-danger-soft p-3 text-sm text-danger">
              {ssoError}
            </div>
          )}

          {socialSignInAvailable() && (
            <>
              <SocialSignIn next={next} className="mt-8" />
              <div className="mt-6 flex items-center gap-3 text-[13px] text-muted">
                <span className="h-px flex-1 bg-line" />
                <span>Or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <div className={socialSignInAvailable() ? "mt-6" : "mt-8"}>
            <PasskeySignIn csrf={csrf} next={next} mode="sign-in" />
          </div>

          <div className="mt-5">
            <PasswordSignIn
              csrf={csrf}
              csrfInput={<CsrfTokenInput />}
              next={next}
              startOpen={error === "account_not_linked"}
            />
          </div>

          <p className="mt-8 text-[13px] leading-[1.55] text-muted">
            Trouble signing in? Ask the unit&apos;s scoutmaster to re-send your
            invite, or <a href={`mailto:${supportEmail()}`}>email us</a>.
          </p>
        </div>
      </section>

      {/* One account panel */}
      <aside className="flex flex-col justify-center gap-7 border-t border-line bg-surface px-6 py-12 md:border-l md:border-t-0 md:px-10">
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow">One account</span>
          <h2 className="max-w-[400px] text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]">
            One sign-in covers every unit you serve.
          </h2>
          <p className="max-w-[420px] text-[15px] leading-[1.55] text-ink-2">
            Compass remembers which troop you opened last and lands you there —
            switch any time from the top nav.
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
