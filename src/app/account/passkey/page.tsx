// The prompt right after sign-up: make a passkey now, so the next sign-in
// is a fingerprint, face or device PIN instead of a password. Skipping is
// one click; passkeys can be added later on /account/security.

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isSafeNextPath } from "@/lib/auth/post-login";
import { relyingPartyForRequest } from "@/lib/auth/passkeys";
import { readCsrfToken } from "@/lib/security/csrf";
import { AddPasskey } from "@/components/account/PasskeySettings";

export const metadata = { title: "Add a passkey" };
export const dynamic = "force-dynamic";

export default async function PasskeyPromptPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = isSafeNextPath(next) ? next! : "/account/profile";
  const { user } = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(target)}`);
  const [rp, hasPasskey, csrf] = await Promise.all([
    headers().then(relyingPartyForRequest),
    prisma.passkey.count({ where: { userId: user.id } }),
    readCsrfToken(),
  ]);
  if (!rp || hasPasskey > 0) redirect(target);

  return (
    <section className="mx-auto max-w-md px-6 py-16 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">Sign in faster next time</h1>
        <p className="text-sm text-ink-muted">
          Add a passkey and you&apos;ll sign in with your fingerprint, face or device PIN. No password to
          type or forget. It stays on your phone or computer (and syncs if you use iCloud Keychain or Google
          Password Manager).
        </p>
      </header>
      <AddPasskey csrf={csrf ?? ""} continueTo={target} label="Add a passkey" />
      <p className="text-center text-sm">
        <Link href={target} className="text-ink-muted underline">
          Skip for now
        </Link>
      </p>
      <p className="text-xs text-ink-muted">You can add or remove passkeys any time from your account&apos;s Security page.</p>
    </section>
  );
}
