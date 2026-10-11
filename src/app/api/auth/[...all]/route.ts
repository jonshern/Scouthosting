// Better Auth's HTTP surface: OAuth callbacks, the email-verification
// link, and sign-out. Everything else is called server-side through
// `auth.api` from Compass's server actions.

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
