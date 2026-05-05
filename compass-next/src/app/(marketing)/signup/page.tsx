import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <section className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Create your account</h1>
      <p className="mt-2 text-ink-muted text-sm">
        Already have one? <Link href="/login">Sign in</Link>.
      </p>
      <div className="mt-8 card">
        <SignupForm csrf={<CsrfTokenInput />} />
        <div className="mt-4">
          <a href="/api/auth/google/begin" className="btn-secondary w-full block text-center">
            Continue with Google
          </a>
        </div>
      </div>
    </section>
  );
}
