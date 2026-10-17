"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { endSession } from "@/lib/auth/sessions";
import { AccountDeletionBlocked, deleteAccount, deletionBlockers } from "@/lib/account/delete";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { isDemoMode } from "@/lib/demo/mode";

export async function deleteMyAccount(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login?next=/account/delete");
  if (isDemoMode()) redirect("/account/delete?error=demo");

  // Typing the address is the "are you sure": it can't be done by a
  // stray tap, and works the same for password and Google/Apple accounts.
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) redirect("/account/delete?error=confirm");
  if ((await deletionBlockers(user.id)).length) redirect("/account/delete");

  await endSession();
  try {
    await deleteAccount(user.id);
  } catch (e) {
    if (e instanceof AccountDeletionBlocked) redirect("/login?next=/account/delete");
    throw e;
  }
  redirect("/account/delete/done");
}
