import { redirect } from "next/navigation";
import { logoutAction } from "@/server-actions/auth";

export default async function LogoutPage() {
  await logoutAction();
  redirect("/");
}
