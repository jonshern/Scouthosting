// /account/profile — display name + email update. A new email is only
// applied after the link sent to it is clicked.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { resendVerificationEmail, updateProfile } from "@/server-actions/account";

export const metadata = { title: "Profile" };

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
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted">Your name and email, as your units see them.</p>
      </header>
      {verified === "1" && u?.emailVerified && (
        <p role="status" className="rounded-md border border-done/30 bg-done-soft p-3 text-sm text-done-text">
          Email confirmed.
        </p>
      )}
      {emailSent === "1" && (
        <p role="status" className="rounded-md border border-accent/20 bg-accent-soft p-3 text-sm text-accent-soft-text">
          We sent a link to your new address. Your email changes once you click it.
        </p>
      )}
      <form action={updateProfile} className="card space-y-4">
        <CsrfTokenInput />
        <div>
          <label className="label" htmlFor="profile-name">
            Display name
          </label>
          <input
            id="profile-name"
            name="displayName"
            defaultValue={u?.displayName ?? ""}
            autoComplete="name"
            className="field"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="profile-email">
            Email
          </label>
          <input
            id="profile-email"
            name="email"
            type="email"
            defaultValue={u?.email ?? ""}
            autoComplete="email"
            className="field"
            required
          />
          {!u?.emailVerified && (
            <p className="mt-1.5 text-xs text-attention-text">Not confirmed yet.</p>
          )}
        </div>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>
      {!u?.emailVerified && (
        <form action={resendVerificationEmail} className="card space-y-3">
          <CsrfTokenInput />
          <p className="text-sm text-ink-2">
            Confirm your email to connect your account to the unit that invited you.
          </p>
          <button type="submit" className="btn-secondary">
            {sent === "1" ? "Sent. Send again" : "Send confirmation email"}
          </button>
        </form>
      )}
    </div>
  );
}
