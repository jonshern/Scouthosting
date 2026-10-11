import { headers } from "next/headers";
import { auth } from "./auth";

/** Sign out the current browser: deletes the Session row and clears the cookie. */
export async function endSession(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // No session to end; the cookie is already gone or invalid.
  }
}
