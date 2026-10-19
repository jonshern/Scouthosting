// /account/profile — display name + email update. A new email is only
// applied after the link sent to it is clicked.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { resendVerificationEmail, updateProfile } from "@/server-actions/account";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; sent?: string; emailSent?: string }>;
}) {
  const { verified, sent, emailSent } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/profile");
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { displayName: true, email: true, emailVerified: true },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display font-semibold text-3xl mb-6">Profile</h1>
      {verified === "1" && u?.emailVerified && (
        <p role="status" className="mb-4 max-w-md rounded border border-done/30 bg-done-soft p-3 text-sm text-done-text">
          Email confirmed.
        </p>
      )}
      {emailSent === "1" && (
        <p role="status" className="mb-4 max-w-md rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          We sent a link to your new address. Your email changes once you click it.
        </p>
      )}
      <form action={updateProfile} className="space-y-4 max-w-md">
        <CsrfTokenInput />
        <label className="block">
          <span className="block text-sm">Display name</span>
          <input
            name="displayName"
            defaultValue={u?.displayName ?? ""}
            className="input mt-1"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm">Email</span>
          <input
            name="email"
            type="email"
            defaultValue={u?.email ?? ""}
            className="input mt-1"
            required
          />
          {!u?.emailVerified && (
            <p className="mt-1 text-xs text-attention-text">
              Email not yet verified.
            </p>
          )}
        </label>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>
      {!u?.emailVerified && (
        <form action={resendVerificationEmail} className="mt-6 max-w-md">
          <CsrfTokenInput />
          <p className="text-sm text-slate-muted">
            Confirm your email to connect your account to the unit that invited you.
          </p>
          <button type="submit" className="btn-secondary mt-2">
            {sent === "1" ? "Sent. Send again" : "Send confirmation email"}
          </button>
        </form>
      )}
      <p className="mt-10 text-sm">
        Lantern trails: <a href="/account/trails" className="underline">download a copy or put one back</a>.
      </p>
      <p className="mt-4 text-sm">
        <a href="/account/delete" className="text-danger underline">
          Delete my account
        </a>
      </p>
      <p className="mt-4 text-sm text-slate-muted">
        Signed-in phones and apps, and Claude:{" "}
        <a href="/account/api-tokens" className="underline">
          API tokens and Claude connections
        </a>
        .
      </p>
    </main>
  );
}
