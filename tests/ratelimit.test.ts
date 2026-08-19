import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { registerUser } from "@/server/services/players";
import {
  enforceRateLimit,
  recordFailure,
  clearFailures,
  resetRateLimits,
} from "@/server/lib/rate-limit";
import { POST as login } from "@/app/api/auth/login/route";

function loginRequest(payload: unknown, ip?: string) {
  return new NextRequest("http://local.test/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
  });
}

beforeEach(() => resetRateLimits());

describe("rate limiter unit behavior", () => {
  it("allows normal volume but caps bursts per window", () => {
    const key = "unit:burst";
    for (let i = 0; i < 20; i++) enforceRateLimit(key);
    expect(() => enforceRateLimit(key)).toThrowError(/slow down|too many/i);
  });

  it("locks a key after repeated failures, then recovers after clearFailures", () => {
    const key = "unit:lock";
    for (let i = 0; i < 5; i++) recordFailure(key);
    expect(() => enforceRateLimit(key)).toThrowError(/Too many attempts/i);
    clearFailures(key);
    expect(() => enforceRateLimit(key)).not.toThrow();
  });

  it("independent keys do not interfere", () => {
    for (let i = 0; i < 5; i++) recordFailure("unit:a");
    expect(() => enforceRateLimit("unit:b")).not.toThrow();
  });
});

describe("login brute-force protection", () => {
  it("4 wrong passwords → still 401; 5th failure locks; 6th attempt is 429 even with the right password", async () => {
    const n = `brute_${Math.random().toString(36).slice(2, 8)}`;
    registerUser({ username: n, displayName: n, email: `${n}@t.local`, password: "correct1x" });

    for (let i = 0; i < 4; i++) {
      const r = await login(loginRequest({ login: n, password: "wrongpass1" }));
      expect(r.status).toBe(401);
    }
    // 5th failure trips the lockout
    const fifth = await login(loginRequest({ login: n, password: "wrongpass1" }));
    expect(fifth.status).toBe(401);
    // account now locked: correct password is also rejected with 429
    const locked = await login(loginRequest({ login: n, password: "correct1x" }));
    expect(locked.status).toBe(429);
    const body = await locked.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("does not lock a different account or IP", async () => {
    const a = `brute2_${Math.random().toString(36).slice(2, 8)}`;
    const b = `other2_${Math.random().toString(36).slice(2, 8)}`;
    registerUser({ username: a, displayName: a, email: `${a}@t.local`, password: "correct1x" });
    registerUser({ username: b, displayName: b, email: `${b}@t.local`, password: "correct1x" });
    for (let i = 0; i < 5; i++) {
      await login(loginRequest({ login: a, password: "wrongpass1" }, "9.9.9.9"));
    }
    const other = await login(loginRequest({ login: b, password: "wrongpass1" }, "8.8.8.8"));
    expect(other.status).toBe(401); // not 429 — unaffected account/IP
  });

  it("normal failed logins (below threshold) never return 429", async () => {
    const n = `calm_${Math.random().toString(36).slice(2, 8)}`;
    registerUser({ username: n, displayName: n, email: `${n}@t.local`, password: "correct1x" });
    const r = await login(loginRequest({ login: n, password: "typo1234" }, "7.7.7.7"));
    expect(r.status).toBe(401);
  });
});
