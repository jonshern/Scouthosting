import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MfaLoginForm } from "@/components/auth/MfaLoginForm";
import { PasskeySignIn } from "@/components/auth/PasskeySignIn";
import { auth } from "@/lib/auth/auth";
import { isSafeNextPath } from "@/lib/auth/post-login";
import { NEXT_COOKIE } from "@/lib/auth/social-routes";
import { readCsrfToken } from "@/lib/security/csrf";

export const metadata = { title: "Two-step sign-in" };
export const dynamic = "force-dynamic";

export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const pending = await auth.api.compassMfaPending({ headers: await headers() });
  if (!pending.pending) redirect("/login");

  // Where to go afterwards: ?next from a password sign-in, or the cookie
  // a Google/Apple sign-in left (lib/auth/social-routes.ts).
  const { next: nextParam } = await searchParams;
  const nextCookie = (await cookies()).get(NEXT_COOKIE)?.value;
  const next = [nextParam, nextCookie].find((n) => isSafeNextPath(n));
  const csrf = (await readCsrfToken()) ?? "";

  return (
    <section className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Two-step sign-in</h1>
      <p className="mt-2 text-ink-muted text-sm">
        {pending.passkey && pending.totp
          ? "Use your passkey, or enter the 6-digit code from your authenticator app or a backup code."
          : pending.passkey
            ? "Use your passkey to finish signing in."
            : "Enter the 6-digit code from your authenticator app, or one of your saved backup codes."}
      </p>
      <div className="mt-8 card space-y-6">
        {pending.passkey && <PasskeySignIn csrf={csrf} next={next} mode="second-step" />}
        {pending.totp && <MfaLoginForm csrf={<CsrfTokenInput />} next={next} />}
      </div>
    </section>
  );
}
