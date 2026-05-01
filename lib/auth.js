// Lucia auth setup, backed by Prisma.
//
// Sessions live on the control plane (`public.Session`). A user can belong
// to many orgs via OrgMembership; we resolve the active org per-request
// from the Host header (see server/index.js) and cross-check that the
// signed-in user has a membership in that org.

import { Lucia } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./db.js";

const adapter = new PrismaAdapter(prisma.session, prisma.user);

// Cookie domain controls subdomain sharing. Default is host-only. In
// production we set COOKIE_DOMAIN=.compass.app so a session set on the
// apex (e.g. after Google OAuth callback) is also valid on every org
// subdomain. In dev, set this if you want the same behavior across
// *.localhost — browser support varies.
const cookieDomain = (process.env.COOKIE_DOMAIN || "").trim() || undefined;

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: "compass_session",
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      domain: cookieDomain,
    },
  },
  getUserAttributes: (data) => ({
    email: data.email,
    displayName: data.displayName,
    emailVerified: data.emailVerified,
  }),
});

const ARGON_PARAMS = {
  memoryCost: 19456, // 19 MiB — OWASP recommendation for argon2id
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export function hashPassword(plaintext) {
  return hash(plaintext, ARGON_PARAMS);
}

export function verifyPassword(hashStr, plaintext) {
  return verify(hashStr, plaintext, ARGON_PARAMS);
}

/* ------------------------------------------------------------------ */
/* Express middleware                                                  */
/* ------------------------------------------------------------------ */

/**
 * Resolves the current user + session from the cookie. Always continues —
 * downstream handlers gate on `req.user` themselves.
 */
export async function attachSession(req, res, next) {
  const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");
  if (!sessionId) {
    req.user = null;
    req.session = null;
    return next();
  }
  try {
    const { session, user } = await lucia.validateSession(sessionId);
    if (session && session.fresh) {
      const cookie = lucia.createSessionCookie(session.id);
      res.appendHeader("Set-Cookie", cookie.serialize());
    }
    if (!session) {
      const cookie = lucia.createBlankSessionCookie();
      res.appendHeader("Set-Cookie", cookie.serialize());
    }
    req.user = user ?? null;
    req.session = session ?? null;
  } catch {
    req.user = null;
    req.session = null;
  }
  next();
}

/**
 * Returns the user's role within the current request's org, or null if they
 * are not a member. Cheap join, but cache on req if you call it more than once.
 */
export async function roleInOrg(userId, orgId) {
  if (!userId || !orgId) return null;
  const m = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/* ------------------------------------------------------------------ */
/* Admin SSO enforcement                                               */
/* ------------------------------------------------------------------ */

// Production policy: anyone holding admin or super-admin must sign in
// with Google or Apple — passwords aren't accepted for admin accounts.
// In non-production we permit password login regardless so seeded demo
// admins keep working locally.
export async function isPrivilegedUser(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      memberships: { where: { role: "admin" }, select: { id: true }, take: 1 },
    },
  });
  if (!u) return false;
  return u.isSuperAdmin || u.memberships.length > 0;
}

export function passwordLoginAllowedForRole({ privileged }) {
  if (!privileged) return true;
  return process.env.NODE_ENV !== "production";
}
