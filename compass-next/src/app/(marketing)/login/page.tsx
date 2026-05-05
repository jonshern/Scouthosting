import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-ink-muted text-sm">
        New here? <Link href="/signup">Create an account</Link>.
      </p>
      <div className="mt-8 card">
        <LoginForm csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
