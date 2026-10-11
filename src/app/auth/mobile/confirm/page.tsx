// /auth/mobile/confirm?redirect=compass://... — the user taps Continue
// to hand the phone app a sign-in token. See ../begin/route.ts.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { allowedMobileRedirect } from "@/lib/auth/mobile-redirect";
import { isProd } from "@/lib/env";

export const metadata = { title: "Sign in on this phone" };
export const dynamic = "force-dynamic";

export default async function MobileConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectRaw = "" } = await searchParams;
  if (!allowedMobileRedirect(redirectRaw, isProd())) redirect("/");
  const { user } = await getSession();
  if (!user) {
    const begin = `/auth/mobile/begin?redirect=${encodeURIComponent(redirectRaw)}`;
    redirect(`/login?next=${encodeURIComponent(begin)}`);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">Sign in on this phone</h1>
        <p className="text-sm text-ink-muted">
          Continue as <strong>{user.displayName || user.email}</strong> on this phone? Only do this if
          you opened sign-in from the app yourself.
        </p>
      </header>
      <form action="/auth/mobile/begin" method="post">
        <CsrfTokenInput />
        <input type="hidden" name="redirect" value={redirectRaw} />
        <button type="submit" className="btn-primary w-full">
          Continue
        </button>
      </form>
    </main>
  );
}
