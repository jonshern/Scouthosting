// The owner console's access check. Every page under /super-admin calls
// it itself rather than leaning on the layout: Next can render a page
// segment without re-running its layout (a client-side navigation sends
// the layout tree it already has), so a check that lives only in the
// layout doesn't protect the page's data.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { classifyHost } from "@/lib/tenancy/resolve";
import { accountStanding, requirementRedirect, withNext } from "@/lib/auth/requirements";

export async function requireOwnerPage(next = "/super-admin") {
  const h = await headers();
  if (classifyHost(h.get("host")).kind !== "apex") redirect("/");

  const { user } = await getSession();
  if (!user || !user.isSuperAdmin) redirect(`/login?next=${encodeURIComponent(next)}`);
  const gate = requirementRedirect(await accountStanding(user.id), { organizerSurface: true });
  if (gate) redirect(withNext(gate, next));
  return user;
}
