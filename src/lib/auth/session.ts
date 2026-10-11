// The signed-in user for the current request, read through Better Auth
// (./auth.ts). Cached per request so layouts and pages share one lookup.
//
// The shape matches what the app used under Lucia, so callers only need
// `user.id`, `user.email`, `user.displayName`, `user.emailVerified` and
// `user.isSuperAdmin`.

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
};

export type SessionInfo = { id: string; userId: string; expiresAt: Date };

export type AuthSession =
  | { user: SessionUser; session: SessionInfo }
  | { user: null; session: null };

export const getSession = cache(async (): Promise<AuthSession> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return { user: null, session: null };
  const { user, session } = result;
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.name,
      emailVerified: user.emailVerified,
      isSuperAdmin: !!user.isSuperAdmin,
    },
    session: { id: session.id, userId: session.userId, expiresAt: session.expiresAt },
  };
});
