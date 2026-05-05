type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; remaining: number; resetMs: number };

export function consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetMs: windowMs };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, resetMs: bucket.resetAt - now };
}

export function reset(key: string): void {
  buckets.delete(key);
}

export function _resetAllForTests(): void {
  buckets.clear();
}
