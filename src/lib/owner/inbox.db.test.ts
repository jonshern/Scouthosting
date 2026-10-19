// "Send feedback" from the apps reaches the owner inbox, tagged with its
// product, with or without a troop; the owner's reply is kept and the
// question marked answered. Runs only with TEST_DATABASE_URL set.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.K_SERVICE;
});

import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/auth/api-token";
import * as feedback from "@/app/api/v1/feedback/route";
import * as support from "@/app/api/v1/support/route";
import { replyToTicket } from "./inbox";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;

async function post(mod: { POST: (req: NextRequest, ctx: { params: Promise<Record<string, never>> }) => Promise<Response> }, token: string, body: unknown) {
  const req = new NextRequest("http://localhost/api/v1/test", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await mod.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe.skipIf(!db)("owner inbox from the apps", () => {
  let userId = "";
  let token = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `family-${S}@example.invalid`, displayName: `Family ${S}`, adultAttestedAt: new Date() },
    });
    userId = user.id;
    token = (await issueToken(user.id, "Lantern app", prisma)).raw;
  });

  afterAll(async () => {
    await prisma.supportTicket.deleteMany({ where: { userId } });
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("files Lantern feedback from a family with no troop", async () => {
    const r = await post(feedback, token, {
      product: "lantern",
      kind: "bug",
      message: "The check mark didn't stick\nOn Tenderfoot 4a",
      context: { appVersion: "1.4.0", platform: "ios", screen: "step" },
    });
    expect(r.status).toBe(200);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: String(r.json.id) } });
    expect(t).toMatchObject({
      product: "lantern",
      category: "bug",
      subject: "The check mark didn't stick",
      orgId: null,
      status: "open",
      fromEmail: `family-${S}@example.invalid`,
    });
    expect(t.context).toEqual({ appVersion: "1.4.0", platform: "ios", screen: "step" });
  });

  it("refuses an unknown product and a unit the user isn't in", async () => {
    expect((await post(feedback, token, { product: "summit", message: "hi" })).json.error).toBe("bad_product");
    const other = await prisma.org.findFirst({ select: { id: true } });
    if (other) expect([403, 404]).toContain((await post(feedback, token, { product: "compass", message: "hi", orgId: other.id })).status);
  });

  it("Contact support works without a unit too", async () => {
    const r = await post(support, token, { subject: "Billing?", body: "How much is it?", product: "waypoint" });
    expect(r.status).toBe(200);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: String(r.json.id) } });
    expect(t).toMatchObject({ orgId: null, product: "waypoint" });
  });

  it("an owner reply is saved and marks it answered", async () => {
    const t = await prisma.supportTicket.findFirstOrThrow({ where: { userId, product: "waypoint" } });
    const out = await replyToTicket({ ticketId: t.id, body: "It's $99 a year.", author: { id: userId, displayName: "Jon" } });
    expect(out.reply.body).toBe("It's $99 a year.");
    const after = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe("answered");
  });
});
