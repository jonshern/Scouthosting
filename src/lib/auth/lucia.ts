import { Lucia, type Session, type User as LuciaUser } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { env, isProd } from "@/lib/env";

const adapter = new PrismaAdapter(
  prisma.session as unknown as never,
  prisma.user as unknown as never
);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: "compass_session",
    expires: false,
    attributes: {
      secure: isProd(),
      sameSite: "lax",
      domain: env.COOKIE_DOMAIN || undefined,
    },
  },
  getUserAttributes: (data) => ({
    email: data.email as string,
    displayName: data.displayName as string,
    emailVerified: data.emailVerified as boolean,
    isSuperAdmin: data.isSuperAdmin as boolean,
  }),
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      displayName: string;
      emailVerified: boolean;
      isSuperAdmin: boolean;
    };
  }
}

export type AuthSession = { user: LuciaUser; session: Session } | { user: null; session: null };

export const getSession = cache(async (): Promise<AuthSession> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
  if (!sessionId) return { user: null, session: null };

  const result = await lucia.validateSession(sessionId);
  try {
    if (result.session && result.session.fresh) {
      const cookie = lucia.createSessionCookie(result.session.id);
      cookieStore.set(cookie.name, cookie.value, cookie.attributes);
    }
    if (!result.session) {
      const cookie = lucia.createBlankSessionCookie();
      cookieStore.set(cookie.name, cookie.value, cookie.attributes);
    }
  } catch {
    // setting cookies fails during static generation; safe to ignore
  }
  return result;
});
