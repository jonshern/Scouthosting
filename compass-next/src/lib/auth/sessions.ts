import { cookies } from "next/headers";
import { lucia } from "./lucia";

export async function createSession(userId: string): Promise<void> {
  const session = await lucia.createSession(userId, {});
  const cookie = lucia.createSessionCookie(session.id);
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.attributes);
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
  if (sessionId) await lucia.invalidateSession(sessionId);
  const cookie = lucia.createBlankSessionCookie();
  cookieStore.set(cookie.name, cookie.value, cookie.attributes);
}
