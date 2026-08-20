import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { migrate } from "@/server/db/migrate";
import { getDb, get, all, run } from "@/server/db/client";
import { applyCoinChange } from "@/server/services/coins";
import { registerUser } from "@/server/services/players";
import { createOrder, finalizeSuccessfulOrder } from "@/server/services/orders";

const OLD_SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PLAYER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  referral_code TEXT NOT NULL UNIQUE,
  referred_by_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar TEXT NOT NULL DEFAULT '🎮',
  bio TEXT NOT NULL DEFAULT '',
  xp INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  entry_cost INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  is_win INTEGER NOT NULL DEFAULT 0,
  reward INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE transactions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'EARN','SPEND','GAME_ENTRY','GAME_REWARD','DAILY_BONUS',
                    'ACHIEVEMENT','REFERRAL','ADMIN_ADJUSTMENT','CHALLENGE',
                    'REFUND','WELCOME','EVENT')),
  description     TEXT NOT NULL,
  balance_after   INTEGER NOT NULL,
  game_session_id TEXT REFERENCES game_sessions(id),
  day_key         TEXT,
  meta            TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_tx_user_created ON transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_tx_daily_dedupe
  ON transactions(user_id, type, day_key) WHERE day_key IS NOT NULL;
`;

function tempDb(): { db: DatabaseSync; file: string } {
  const file = path.join(os.tmpdir(), `arena-mig-${crypto.randomBytes(6).toString("hex")}.db`);
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  return { db, file };
}

describe("SQLite PURCHASE / orders migration", () => {
  it("migrates a legacy transactions CHECK constraint, preserves rows and balances, and is idempotent", () => {
    const { db, file } = tempDb();
    try {
      db.exec(OLD_SCHEMA);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO users (id, username, email, display_name, password_hash, role, status, referral_code, created_at, updated_at)
         VALUES ('u1','legacy','l@t.local','Legacy','x','PLAYER','ACTIVE','AR-LEG', ?, ?)`
      ).run(now, now);
      db.prepare(
        `INSERT INTO profiles (user_id, avatar, bio, xp, balance, games_played, games_won, lifetime_earned, lifetime_spent, created_at, updated_at)
         VALUES ('u1','🎮','', 10, 7777, 3, 1, 9000, 1223, ?, ?)`
      ).run(now, now);
      db.prepare(
        `INSERT INTO transactions (id, user_id, amount, type, description, balance_after, game_session_id, day_key, meta, created_at)
         VALUES ('t1','u1',1000,'WELCOME','Welcome Grant',1000,NULL,NULL,NULL,?)`
      ).run(now);
      db.prepare(
        `INSERT INTO transactions (id, user_id, amount, type, description, balance_after, game_session_id, day_key, meta, created_at)
         VALUES ('t2','u1',-500,'GAME_ENTRY','entry',500,NULL,NULL,NULL,?)`
      ).run(now);

      const sqlBefore = (
        db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'`).get() as {
          sql: string;
        }
      ).sql;
      expect(sqlBefore).not.toContain("PURCHASE");
      expect(sqlBefore).not.toContain("order_id");

      migrate(db);
      migrate(db); // idempotent

      const sqlAfter = (
        db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'`).get() as {
          sql: string;
        }
      ).sql;
      expect(sqlAfter).toContain("PURCHASE");
      expect(sqlAfter).toContain("order_id");

      const txs = db.prepare(`SELECT id, type, amount, balance_after FROM transactions ORDER BY id`).all() as {
        id: string;
        type: string;
        amount: number;
        balance_after: number;
      }[];
      expect(txs).toEqual([
        { id: "t1", type: "WELCOME", amount: 1000, balance_after: 1000 },
        { id: "t2", type: "GAME_ENTRY", amount: -500, balance_after: 500 },
      ]);
      const bal = db.prepare(`SELECT balance FROM profiles WHERE user_id = 'u1'`).get() as { balance: number };
      expect(bal.balance).toBe(7777);

      const orders = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='orders'`).get();
      expect(orders).toBeTruthy();

      db.prepare(
        `INSERT INTO transactions (id, user_id, amount, type, description, balance_after, game_session_id, order_id, day_key, meta, created_at)
         VALUES ('t3','u1',500,'PURCHASE','migrated purchase',8277,NULL,NULL,NULL,NULL,?)`
      ).run(now);
      const purchase = db.prepare(`SELECT type FROM transactions WHERE id = 't3'`).get() as { type: string };
      expect(purchase.type).toBe("PURCHASE");
    } finally {
      db.close();
      try {
        fs.unlinkSync(file);
      } catch {
        /* tmp */
      }
    }
  });

  it("fresh database bootstrap already has orders + PURCHASE support", () => {
    // The test process DB was created via schema.sql + migrate in bootstrap.
    const n = `mig_fresh_${Math.random().toString(36).slice(2, 8)}`;
    const { userId } = registerUser({
      username: n,
      displayName: n,
      email: `${n}@t.local`,
      password: "passw0rd1",
    });
    const order = createOrder(userId, { packageId: "dev-starter", paymentMethod: "CARD" });
    finalizeSuccessfulOrder({ orderId: order.id });
    const tx = get<{ type: string; order_id: string }>(
      `SELECT type, order_id FROM transactions WHERE order_id = ?`,
      order.id
    );
    expect(tx).toMatchObject({ type: "PURCHASE", order_id: order.id });
    expect(all(`SELECT id FROM orders WHERE user_id = ?`, userId).length).toBe(1);
    applyCoinChange({ userId, amount: 5, type: "EARN", description: "post-migrate earn" });
  });
});
