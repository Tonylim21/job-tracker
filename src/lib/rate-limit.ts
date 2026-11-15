// Rate limit sliding window.
//  - Ada UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN -> pakai Upstash Redis (cocok untuk Vercel).
//  - Tidak ada -> fallback in-memory: cukup untuk development lokal, TIDAK andal di serverless
//    (tiap instance punya memori sendiri dan reset saat restart).
import type { Ratelimit } from "@upstash/ratelimit";

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

const memory = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => t > now - windowSec * 1000);
  if (hits.length >= limit) {
    memory.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowSec * 1000 - now) / 1000)) };
  }
  hits.push(now);
  memory.set(key, hits);
  return { ok: true, retryAfterSec: 0 };
}

const limiters = new Map<string, Ratelimit>();

async function getUpstashLimiter(name: string, limit: number, windowSec: number) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const id = `${name}:${limit}:${windowSec}`;
  let l = limiters.get(id);
  if (!l) {
    const [{ Ratelimit }, { Redis }] = await Promise.all([import("@upstash/ratelimit"), import("@upstash/redis")]);
    l = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s` as `${number} s`),
      prefix: `cn:${name}`,
    });
    limiters.set(id, l);
  }
  return l;
}

/** Contoh: await rateLimit("cv-parse", user.id, 5, 3600) -> maksimal 5 kali per jam per user. */
export async function rateLimit(
  name: string,
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  try {
    const l = await getUpstashLimiter(name, limit, windowSec);
    if (!l) return memoryLimit(`${name}:${key}`, limit, windowSec);
    const r = await l.limit(key);
    return { ok: r.success, retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  } catch (e) {
    // Redis bermasalah: jangan blokir user, tapi catat
    console.error("[rate-limit]", e);
    return { ok: true, retryAfterSec: 0 };
  }
}
