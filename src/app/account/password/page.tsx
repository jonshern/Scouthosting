// /account/password — change password (current + new + confirm).

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { changePassword } from "@/server-actions/account";

export const metadata = { title: "Change password" };

export default async function PasswordPage() {
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/password");

  return (
    <div className="max-w-xl">
      <h1 className="font-display font-semibold text-3xl mb-6">Change password</h1>
      <form action={changePassword} className="space-y-4 max-w-md">
        <CsrfTokenInput />
        <label className="block">
          <span className="block text-sm">Current password</span>
          <input name="current" type="password" className="input mt-1" required />
        </label>
        <label className="block">
          <span className="block text-sm">New password</span>
          <input
            name="next"
            type="password"
            minLength={12}
            className="input mt-1"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm">Confirm new password</span>
          <input
            name="confirm"
            type="password"
            minLength={12}
            className="input mt-1"
            required
          />
        </label>
        <button type="submit" className="btn-primary">
          Change password
        </button>
      </form>
    </div>
  );
}
