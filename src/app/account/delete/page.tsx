// /account/delete — delete your own account. The phone apps link here.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { blockerMessage, deletionBlockers } from "@/lib/account/delete";
import { deleteMyAccount } from "@/server-actions/delete-account";
import { isDemoMode } from "@/lib/demo/mode";

export const metadata = { title: "Delete account" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  confirm: "That isn't your email address. Type it exactly to delete the account.",
  demo: "The demo's accounts can't be deleted.",
};

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/delete");
  const blockers = await deletionBlockers(user.id);

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display font-semibold text-3xl mb-6">Delete account</h1>
      <div className="max-w-md space-y-4 text-sm">
        <p>Deleting your account signs you out everywhere, including the phone apps, and can&apos;t be undone.</p>
        <p>
          Your name, email, password and sign-ins are removed, along with your Lantern trails and
          counselor listing. You leave every unit and chat you&apos;re in.
        </p>
        <p>
          Your troop keeps its own records: messages you sent (shown from &quot;Former member&quot;),
          RSVPs, sign-offs and payments. Ask your unit&apos;s leaders if you want anything on the
          roster changed.
        </p>
        {error && ERRORS[error] && (
          <p role="alert" className="rounded border border-danger-line bg-danger-soft p-3 text-danger">
            {ERRORS[error]}
          </p>
        )}
        {blockers.length > 0 ? (
          <div role="status" className="rounded border border-attention/30 bg-attention-soft p-3 text-attention-text">
            <p className="font-semibold">You can&apos;t delete your account yet.</p>
            <ul className="mt-2 list-disc pl-5">
              {blockers.map((b) => (
                <li key={b.kind === "only_admin" ? b.orgId : b.kind}>{blockerMessage(b)}</li>
              ))}
            </ul>
          </div>
        ) : isDemoMode() ? (
          <p>{ERRORS.demo}</p>
        ) : (
          <form action={deleteMyAccount} className="space-y-4">
            <CsrfTokenInput />
            <label className="block">
              <span className="block">
                Type your email, <strong>{user.email}</strong>, to confirm
              </span>
              <input
                name="confirm"
                type="email"
                autoComplete="off"
                className="input mt-1"
                required
              />
            </label>
            <button type="submit" className="btn-primary bg-red-700 hover:bg-red-800">
              Delete my account
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
