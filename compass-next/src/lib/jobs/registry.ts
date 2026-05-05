// Job-handler registry. Split out from `./index` to avoid the
// circular import that arises from `index` re-importing `handlers`
// (which has registerHandler() side effects at module init).

import type { Logger } from "@/lib/log";

export type JobHandlerCtx = { logger: Logger; jobId?: string };
export type JobHandler = (data: unknown, ctx: JobHandlerCtx) => Promise<void>;

export const handlers = new Map<string, JobHandler>();

export function registerHandler(name: string, fn: JobHandler): void {
  if (typeof name !== "string" || !name) throw new Error("registerHandler: name required");
  if (typeof fn !== "function") throw new Error("registerHandler: fn must be a function");
  handlers.set(name, fn);
}
