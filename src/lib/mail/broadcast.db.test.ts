// Broadcasts go through the job queue, against a real Postgres.
// Skipped unless TEST_DATABASE_URL points at a migrated test database.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const queue: Array<{ name: string; data: unknown }> = [];
let queueUp = true;
vi.mock("@/lib/jobs", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/jobs")>();
  return {
    ...actual,
    // Stand-in for a running pg-boss: hold the jobs instead of running them.
    enqueueJob: async (name: string, data: unknown) => {
      if (!queueUp) return actual.enqueueJob(name, data);
      queue.push({ name, data });
      return { id: `job-${queue.length}`, mode: "queued" as const };
    },
  };
});

import { prisma } from "@/lib/db";
import { _setMailDriverForTests, type MailMessage } from "@/lib/mail";
import { handlers } from "@/lib/jobs/registry";
import { logger } from "@/lib/log";
import { sendLoggedBroadcast } from "./broadcast";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("broadcast email", () => {
  const tag = `broadcast-${Date.now()}`;
  let orgId = "";
  let userId = "";
  const sent: MailMessage[] = [];
  const recipients = ["a", "b", "c"].map((n) => ({ name: n, email: `${n}-${tag}@example.invalid` }));

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: {
        slug: tag, unitType: "Troop", unitNumber: "995", displayName: "Broadcast", charterOrg: "Test",
        city: "Test", state: "TS", scoutmasterName: "Test", scoutmasterEmail: `${tag}@example.invalid`,
      },
    });
    orgId = org.id;
    userId = (await prisma.user.create({ data: { email: `author-${tag}@example.invalid`, displayName: "Author" } })).id;
    _setMailDriverForTests({
      send: async (m) => {
        sent.push(m);
        return m.to.startsWith("c-") ? { ok: false, error: "bounced" } : { ok: true, messageId: m.to };
      },
    });
  });

  afterAll(async () => {
    _setMailDriverForTests(null);
    await prisma.org.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  const send = () =>
    sendLoggedBroadcast({
      orgId, author: { id: userId }, subject: "Campout", body: "Bring a tent.", audienceLabel: "Everyone", recipients,
    });

  it("returns as soon as the sends are queued; the jobs finish the log", async () => {
    queueUp = true;
    const r = await send();
    expect(r.status).toBe("queued");
    expect(sent).toHaveLength(0);
    expect(queue.map((j) => j.name)).toEqual(Array(3).fill("email.broadcast.send-one"));

    const run = handlers.get("email.broadcast.send-one")!;
    for (const job of queue) await run(job.data, { logger });
    const log = await prisma.mailLog.findUniqueOrThrow({ where: { id: r.mailLogId } });
    expect(log).toMatchObject({ status: "partial", deliveredCount: 2, failedCount: 1 });
    expect(sent.map((m) => m.to)).toEqual(recipients.map((x) => x.email));
  });

  it("sends in the request when no job runtime is up", async () => {
    queueUp = false;
    sent.length = 0;
    const r = await send();
    expect(r).toMatchObject({ status: "partial", deliveredCount: 2, failedCount: 1 });
    expect(sent).toHaveLength(3);
  });
});
