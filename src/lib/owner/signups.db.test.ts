// The sign-ups queue reads the owner's status, note and invite for each
// new account, keeps a follow-up after the 30-day window has passed it,
// and treats an old "Done" mark as done. Runs only with TEST_DATABASE_URL set.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { saveSignupReview, signupQueue } from "./signups";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!db)("sign-ups queue", () => {
  const ids: string[] = [];
  let fresh = "";
  let old = "";
  let legacy = "";

  beforeAll(async () => {
    const mk = (tag: string, createdAt: Date) =>
      prisma.user.create({
        data: { email: `signup-${tag}-${S}@example.invalid`, displayName: `Signup ${tag} ${S}`, createdAt },
      });
    fresh = (await mk("fresh", new Date())).id;
    old = (await mk("old", new Date(Date.now() - 60 * DAY))).id;
    legacy = (await mk("legacy", new Date())).id;
    ids.push(fresh, old, legacy);
    await prisma.ownerInvite.create({ data: { email: `SIGNUP-FRESH-${S}@example.invalid`, product: "lantern" } });
    await prisma.auditLog.create({ data: { entityType: "User", entityId: legacy, action: "signup.followed_up" } });
  });

  afterAll(async () => {
    await prisma.signupReview.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.ownerInvite.deleteMany({ where: { email: { contains: S } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  const find = async (id: string, view: "todo" | "all" = "all") =>
    (await signupQueue({ view })).find((i) => i.id === id);

  it("a new account is new, unconfirmed, and matched to its invite", async () => {
    const item = await find(fresh, "todo");
    expect(item).toMatchObject({ status: "new", confirmed: false, kind: "person" });
    expect(item?.invitedAt).toBeInstanceOf(Date);
  });

  it("keeps the owner's note and follow-up day", async () => {
    const by = new Date(Date.now() + 3 * DAY);
    await saveSignupReview("User", fresh, { status: "follow_up", note: "Call Tuesday", followUpOn: by }, fresh);
    expect(await find(fresh, "todo")).toMatchObject({ status: "follow_up", note: "Call Tuesday", followUpOn: by });
    await saveSignupReview("User", fresh, { status: "approved", followUpOn: null }, fresh);
    expect(await find(fresh, "todo")).toBeUndefined();
    expect(await find(fresh)).toMatchObject({ status: "approved", note: "Call Tuesday" });
  });

  it("a follow-up older than the window stays on the queue", async () => {
    expect(await find(old)).toBeUndefined();
    await saveSignupReview("User", old, { status: "follow_up" }, old);
    expect(await find(old, "todo")).toMatchObject({ status: "follow_up" });
  });

  it("an old Done mark reads as done", async () => {
    expect(await find(legacy, "todo")).toBeUndefined();
    expect(await find(legacy)).toMatchObject({ status: "done" });
  });
});
