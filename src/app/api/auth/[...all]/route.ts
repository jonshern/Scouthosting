// Better Auth's HTTP surface: OAuth callbacks, the email-verification
// link, and sign-out. Everything else is called server-side through
// `auth.api` from Compass's server actions.

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";
import { withSignInScheme } from "@/lib/auth/social-routes";

export const dynamic = "force-dynamic";

const handler = toNextJsHandler(async (req: Request) => auth.handler(await withSignInScheme(req)));

export const { GET, POST } = handler;
