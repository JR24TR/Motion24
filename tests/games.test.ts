import { describe, it, expect } from "vitest";
import { get, all, run } from "@/server/db/client";
import { registerUser } from "@/server/services/players";
import { startGameSession, finishGameSession } from "@/server/services/games";
import { getEngine } from "@/server/games/engines";
import { ApiError } from "@/server/lib/errors";

function freshUser(name: string, balance = 1000) {
  const n = `${name}_${Math.random().toString(36).slice(2, 8)}`;
  const { userId } = registerUser({
    username: n, displayName: n, email: `${n}@t.local`, password: "passw0rd1",
  });
  if (balance !== 1000) {
    run(`UPDATE profiles SET balance = ? WHERE user_id = ?`, balance, userId);
  }
  return userId;
}

describe("game sessions", () => {
  it("start: creates session + deducts entry fee atomically (FK ordering fixed)", () => {
    const id = freshUser("start_ok");
    const started = startGameSession(id, "coin-rush");
    expect(started.sessionId).toBeTruthy();
    expect(started.balance).toBe(500); // 1000 welcome - 500 entry

    const session = get<{ status: string; entry_cost: number; user_id: string }>(
      `SELECT status, entry_cost, user_id FROM game_sessions WHERE id = ?`,
      started.sessionId
    );
    expect(session).toMatchObject({ status: "ACTIVE", entry_cost: 500, user_id: id });

    const entry = get<{ amount: number; type: string; balance_after: number }>(
      `SELECT amount, type, balance_after FROM transactions WHERE game_session_id = ?`,
      started.sessionId
    );
    expect(entry).toMatchObject({ amount: -500, type: "GAME_ENTRY", balance_after: 500 });
  });

  it("start: insufficient balance → error, and NO session or deduction is left behind", () => {
    const id = freshUser("start_poor", 100);
    const before = all(`SELECT id FROM game_sessions WHERE user_id = ?`, id);
    expect(() => startGameSession(id, "coin-rush")).toThrowError(/enough ARC/i);
    // rollback proof: no session row, balance untouched, no ledger row
    expect(all(`SELECT id FROM game_sessions WHERE user_id = ?`, id)).toEqual(before);
    const bal = get<{ balance: number }>(`SELECT balance FROM profiles WHERE user_id = ?`, id);
    expect(bal!.balance).toBe(100);
    const tx = all(`SELECT * FROM transactions WHERE user_id = ? AND type = 'GAME_ENTRY'`, id);
    expect(tx).toHaveLength(0);
  });

  it("finish: server computes tiered reward from a clamped score", async () => {
    const id = freshUser("finish_mid");
    const s = startGameSession(id, "coin-rush");
    await new Promise((r) => setTimeout(r, 1100)); // engine requires >1s elapsed
    const res = finishGameSession(id, s.sessionId, 130);
    // maxScore = floor(30s/550ms)*3 = 162; 130/162 = 0.80 → 60% tier → 1500
    expect(res.maxScore).toBe(162);
    expect(res.score).toBe(130);
    expect(res.reward).toBe(1500);
    expect(res.isWin).toBe(true);
    // first win of the day also pays the daily challenge
    expect(res.challengeAwarded).toBeGreaterThan(0);
    expect(res.xpEarned).toBe(100); // 25 play + 75 win
    // the FIRST_WIN achievement unlocks on the first victory and pays its own ARC
    expect(res.newAchievements.map((a) => a.code)).toContain("FIRST_WIN");
    const achievementArc = res.newAchievements.reduce((s, a) => s + a.arcReward, 0);
    // balance: 1000 - 500 + 1500 + challenge + achievement rewards
    expect(res.balance).toBe(1000 - 500 + 1500 + res.challengeAwarded + achievementArc);
    const session = get<{ status: string; score: number; reward: number; is_win: number }>(
      `SELECT status, score, reward, is_win FROM game_sessions WHERE id = ?`,
      s.sessionId
    );
    expect(session).toMatchObject({ status: "COMPLETED", score: 130, reward: 1500, is_win: 1 });
  });

  it("finish: absurd client scores are clamped to the theoretical maximum", async () => {
    const id = freshUser("finish_clamp");
    const s = startGameSession(id, "coin-rush");
    await new Promise((r) => setTimeout(r, 1100));
    const res = finishGameSession(id, s.sessionId, 99_999_999);
    expect(res.score).toBe(res.maxScore);
    expect(res.reward).toBeLessThanOrEqual(2500);
  });

  it("finish: replaying a finished session is rejected (no double rewards)", async () => {
    const id = freshUser("finish_replay");
    const s = startGameSession(id, "coin-rush");
    await new Promise((r) => setTimeout(r, 1100));
    finishGameSession(id, s.sessionId, 130);
    const balanceAfterFirst = get<{ balance: number }>(
      `SELECT balance FROM profiles WHERE user_id = ?`, id
    )!.balance;
    expect(() => finishGameSession(id, s.sessionId, 130)).toThrowError(/no longer active/i);
    const rewards = all(
      `SELECT * FROM transactions WHERE game_session_id = ? AND type = 'GAME_REWARD'`,
      s.sessionId
    );
    expect(rewards).toHaveLength(1);
    expect(get<{ balance: number }>(`SELECT balance FROM profiles WHERE user_id = ?`, id)!.balance)
      .toBe(balanceAfterFirst);
  });

  it("finish: impossibly fast submissions are rejected — atomically (nothing changes)", () => {
    const id = freshUser("finish_fast");
    const s = startGameSession(id, "coin-rush");
    expect(() => finishGameSession(id, s.sessionId, 162)).toThrowError(/too quickly/i);
    // the rejection throws inside the transaction → rolled back: no reward,
    // no stats, and the session stays ACTIVE so an honest retry is possible
    const session = get<{ status: string; reward: number }>(
      `SELECT status, reward FROM game_sessions WHERE id = ?`, s.sessionId
    );
    expect(session).toMatchObject({ status: "ACTIVE", reward: 0 });
    const rewards = all(
      `SELECT * FROM transactions WHERE game_session_id = ? AND type = 'GAME_REWARD'`,
      s.sessionId
    );
    expect(rewards).toHaveLength(0);
  });

  it("engine: sessions reported after the grace window forfeit (expired, no reward)", () => {
    const engine = getEngine("coin-rush")!;
    const cfg = engine.defaultConfig();
    const outcome = engine.resolveOutcome({ maxReward: 2500 }, cfg, 150, 30_000 + 11_000);
    expect(outcome.expired).toBe(true);
    expect(outcome.reward).toBe(0);
  });

  it("a session belonging to another user cannot be finished", async () => {
    const a = freshUser("owner_a");
    const b = freshUser("owner_b");
    const s = startGameSession(a, "coin-rush");
    await new Promise((r) => setTimeout(r, 1100));
    expect(() => finishGameSession(b, s.sessionId, 150)).toThrowError(ApiError);
  });
});
