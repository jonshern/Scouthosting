// /logout — end the session and bounce to the apex
// home. Implemented as a Route Handler (not a server component page)
// because Next 16 only allows cookie mutation from Route Handlers
// and Server Actions.

import { endSession } from "@/lib/auth/sessions";
import { redirectTo } from "@/lib/http/redirect";

export async function GET() {
  await endSession();
  return redirectTo("/");
}

export async function POST() {
  // Some clients submit a form POST to /logout; treat the same as GET.
  return GET();
}
