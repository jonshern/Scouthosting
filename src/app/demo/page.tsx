// The demo's front door: who you can sign in as, what's in the sample
// troop, and how the demo keeps itself safe. Only exists when
// DEMO_MODE=1 (src/lib/demo/mode.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { getSession } from "@/lib/auth/session";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoResetHours, isDemoMode } from "@/lib/demo/mode";
import { currentDemoUnit } from "@/lib/demo/reset";
import { demoResetAction, demoSignInAction } from "@/server-actions/demo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Try the demo" };

const ERRORS: Record<string, string> = {
  role: "Pick one of the accounts below.",
  busy: "Lots of sign-ins from here just now. Try again in a minute.",
  signin: "That account didn't sign in. The demo may be resetting; try again in a moment.",
  admin: "Only the demo Scoutmaster can reset the demo.",
};

function since(d: Date): string {
  const mins = Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  if (!isDemoMode()) notFound();
  const { error, reset } = await searchParams;
  const [unit, { user }] = await Promise.all([currentDemoUnit(), getSession()]);
  const signedInAs = user ? DEMO_ACCOUNTS.find((a) => a.email === user.email.toLowerCase()) : undefined;

  return (
    <main className="min-h-screen bg-bg px-5 py-12 text-ink md:py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">Compass demo</p>
        <h1 className="mt-3 font-display text-4xl font-normal tracking-[-0.015em] md:text-5xl">
          Try Compass with a <span className="italic text-accent">sample troop.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-[1.6] text-ink-muted">
          {unit?.displayName ?? "Troop 42"} of Maple Ridge is made up, and so is everyone in it. There&rsquo;s a
          campout, a badge day, patrol chats and dues going. Sign in as anyone below and click around. Nothing here
          reaches a real person.
        </p>

        {error && ERRORS[error] ? (
          <p className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{ERRORS[error]}</p>
        ) : null}
        {reset ? (
          <p className="mt-6 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            The demo is back to its starting point. Sign in again to keep exploring.
          </p>
        ) : null}

        <section aria-labelledby="accounts" className="mt-10">
          <h2 id="accounts" className="font-display text-2xl tracking-tight">
            Pick who to be
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {DEMO_ACCOUNTS.map((a) => (
              <form key={a.role} action={demoSignInAction} className="flex flex-col rounded-xl border border-line bg-white p-5">
                <CsrfTokenInput />
                <input type="hidden" name="role" value={a.role} />
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{a.title}</p>
                <p className="mt-1 font-display text-xl">{a.displayName}</p>
                <p className="mt-2 flex-1 text-sm leading-[1.55] text-ink-muted">{a.summary}</p>
                <p className="mt-3 font-mono text-xs text-ink-muted">{a.email}</p>
                <button
                  type="submit"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-surface-dark px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-soft"
                >
                  {signedInAs?.role === a.role ? `Continue as ${a.displayName.split(" ")[0]}` : `Sign in as ${a.displayName.split(" ")[0]}`}
                </button>
              </form>
            ))}
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            Prefer to type it? Every account&rsquo;s password is <code className="font-mono text-ink">{DEMO_PASSWORD}</code>{" "}
            on the <Link href="/login" className="text-accent underline-offset-2 hover:underline">sign-in page</Link>. The
            phone apps sign in the same way.
          </p>
        </section>

        <section aria-labelledby="rules" className="mt-12 grid gap-6 md:grid-cols-3">
          <h2 id="rules" className="sr-only">
            How the demo works
          </h2>
          <div>
            <h3 className="font-medium">Nothing gets sent</h3>
            <p className="mt-1 text-sm leading-[1.55] text-ink-muted">
              Emails and texts land in the{" "}
              <Link href="/demo/outbox" className="text-accent underline-offset-2 hover:underline">
                demo outbox
              </Link>{" "}
              so you can see what families would get.
            </p>
          </div>
          <div>
            <h3 className="font-medium">It resets itself</h3>
            <p className="mt-1 text-sm leading-[1.55] text-ink-muted">
              Every {demoResetHours()} hours the troop goes back to its starting point
              {unit ? `; the last reset was ${since(unit.createdAt)}` : ""}. Change anything you like.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Shared accounts</h3>
            <p className="mt-1 text-sm leading-[1.55] text-ink-muted">
              Other people may be signed in too, so you can&rsquo;t change passwords or emails here. Don&rsquo;t
              enter real names or contact info.
            </p>
          </div>
        </section>

        {signedInAs?.role === "admin" ? (
          <form action={demoResetAction} className="mt-12 rounded-xl border border-line bg-white p-5">
            <CsrfTokenInput />
            <p className="text-sm text-ink-muted">
              You&rsquo;re the demo Scoutmaster, so you can put everything back now. It signs everyone out.
            </p>
            <button type="submit" className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-ink/40">
              Reset the demo now
            </button>
          </form>
        ) : null}

        <p className="mt-12 text-xs leading-[1.55] text-ink-muted">
          Compass is independent and not affiliated with or endorsed by any scouting organization. Everyone in this
          demo is made up.
        </p>
      </div>
    </main>
  );
}
