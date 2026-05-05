import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTests,
  enqueueJob,
  jobsStatus,
  registerHandler,
} from "./index";

describe("jobs (in-process mode)", () => {
  afterEach(() => {
    _resetForTests();
  });

  it("runs registered handler synchronously when no runtime", async () => {
    const calls: unknown[] = [];
    registerHandler("test.hello", async (data) => {
      calls.push(data);
    });
    const result = await enqueueJob("test.hello", { x: 1 });
    expect(result).toEqual({ id: null, mode: "in-process" });
    expect(calls).toEqual([{ x: 1 }]);
  });

  it("returns 'discarded' when handler missing", async () => {
    const result = await enqueueJob("nobody.listens", { x: 1 });
    expect(result.mode).toBe("discarded");
    expect(result.id).toBeNull();
  });

  it("registerHandler validates inputs", () => {
    expect(() => registerHandler("", async () => {})).toThrow(/name required/);
    expect(() =>
      registerHandler("x", undefined as unknown as never),
    ).toThrow(/must be a function/);
  });

  it("re-registering same name overwrites", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    registerHandler("test.x", a);
    registerHandler("test.x", b);
    await enqueueJob("test.x", {});
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it("jobsStatus reflects registry", () => {
    registerHandler("a", async () => {});
    registerHandler("b", async () => {});
    const status = jobsStatus();
    expect(status.running).toBe(false);
    expect(status.handlers.sort()).toEqual(["a", "b"]);
  });

  it("propagates handler errors", async () => {
    registerHandler("test.boom", async () => {
      throw new Error("nope");
    });
    await expect(enqueueJob("test.boom", {})).rejects.toThrow(/nope/);
  });
});
