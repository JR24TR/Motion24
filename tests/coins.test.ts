import { describe, it, expect } from "vitest";
import { get, run } from "@/server/db/client";
import { applyCoinChange, getBalance, listTransactions } from "@/server/services/coins";
import { registerUser, claimDailyBonus } from "@/server/services/players";

function freshUser(name: string) {
  const n = `${name}_${Math.random().toString(36).slice(2, 8)}`;
  const { userId } = registerUser({
    username: n,
    displayName: n,
    email: `${n}@t.local`,
    password: "passw0rd1",
  });
  return userId;
}

describe("coin ledger", () => {
  it("every change writes a ledger row with a correct balance_after", () => {
    const id = freshUser("ledger");
    const start = getBalance(id); // welcome grant already applied
    const a = applyCoinChange({ userId: id, amount: 250, type: "EARN", description: "test earn" });
    expect(a.balance).toBe(start + 250);
    const b = applyCoinChange({ userId: id, amount: -100, type: "SPEND", description: "test spend" });
    expect(b.balance).toBe(start + 150);
    const txs = listTransactions(id, { limit: 10 }).rows;
    expect(txs[0]).toMatchObject({ amount: -100, balanceAfter: start + 150, type: "SPEND" });
    expect(txs[1]).toMatchObject({ amount: 250, balanceAfter: start + 250, type: "EARN" });
    expect(getBalance(id)).toBe(start + 150);
  });

  it("rejects spends that would create a negative balance and leaves no partial state", () => {
    const id = freshUser("neg");
    const start = getBalance(id);
    expect(() =>
      applyCoinChange({ userId: id, amount: -(start + 1), type: "SPEND", description: "too much" })
    ).toThrowError(/enough ARC/i);
    expect(getBalance(id)).toBe(start);
    const txs = listTransactions(id, { limit: 50 }).rows.filter((t) => t.description === "too much");
    expect(txs).toHaveLength(0);
  });

  it("rejects zero/invalid amounts", () => {
    const id = freshUser("zero");
    expect(() =>
      applyCoinChange({ userId: id, amount: 0, type: "EARN", description: "nope" })
    ).toThrowError();
  });

  it("blocks duplicate once-per-day rewards (daily bonus)", () => {
    const id = freshUser("daily");
    const first = claimDailyBonus(id);
    expect(first.amount).toBeGreaterThan(0);
    expect(() => claimDailyBonus(id)).toThrowError(/already claimed/i);
    const daily = listTransactions(id, { limit: 50 }).rows.filter((t) => t.type === "DAILY_BONUS");
    expect(daily).toHaveLength(1);
  });

  it("dayKey dedupe also guards direct applyCoinChange calls", () => {
    const id = freshUser("dk");
    applyCoinChange({
      userId: id, amount: 10, type: "CHALLENGE", description: "challenge", dayKey: "2099-01-01",
    });
    expect(() =>
      applyCoinChange({
        userId: id, amount: 10, type: "CHALLENGE", description: "challenge", dayKey: "2099-01-01",
      })
    ).toThrowError(/already claimed/i);
    // a different day is fine
    applyCoinChange({
      userId: id, amount: 10, type: "CHALLENGE", description: "challenge", dayKey: "2099-01-02",
    });
    run(`DELETE FROM transactions WHERE user_id = ? AND type = 'CHALLENGE'`, id);
  });
});
