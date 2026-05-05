import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTests,
  publishArchived,
  publishMessage,
  publishSuspended,
  publishUnsuspended,
  subscribe,
  subscriberCount,
} from "./bus";

describe("realtime/bus", () => {
  afterEach(() => _resetForTests());

  it("delivers published messages to subscribers of the same channel", () => {
    const handler = vi.fn();
    subscribe("ch1", handler);
    publishMessage("ch1", { id: "m1", text: "hi" });
    expect(handler).toHaveBeenCalledWith({
      type: "message",
      channelId: "ch1",
      message: { id: "m1", text: "hi" },
    });
  });

  it("does not deliver to subscribers of a different channel", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("ch1", a);
    subscribe("ch2", b);
    publishMessage("ch1", { id: "m1" });
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("unsubscribe stops further delivery", () => {
    const handler = vi.fn();
    const off = subscribe("ch1", handler);
    publishMessage("ch1", { id: "m1" });
    off();
    publishMessage("ch1", { id: "m2" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("publishSuspended / Unsuspended / Archived emit shaped events", () => {
    const handler = vi.fn();
    subscribe("ch1", handler);
    publishSuspended("ch1", "abuse");
    publishUnsuspended("ch1");
    publishArchived("ch1");
    expect(handler).toHaveBeenNthCalledWith(1, {
      type: "suspended",
      channelId: "ch1",
      reason: "abuse",
    });
    expect(handler).toHaveBeenNthCalledWith(2, { type: "unsuspended", channelId: "ch1" });
    expect(handler).toHaveBeenNthCalledWith(3, { type: "archived", channelId: "ch1" });
  });

  it("subscriberCount reflects current listeners", () => {
    expect(subscriberCount("ch1")).toBe(0);
    const off = subscribe("ch1", () => {});
    expect(subscriberCount("ch1")).toBe(1);
    off();
    expect(subscriberCount("ch1")).toBe(0);
  });

  it("subscribe validates inputs", () => {
    expect(() => subscribe("", () => {})).toThrow(/missing channelId/);
    expect(() => subscribe("x", undefined as unknown as never)).toThrow(/must be a function/);
  });
});
