import type { NextRequest } from "next/server";
import { ApiError, ERRORS } from "./errors";

/**
 * Simple in-memory rate limiter (per-IP / per-account keys).
 *
 * Deliberately dependency-free — appropriate for a single-process, private
 * friends platform. Limits are configurable via env vars. Buckets reset on
 * process restart, which is acceptable here.
 *
 * Semantics per key:
 *  - max `RATELIMIT_MAX` hits per rolling `RATELIMIT_WINDOW_MS` window
 *  - `RATELIMIT_FAIL_MAX` consecutive failures → temporary lockout
 *    for `RATELIMIT_LOCKOUT_MS`
 */

type Bucket = { hits: number; windowStart: number; failures: number; lockedUntil: number };

const store = new Map<string, Bucket>();

const envInt = (name: string, fallback: number): number => {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const WINDOW_MS = envInt("RATELIMIT_WINDOW_MS", 60_000);
const MAX_HITS = envInt("RATELIMIT_MAX", 20);
const FAIL_MAX = envInt("RATELIMIT_FAIL_MAX", 5);
const LOCKOUT_MS = envInt("RATELIMIT_LOCKOUT_MS", 300_000);

function bucketFor(key: string): Bucket {
  const now = Date.now();
  let b = store.get(key);
  if (!b) {
    b = { hits: 0, windowStart: now, failures: 0, lockedUntil: 0 };
    store.set(key, b);
  }
  if (now - b.windowStart >= WINDOW_MS) {
    b.hits = 0;
    b.windowStart = now;
  }
  return b;
}

/** Best-effort client IP (behind the platform proxy). */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "local";
}

/**
 * Throws 429 RATE_LIMITED when any key is locked out or over its window
 * budget; otherwise counts one hit against each key.
 */
export function enforceRateLimit(...keys: string[]): void {
  for (const key of keys) {
    const b = bucketFor(key);
    const now = Date.now();
    if (b.lockedUntil > now) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        `Too many attempts. Try again in ${Math.ceil((b.lockedUntil - now) / 1000)}s.`
      );
    }
    if (b.hits >= MAX_HITS) throw ERRORS.RATE_LIMITED();
    b.hits += 1;
  }
}

/** Registers a failure (e.g. wrong password) toward the lockout threshold. */
export function recordFailure(...keys: string[]): void {
  for (const key of keys) {
    const b = bucketFor(key);
    b.failures += 1;
    if (b.failures >= FAIL_MAX) {
      b.lockedUntil = Date.now() + LOCKOUT_MS;
      b.failures = 0;
    }
  }
}

/** Clears failure streaks and any active lockout (e.g. successful login). */
export function clearFailures(...keys: string[]): void {
  for (const key of keys) {
    const b = store.get(key);
    if (b) {
      b.failures = 0;
      b.lockedUntil = 0;
    }
  }
}

/** Test helper — wipe all buckets. */
export function resetRateLimits(): void {
  store.clear();
}
