import { timingSafeEqual } from "node:crypto";

// Scheduler-only routes (/api/cron/run, /api/demo/reset) check the
// X-Tasks-Token header against TASKS_TOKEN. Unset TASKS_TOKEN = closed.
export function tasksTokenOk(given: string | null): boolean {
  const expected = process.env.TASKS_TOKEN;
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
