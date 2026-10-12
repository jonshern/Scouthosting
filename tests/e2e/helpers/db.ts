// Direct database access for E2E fixtures. Use ONLY for state that has
// no UI yet; everything else goes through the browser.
//
//  - grantRole: there is no screen for giving a user a parent/scout/
//    leader role in an org (signup only auto-grants admin to the
//    org's scoutmasterEmail; OAuth does the same).
//  - createSlot: the admin event page links to /admin/events/<id>/slots
//    but no such route exists, so sign-up slots can't be created in-app.
//  - createChannel: chat channels are provisioned by the seed/back
//    end only; there is no "new channel" screen.
//  - mintPermSlipToken: the console mail driver logs only metadata, so
//    the signing link the parent would get by email is reconstructed
//    with the same signer the app uses.

import { PrismaClient } from "@prisma/client";
import { makePermSlipToken } from "../../../src/lib/security/perm-slip-token";
const ORG_SLUG = "troop100";

// Must match playwright.config.ts#webServer.env.
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://compass:compass@localhost:5433/compass_test?schema=public";
const SESSION_SECRET = "test-only-not-secret-replace-in-prod-0123456789abcdef";

let client: PrismaClient | null = null;
export function db(): PrismaClient {
  if (!client) client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  return client;
}

export async function orgId(slug = ORG_SLUG): Promise<string> {
  const org = await db().org.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return org.id;
}

export async function eventIdByTitle(title: string): Promise<string> {
  const e = await db().event.findFirstOrThrow({
    where: { orgId: await orgId(), title },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return e.id;
}

export async function deleteEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db().event.deleteMany({ where: { id: { in: ids } } });
}

export async function userIdByEmail(email: string): Promise<string> {
  const u = await db().user.findUniqueOrThrow({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  return u.id;
}

export async function memberIdByEmail(email: string): Promise<string> {
  const m = await db().member.findFirstOrThrow({
    where: { orgId: await orgId(), email: email.toLowerCase(), deletedAt: null },
    select: { id: true },
  });
  return m.id;
}

export async function grantRole(
  email: string,
  role: "scout" | "parent" | "leader" | "admin",
  opts: { yptCurrent?: boolean } = {},
): Promise<void> {
  const userId = await userIdByEmail(email);
  const oid = await orgId();
  const yptCurrentUntil = opts.yptCurrent ? new Date(Date.now() + 365 * 86_400_000) : null;
  await db().orgMembership.upsert({
    where: { userId_orgId: { userId, orgId: oid } },
    update: { role, yptCurrentUntil },
    create: { userId, orgId: oid, role, yptCurrentUntil },
  });
}

export async function createSlot(args: {
  eventId: string;
  title: string;
  capacity: number;
  allowWaitlist: boolean;
}): Promise<string> {
  const slot = await db().signupSlot.create({
    data: { orgId: await orgId(), ...args },
    select: { id: true },
  });
  return slot.id;
}

export async function createChannel(args: {
  name: string;
  memberEmails: string[];
}): Promise<string> {
  const oid = await orgId();
  const userIds = await Promise.all(args.memberEmails.map(userIdByEmail));
  const ch = await db().channel.create({
    data: {
      orgId: oid,
      kind: "custom",
      name: args.name,
      postPolicy: "everyone",
      members: {
        create: userIds.map((userId) => ({ userId, addedAutomatically: false })),
      },
    },
    select: { id: true },
  });
  return ch.id;
}

export function mintPermSlipToken(args: {
  orgId: string;
  eventId: string;
  memberId: string;
  parentEmail: string;
  parentName: string;
}): string {
  const prev = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SESSION_SECRET;
  try {
    return makePermSlipToken(args);
  } finally {
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  }
}
