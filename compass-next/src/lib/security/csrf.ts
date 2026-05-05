import { cookies, headers } from "next/headers";
import crypto from "node:crypto";

const COOKIE_NAME = "compass_csrf";

export async function readCsrfToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value ?? null;
}

export async function verifyCsrf(formToken: string | null | undefined): Promise<boolean> {
  if (!formToken) return false;
  const cookieToken = await readCsrfToken();
  if (!cookieToken) return false;
  if (formToken.length !== cookieToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(formToken), Buffer.from(cookieToken));
}

export async function verifyOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (!origin || !host) return false;
  try {
    const u = new URL(origin);
    return u.host === host;
  } catch {
    return false;
  }
}

export const csrfCookieName = COOKIE_NAME;
