// /account — the avatar menu's target. Profile is the account home.

import { redirect } from "next/navigation";

export default function AccountIndex() {
  redirect("/account/profile");
}
