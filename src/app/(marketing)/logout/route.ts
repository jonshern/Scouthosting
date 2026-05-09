// /logout — flush the Lucia session cookie and bounce to the apex
// home. Implemented as a Route Handler (not a server component page)
// because Next 16 only allows cookie mutation from Route Handlers
// and Server Actions.

import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/sessions";

export async function GET(req: Request) {
  await endSession();
  const url = new URL("/", req.url);
  return NextResponse.redirect(url);
}

export async function POST(req: Request) {
  // Some clients submit a form POST to /logout; treat the same as GET.
  return GET(req);
}
