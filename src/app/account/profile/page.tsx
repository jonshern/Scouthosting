// /account/profile — display name + email update.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/lucia";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { updateProfile } from "@/server-actions/account";

export default async function ProfilePage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/profile");
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { displayName: true, email: true, emailVerified: true },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Profile</h1>
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
            <p className="mt-1 text-xs text-amber-700">
              Email not yet verified.
            </p>
          )}
        </label>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>
    </main>
  );
}
