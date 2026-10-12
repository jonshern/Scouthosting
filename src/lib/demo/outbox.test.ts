import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  demoOutboxMessage: {
    create: vi.fn(async () => ({ id: "row1" })),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { _setMailDriverForTests, sendMail, type MailDriver } from "@/lib/mail";
import { sendSms } from "@/lib/sms";
import { plainText } from "./outbox";

const env = process.env as Record<string, string | undefined>;
const driver: MailDriver = { send: vi.fn(async () => ({ ok: true as const, messageId: "real" })) };

beforeEach(() => {
  vi.clearAllMocks();
  _setMailDriverForTests(driver);
});
afterEach(() => {
  delete env.DEMO_MODE;
  _setMailDriverForTests(null);
});

describe("demo outbox", () => {
  it("keeps email out of the real driver on a demo deployment", async () => {
    env.DEMO_MODE = "1";
    const r = await sendMail({
      to: "someone@example.com",
      toName: "Some One",
      subject: "Campout reminder",
      html: "<p>Hi there,</p><p>Bring a <b>flashlight</b> &amp; water.</p>",
    });
    expect(r).toEqual({ ok: true, messageId: "demo-row1" });
    expect(driver.send).not.toHaveBeenCalled();
    expect(db.demoOutboxMessage.create).toHaveBeenCalledWith({
      data: {
        kind: "email",
        to: "someone@example.com",
        toName: "Some One",
        subject: "Campout reminder",
        body: "Hi there,\nBring a flashlight & water.",
      },
      select: { id: true },
    });
  });

  it("sends through the real driver everywhere else", async () => {
    const r = await sendMail({ to: "a@example.com", subject: "s", html: "<p>x</p>" });
    expect(r).toEqual({ ok: true, messageId: "real" });
    expect(db.demoOutboxMessage.create).not.toHaveBeenCalled();
  });

  it("keeps texts out of Twilio on a demo deployment", async () => {
    env.DEMO_MODE = "1";
    const r = await sendSms({ to: "555-010-4201", body: "Campout leaves at 5:30" });
    expect(r).toEqual({ ok: true, id: "demo-row1" });
    expect(db.demoOutboxMessage.create).toHaveBeenCalledWith({
      data: { kind: "sms", to: "+15550104201", toName: null, subject: null, body: "Campout leaves at 5:30" },
      select: { id: true },
    });
  });

  it("trims the outbox to the newest messages", async () => {
    env.DEMO_MODE = "1";
    const cutoff = new Date("2026-10-01T00:00:00Z");
    db.demoOutboxMessage.findMany.mockResolvedValueOnce([{ createdAt: cutoff }] as never);
    await sendSms({ to: "+15550104201", body: "hi" });
    expect(db.demoOutboxMessage.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lte: cutoff } } });
  });

  it("turns HTML into readable text", () => {
    expect(plainText("<style>p{}</style><h1>Title</h1><p>One<br>Two</p><p>&quot;Three&quot; &#39;4&#39;</p>")).toBe(
      'Title\nOne\nTwo\n"Three" \'4\'',
    );
  });
});
