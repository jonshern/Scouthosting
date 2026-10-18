// /contact — ask a question, report a problem or share an idea about
// Compass, Waypoint or Lantern. Goes to the owner console inbox.

import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { getSession } from "@/lib/auth/session";
import { submitContact } from "@/server-actions/contact";

export const metadata = { title: "Contact us" };
export const dynamic = "force-dynamic";

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const { user } = await getSession();
  const product = ["compass", "waypoint", "lantern"].includes(sp.product ?? "") ? sp.product : "unsure";

  return (
    <section className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-4xl">Contact us</h1>
      <p className="mt-2 text-ink-muted">
        A question, something that isn&apos;t working, or an idea. A real person reads every one and writes back.
      </p>

      {sp.sent ? (
        <p role="status" className="mt-8 rounded-md bg-success-soft px-4 py-3 text-success">
          Thanks, we got it. We&apos;ll write back to your email.
        </p>
      ) : (
        <form action={submitContact} className="mt-8 space-y-4">
          <CsrfTokenInput />
          {sp.error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-danger">
              {sp.error}
            </p>
          ) : null}
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" name="name" required maxLength={120} defaultValue={user?.displayName ?? ""} className="field w-full" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required defaultValue={user?.email ?? ""} className="field w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="product">
                About
              </label>
              <select id="product" name="product" defaultValue={product} className="field w-full">
                <option value="unsure">Not sure</option>
                <option value="compass">Compass (troop website)</option>
                <option value="waypoint">Waypoint (merit badges)</option>
                <option value="lantern">Lantern (scout trail)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="kind">
                Type
              </label>
              <select id="kind" name="kind" defaultValue="question" className="field w-full">
                <option value="question">Question</option>
                <option value="bug">Something&apos;s not working</option>
                <option value="feature">Idea</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="message">
              Message
            </label>
            <textarea id="message" name="message" required minLength={5} maxLength={8000} rows={7} className="field w-full" />
          </div>
          <button type="submit" className="btn-primary">
            Send
          </button>
        </form>
      )}
    </section>
  );
}
