// Push dispatch tests. Pin the contract for both drivers (console +
// expo) and the dead-token retirement path.

import { describe, it, expect, vi } from "vitest";
import { sendPushBatch } from "../lib/push.js";

describe("sendPushBatch — console driver", () => {
  it("counts every message as sent without a network call", async () => {
    const result = await sendPushBatch(
      [
        { token: "ExpoPushToken[abc]", title: "Hi", body: "There", data: { kind: "test" } },
        { token: "ExpoPushToken[def]", title: "Hi", body: "Two" },
      ],
      { driver: "console" },
    );
    expect(result.sent).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.retiredTokens).toEqual([]);
  });

  it("returns zero on empty input (no spurious driver call)", async () => {
    const fetchImpl = vi.fn();
    const result = await sendPushBatch([], { fetchImpl });
    expect(result.sent).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("sendPushBatch — expo driver", () => {
  function fakeFetch(payload) {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
  }

  it("posts the batch payload to Expo and counts ok tickets", async () => {
    const fetchImpl = fakeFetch({ data: [{ status: "ok" }, { status: "ok" }] });
    const result = await sendPushBatch(
      [
        { token: "T1", title: "A", body: "1" },
        { token: "T2", title: "B", body: "2" },
      ],
      { driver: "expo", fetchImpl, accessToken: "exp_xxx" },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const callArgs = fetchImpl.mock.calls[0];
    expect(callArgs[0]).toContain("exp.host/--/api/v2/push/send");
    expect(callArgs[1].headers.Authorization).toBe("Bearer exp_xxx");
    expect(JSON.parse(callArgs[1].body)).toEqual([
      { to: "T1", title: "A", body: "1", data: {}, sound: "default" },
      { to: "T2", title: "B", body: "2", data: {}, sound: "default" },
    ]);
    expect(result.sent).toBe(2);
  });

  it("flags DeviceNotRegistered tickets for retirement", async () => {
    const fetchImpl = fakeFetch({
      data: [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" }, message: "Nope" },
      ],
    });
    const result = await sendPushBatch(
      [
        { token: "T1", title: "A", body: "1" },
        { token: "T2", title: "B", body: "2" },
      ],
      { driver: "expo", fetchImpl },
    );
    expect(result.sent).toBe(1);
    expect(result.retiredTokens).toEqual(["T2"]);
    expect(result.errors).toEqual([{ token: "T2", error: "DeviceNotRegistered" }]);
  });

  it("treats HTTP errors as per-token failures (no retirement)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const result = await sendPushBatch(
      [{ token: "T1", title: "A", body: "1" }],
      { driver: "expo", fetchImpl },
    );
    expect(result.sent).toBe(0);
    expect(result.errors).toEqual([{ token: "T1", error: "http_500" }]);
    expect(result.retiredTokens).toEqual([]);
  });

  it("recovers from network errors as 'network' per-token failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await sendPushBatch(
      [{ token: "T1", title: "A", body: "1" }],
      { driver: "expo", fetchImpl },
    );
    expect(result.sent).toBe(0);
    expect(result.errors[0].error).toBe("network");
  });

  it("batches large input into chunks of 100", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: Array.from({ length: 100 }, () => ({ status: "ok" })) }),
    });
    const messages = Array.from({ length: 250 }, (_, i) => ({ token: `T${i}`, title: "x", body: "y" }));
    await sendPushBatch(messages, { driver: "expo", fetchImpl });
    // 250 → 100 + 100 + 50 = 3 batches
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
