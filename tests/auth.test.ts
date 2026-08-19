import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { get, run, all } from "@/server/db/client";
import { registerUser, findByLogin } from "@/server/services/players";
import { verifyPassword } from "@/server/auth/password";
import { uuid, randomToken, sha256, nowIso } from "@/server/lib/util";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";

function jsonRequest(url: string, payload: unknown, method = "POST") {
  return new NextRequest(`http://local.test${url}`, {
    method,
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
}

function freshUser(name: string) {
  const n = `${name}_${Math.random().toString(36).slice(2, 8)}`;
  const { userId } = registerUser({
    username: n, displayName: n, email: `${n}@t.local`, password: "passw0rd1",
  });
  return { userId, username: n, email: `${n}@t.local` };
}

afterEach(() => {
  delete process.env.ARENA_DEV_RESET_LINKS;
});

describe("password reset security", () => {
  it("never returns a reset URL by default (dev flag off) and is enumeration-safe", async () => {
    const u = freshUser("forgot_default");
    const known = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: u.email }));
    const unknown = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "ghost@nowhere.local" })
    );
    const knownBody = await known.json();
    const unknownBody = await unknown.json();
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(knownBody.resetUrl).toBeUndefined();
    expect(unknownBody.resetUrl).toBeUndefined();
    expect(Object.keys(knownBody).sort()).toEqual(Object.keys(unknownBody).sort());
    // a token was still created server-side for the real account
    const token = get<{ user_id: string }>(
      `SELECT user_id FROM password_reset_tokens WHERE user_id = ?`, u.userId
    );
    expect(token?.user_id).toBe(u.userId);
  });

  it("returns the reset URL only when ARENA_DEV_RESET_LINKS=true (non-production)", async () => {
    const u = freshUser("forgot_devflag");
    process.env.ARENA_DEV_RESET_LINKS = "true";
    const res = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: u.email }));
    const body = await res.json();
    expect(body.resetUrl).toMatch(/^\/reset-password\?token=/);
  });

  it("ignores the dev flag when NODE_ENV=production", async () => {
    const u = freshUser("forgot_prodflag");
    vi.stubEnv("NODE_ENV", "production");
    process.env.ARENA_DEV_RESET_LINKS = "true";
    try {
      const res = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: u.email }));
      const body = await res.json();
      expect(body.resetUrl).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reset flow: valid token changes the password, is single-use, and kills sessions", async () => {
    const u = freshUser("reset_flow");
    // simulate an existing logged-in session
    const rawToken = randomToken(12);
    run(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      uuid(), u.userId, sha256("some-session-token"), nowIso(), nowIso());
    run(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      uuid(), u.userId, sha256(rawToken),
      new Date(Date.now() + 3600_000).toISOString(), nowIso()
    );

    const res = await resetPassword(
      jsonRequest("/api/auth/reset-password", { token: rawToken, password: "newpass9x", confirmPassword: "newpass9x" })
    );
    expect(res.status).toBe(200);

    const user = findByLogin(u.username);
    expect(verifyPassword("newpass9x", user!.password_hash)).toBe(true);
    expect(all(`SELECT * FROM sessions WHERE user_id = ?`, u.userId)).toHaveLength(0);

    // second use of the same token must fail
    const again = await resetPassword(
      jsonRequest("/api/auth/reset-password", { token: rawToken, password: "another1x", confirmPassword: "another1x" })
    );
    expect(again.status).toBe(400);
    const still = findByLogin(u.username);
    expect(verifyPassword("another1x", still!.password_hash)).toBe(false);
  });
});

describe("registration + referrals", () => {
  it("welcome grant is paid through the ledger; referral bonuses apply to both sides", () => {
    const referrer = freshUser("ref_a");
    const code = get<{ referral_code: string }>(
      `SELECT referral_code FROM users WHERE id = ?`, referrer.userId
    )!.referral_code;

    const n = `ref_b_${Math.random().toString(36).slice(2, 8)}`;
    registerUser({
      username: n, displayName: n, email: `${n}@t.local`, password: "passw0rd1",
      inviteCode: code,
    });

    const welcome = get<{ amount: number; type: string }>(
      `SELECT amount, type FROM transactions WHERE user_id = (SELECT id FROM users WHERE username = ?) AND type = 'WELCOME'`, n
    );
    expect(welcome!.amount).toBe(1000);
    const refTx = get<{ amount: number; type: string }>(
      `SELECT amount, type FROM transactions WHERE user_id = ? AND type = 'REFERRAL'`, referrer.userId
    );
    expect(refTx!.amount).toBe(500);
  });
});
