// Unit tests for lib/realtime.js. The pub/sub primitive is the
// in-process backbone for SSE delivery; we want clear coverage on
// fan-out, isolation between channels, unsubscribe, and the protective
// behaviors (no listener cap, never throws on unknown channel).

import { describe, it, expect, beforeEach } from "vitest";
import {
  publishMessage,
  publishSuspended,
  publishUnsuspended,
  publishArchived,
  subscribe,
  subscriberCount,
  _resetForTests,
} from "../lib/realtime.js";

beforeEach(() => {
  _resetForTests();
});

describe("subscribe / publishMessage", () => {
  it("delivers a message event to a single subscriber", () => {
    const events = [];
    subscribe("ch1", (e) => events.push(e));
    publishMessage("ch1", { id: "m1", body: "hi" });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "message", channelId: "ch1", message: { id: "m1", body: "hi" } });
  });

  it("fans out to every subscriber on the same channel", () => {
    const a = []; const b = []; const c = [];
    subscribe("ch1", (e) => a.push(e));
    subscribe("ch1", (e) => b.push(e));
    subscribe("ch1", (e) => c.push(e));
    publishMessage("ch1", { id: "m1" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(c).toHaveLength(1);
  });

  it("isolates subscribers across channels", () => {
    const a = []; const b = [];
    subscribe("ch1", (e) => a.push(e));
    subscribe("ch2", (e) => b.push(e));
    publishMessage("ch1", { id: "m1" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  it("returns an unsubscribe function that removes the listener", () => {
    const events = [];
    const off = subscribe("ch1", (e) => events.push(e));
    off();
    publishMessage("ch1", { id: "m1" });
    expect(events).toHaveLength(0);
    expect(subscriberCount("ch1")).toBe(0);
  });

  it("rejects missing channelId / handler", () => {
    expect(() => subscribe()).toThrow(/missing channelId/);
    expect(() => subscribe("ch1")).toThrow(/handler must be a function/);
  });
});

describe("publishSuspended / publishUnsuspended / publishArchived", () => {
  it("emits a suspended event with the supplied reason", () => {
    const events = [];
    subscribe("ch1", (e) => events.push(e));
    publishSuspended("ch1", "no-current-adults");
    expect(events[0]).toEqual({ type: "suspended", channelId: "ch1", reason: "no-current-adults" });
  });

  it("emits suspended with reason=null when none supplied", () => {
    const events = [];
    subscribe("ch1", (e) => events.push(e));
    publishSuspended("ch1");
    expect(events[0].reason).toBeNull();
  });

  it("emits unsuspended", () => {
    const events = [];
    subscribe("ch1", (e) => events.push(e));
    publishUnsuspended("ch1");
    expect(events[0]).toEqual({ type: "unsuspended", channelId: "ch1" });
  });

  it("emits archived", () => {
    const events = [];
    subscribe("ch1", (e) => events.push(e));
    publishArchived("ch1");
    expect(events[0]).toEqual({ type: "archived", channelId: "ch1" });
  });
});

describe("safety", () => {
  it("publishing to a channel with no subscribers is a no-op (no throw)", () => {
    expect(() => publishMessage("nobody-here", { id: "m" })).not.toThrow();
    expect(subscriberCount("nobody-here")).toBe(0);
  });

  it("ignores publish calls with missing args", () => {
    const events = [];
    subscribe("ch1", (e) => events.push(e));
    publishMessage(null, { id: "m" });
    publishMessage("ch1", null);
    publishSuspended(null);
    publishUnsuspended(null);
    publishArchived(null);
    expect(events).toHaveLength(0);
  });

  it("subscriberCount is accurate across add / remove", () => {
    expect(subscriberCount("ch1")).toBe(0);
    const a = subscribe("ch1", () => {});
    const b = subscribe("ch1", () => {});
    expect(subscriberCount("ch1")).toBe(2);
    a();
    expect(subscriberCount("ch1")).toBe(1);
    b();
    expect(subscriberCount("ch1")).toBe(0);
  });
});
