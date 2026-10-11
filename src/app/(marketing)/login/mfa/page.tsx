import { redirect } from "next/navigation";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { MfaLoginForm } from "@/components/auth/MfaLoginForm";
import { hasPendingMfaChallenge } from "@/server-actions/auth";

export const metadata = { title: "Two-factor sign-in" };
export const dynamic = "force-dynamic";

export default async function MfaLoginPage() {
  if (!(await hasPendingMfaChallenge())) redirect("/login");

  return (
    <section className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Two-factor sign-in</h1>
      <p className="mt-2 text-ink-muted text-sm">
        Enter the 6-digit code from your authenticator app, or one of your saved backup codes.
      </p>
      <div className="mt-8 card">
        <MfaLoginForm csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
