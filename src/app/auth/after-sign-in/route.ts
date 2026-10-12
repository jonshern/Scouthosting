// GET /auth/after-sign-in?next=/path — where Google/Apple sign-in lands.
// Sends the user to the same place a password sign-in would, after
// asking a brand-new account to confirm they are an adult.

import type { NextRequest } from "next/server";
import { redirectTo } from "@/lib/http/redirect";
import { getSession } from "@/lib/auth/session";
import { postLoginRedirectUrl } from "@/lib/auth/post-login";
import { accountStanding, CONFIRM_ADULT_PAGE, withNext } from "@/lib/auth/requirements";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user } = await getSession();
  if (!user) return redirectTo("/login");
  const dest = await postLoginRedirectUrl(user.id, req.nextUrl.searchParams.get("next"));
  // A first Google/Apple sign-in hasn't confirmed the user is an adult yet.
  if (!(await accountStanding(user.id)).adultConfirmed) {
    return redirectTo(withNext(CONFIRM_ADULT_PAGE, dest));
  }
  return redirectTo(dest);
}
