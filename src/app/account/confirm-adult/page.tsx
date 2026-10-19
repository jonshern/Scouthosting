// /account/confirm-adult — asked once of a new Google/Apple sign-in
// (password sign-ups confirm on the form). See lib/auth/requirements.ts.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { isSafeNextPath } from "@/lib/auth/post-login";
import { accountStanding } from "@/lib/auth/requirements";
import { confirmAdult } from "@/server-actions/account";
import { logoutAction } from "@/server-actions/auth";

export const metadata = { title: "Confirm your age" };
export const dynamic = "force-dynamic";

export default async function ConfirmAdultPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/login");
  const safeNext = isSafeNextPath(next) ? next! : "/account/profile";
  if ((await accountStanding(user.id)).adultConfirmed) redirect(safeNext);

  return (
    <main className="mx-auto max-w-md px-6 py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">One more step</h1>
        <p className="text-sm text-ink-muted">
          Compass accounts are for adults. Scouts get access through a parent or guardian&apos;s
          account.
        </p>
      </header>
      {error === "1" && (
        <p role="alert" className="rounded border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          Tick the box to continue.
        </p>
      )}
      <form action={confirmAdult} className="space-y-4">
        <CsrfTokenInput />
        <input type="hidden" name="next" value={safeNext} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="adult" value="yes" required className="mt-1" />
          <span>I confirm I am 18 or older.</span>
        </label>
        <button type="submit" className="btn-primary w-full">
          Continue
        </button>
      </form>
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-ink-muted underline">
          I&apos;m under 18, sign me out
        </button>
      </form>
    </main>
  );
}
