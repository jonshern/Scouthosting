import { describe, it, expect, beforeEach, vi } from "vitest";

// Each test reloads the module so MAIL_DRIVER picks up env changes.
async function loadMail() {
  vi.resetModules();
  return await import("../lib/mail.js");
}

describe("mail console driver", () => {
  beforeEach(() => {
    process.env.MAIL_DRIVER = "console";
  });

  it("returns ok with a console-prefixed id", async () => {
    const { send } = await loadMail();
    const r = await send({ to: "a@x.test", subject: "hi", text: "body" });
    expect(r.ok).toBe(true);
    expect(r.id).toMatch(/^console-/);
  });

  it("rejects when required fields are missing", async () => {
    const { send } = await loadMail();
    expect((await send({ to: "", subject: "s", text: "b" })).ok).toBe(false);
    expect((await send({ to: "a@x", subject: "", text: "b" })).ok).toBe(false);
    expect((await send({ to: "a@x", subject: "s" })).ok).toBe(false);
  });

  it("sendBatch returns sent count and per-recipient errors", async () => {
    const { sendBatch } = await loadMail();
    const r = await sendBatch([
      { to: "a@x.test", subject: "s", text: "1" },
      { to: "b@x.test", subject: "s", text: "2" },
      { to: "", subject: "s", text: "3" }, // invalid
    ]);
    expect(r.sent).toBe(2);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].to).toBe("");
  });
});

describe("mail resend driver", () => {
  it("sends to api.resend.com with Bearer + JSON body", async () => {
    process.env.MAIL_DRIVER = "resend";
    process.env.RESEND_API_KEY = "test-key";
    process.env.MAIL_FROM = "X <noreply@x.test>";

    const calls = [];
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, opts });
      return new Response(JSON.stringify({ id: "re_abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { send } = await loadMail();
    const r = await send({ to: "p@x.test", subject: "s", text: "b", replyTo: "rt@x.test" });
    expect(r.ok).toBe(true);
    expect(r.id).toBe("re_abc");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].opts.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(calls[0].opts.body);
    expect(body).toEqual({
      from: "X <noreply@x.test>",
      to: ["p@x.test"],
      subject: "s",
      text: "b",
      reply_to: "rt@x.test",
    });
  });

  it("falls back to console when RESEND_API_KEY is missing", async () => {
    process.env.MAIL_DRIVER = "resend";
    delete process.env.RESEND_API_KEY;
    const { send } = await loadMail();
    const r = await send({ to: "p@x.test", subject: "s", text: "b" });
    expect(r.ok).toBe(true);
    expect(r.id).toMatch(/^console-/);
  });
});
