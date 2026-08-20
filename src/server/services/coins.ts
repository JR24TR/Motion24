import { get, run, all, withTx } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";
import { ApiError, ERRORS } from "@/server/lib/errors";
import { recordLeaderboard } from "./leaderboard";

export type TxType =
  | "EARN"
  | "SPEND"
  | "GAME_ENTRY"
  | "GAME_REWARD"
  | "DAILY_BONUS"
  | "ACHIEVEMENT"
  | "REFERRAL"
  | "ADMIN_ADJUSTMENT"
  | "CHALLENGE"
  | "REFUND"
  | "WELCOME"
  | "EVENT"
  | "PURCHASE";

export type CoinChange = {
  userId: string;
  /** signed delta — negative spends, positive earns. Never 0. */
  amount: number;
  type: TxType;
  description: string;
  gameSessionId?: string;
  /** purchase orders — unique PURCHASE-per-order index blocks double credit */
  orderId?: string;
  /** when set, the (userId,type,dayKey) unique index blocks duplicates */
  dayKey?: string;
  meta?: Record<string, unknown>;
};

export function getBalance(userId: string): number {
  const row = get<{ balance: number }>(`SELECT balance FROM profiles WHERE user_id = ?`, userId);
  return row?.balance ?? 0;
}

/**
 * THE single choke-point for every ARC mutation. Balance check, profile
 * update, ledger row, and leaderboard aggregate happen atomically — there
 * is no other code path that writes `profiles.balance`.
 */
export function applyCoinChange(c: CoinChange): { balance: number; txId: string } {
  return withTx(() => {
    if (!Number.isInteger(c.amount) || c.amount === 0) {
      throw ERRORS.BAD_REQUEST("Invalid coin amount.");
    }
    if (c.dayKey) {
      const dupe = get<{ id: string }>(
        `SELECT id FROM transactions WHERE user_id = ? AND type = ? AND day_key = ?`,
        c.userId,
        c.type,
        c.dayKey
      );
      if (dupe) throw ERRORS.ALREADY_CLAIMED();
    }
    if (c.orderId && c.type === "PURCHASE") {
      const credited = get<{ id: string }>(
        `SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`,
        c.orderId
      );
      if (credited) throw ERRORS.BAD_REQUEST("This order has already been credited.");
    }
    const profile = get<{ balance: number }>(
      `SELECT balance FROM profiles WHERE user_id = ?`,
      c.userId
    );
    if (!profile) throw ERRORS.NOT_FOUND("account");

    const newBalance = profile.balance + c.amount;
    if (newBalance < 0) throw ERRORS.INSUFFICIENT_FUNDS(Math.abs(c.amount), profile.balance);

    run(
      `UPDATE profiles SET
         balance = ?,
         lifetime_earned = lifetime_earned + ?,
         lifetime_spent = lifetime_spent + ?,
         updated_at = ?
       WHERE user_id = ?`,
      newBalance,
      c.amount > 0 ? c.amount : 0,
      c.amount < 0 ? Math.abs(c.amount) : 0,
      nowIso(),
      c.userId
    );

    const txId = uuid();
    try {
      run(
        `INSERT INTO transactions
          (id, user_id, amount, type, description, balance_after, game_session_id, order_id, day_key, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        txId,
        c.userId,
        c.amount,
        c.type,
        c.description,
        newBalance,
        c.gameSessionId ?? null,
        c.orderId ?? null,
        c.dayKey ?? null,
        c.meta ? JSON.stringify(c.meta) : null,
        nowIso()
      );
    } catch (e) {
      // Unique indexes are the last line of defense. Map collisions from
      // current row state — never from SQLite's raw error text.
      if (c.orderId && c.type === "PURCHASE") {
        const credited = get<{ id: string }>(
          `SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`,
          c.orderId
        );
        if (credited) throw ERRORS.BAD_REQUEST("This order has already been credited.");
      }
      if (c.dayKey) {
        const dupe = get<{ id: string }>(
          `SELECT id FROM transactions WHERE user_id = ? AND type = ? AND day_key = ?`,
          c.userId,
          c.type,
          c.dayKey
        );
        if (dupe) throw ERRORS.ALREADY_CLAIMED();
      }
      throw e;
    }

    if (c.amount > 0) recordLeaderboard(c.userId, { coinsEarned: c.amount });
    return { balance: newBalance, txId };
  });
}

export type TransactionDTO = {
  id: string;
  amount: number;
  type: TxType;
  description: string;
  balanceAfter: number;
  gameSessionId: string | null;
  createdAt: string;
};

export function listTransactions(
  userId: string,
  opts: { limit?: number; offset?: number; filter?: "ALL" | "EARNED" | "SPENT" } = {}
): { rows: TransactionDTO[]; total: number } {
  const limit = Math.min(opts.limit ?? 25, 100);
  const offset = opts.offset ?? 0;
  const where = opts.filter === "EARNED" ? "AND t.amount > 0" : opts.filter === "SPENT" ? "AND t.amount < 0" : "";
  const total =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions t WHERE t.user_id = ? ${where}`,
      userId
    )?.n ?? 0;
  const rows = all<{
    id: string;
    amount: number;
    type: TxType;
    description: string;
    balance_after: number;
    game_session_id: string | null;
    created_at: string;
  }>(
    `SELECT t.id, t.amount, t.type, t.description, t.balance_after, t.game_session_id, t.created_at
     FROM transactions t WHERE t.user_id = ? ${where}
     ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    userId,
    limit,
    offset
  );
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      type: r.type,
      description: r.description,
      balanceAfter: r.balance_after,
      gameSessionId: r.game_session_id,
      createdAt: r.created_at,
    })),
  };
}

export function assertType(value: string): TxType {
  const ok: TxType[] = [
    "EARN", "SPEND", "GAME_ENTRY", "GAME_REWARD", "DAILY_BONUS", "ACHIEVEMENT",
    "REFERRAL", "ADMIN_ADJUSTMENT", "CHALLENGE", "REFUND", "WELCOME", "EVENT",
    "PURCHASE",
  ];
  return (ok as string[]).includes(value) ? (value as TxType) : "EARN";
}

export { ApiError };
