import type { DatabaseSync } from "node:sqlite";

/**
 * Safe, idempotent SQLite migrations for Checkpoint 6A.
 *
 * SQLite cannot ALTER a CHECK constraint, so existing databases whose
 * `transactions.type` CHECK predates PURCHASE (and which lack `order_id`)
 * must rebuild that table. Fresh databases are created by schema.sql and
 * take the no-op path here.
 */

const TX_TYPES = `'EARN','SPEND','GAME_ENTRY','GAME_REWARD','DAILY_BONUS',
                    'ACHIEVEMENT','REFERRAL','ADMIN_ADJUSTMENT','CHALLENGE',
                    'REFUND','WELCOME','EVENT','PURCHASE'`;

export const ORDERS_DDL = `CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id          TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN (
                        'PENDING','PROCESSING','SUCCESS','FAILED','EXPIRED','CANCELLED')),
  payment_method      TEXT NOT NULL CHECK (payment_method IN ('CARD','BANK_TRANSFER','CRYPTO')),
  provider            TEXT,
  currency            TEXT NOT NULL DEFAULT 'NGN',
  amount_minor        INTEGER NOT NULL CHECK (amount_minor > 0),
  arc_amount          INTEGER NOT NULL CHECK (arc_amount > 0),
  provider_reference  TEXT,
  client_reference    TEXT NOT NULL UNIQUE,
  provider_meta       TEXT,
  ledger_tx_id        TEXT,
  verified_at         TEXT,
  expires_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
)`;

const TRANSACTIONS_DDL = `CREATE TABLE transactions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    ${TX_TYPES})),
  description     TEXT NOT NULL,
  balance_after   INTEGER NOT NULL,
  game_session_id TEXT REFERENCES game_sessions(id),
  order_id        TEXT REFERENCES orders(id),
  day_key         TEXT,
  meta            TEXT,
  created_at      TEXT NOT NULL
)`;

type TableInfo = { name: string };

function tableSql(db: DatabaseSync, name: string): string | undefined {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as
    | { sql: string }
    | undefined;
  return row?.sql;
}

function columnNames(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as
    | TableInfo
    | undefined;
  return !!row;
}

function needsTransactionsRebuild(db: DatabaseSync): boolean {
  if (!tableExists(db, "transactions")) return false;
  const sql = tableSql(db, "transactions") ?? "";
  const hasPurchase = sql.includes("PURCHASE");
  const hasOrderId = columnNames(db, "transactions").includes("order_id");
  return !hasPurchase || !hasOrderId;
}

function ensureOrders(db: DatabaseSync) {
  db.exec(ORDERS_DDL);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at)`);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_provider_ref
     ON orders(provider_reference) WHERE provider_reference IS NOT NULL`
  );
}

function rebuildTransactions(db: DatabaseSync) {
  const cols = columnNames(db, "transactions");
  const selectCol = (name: string) => (cols.includes(name) ? name : "NULL");
  const selectList = [
    "id",
    "user_id",
    "amount",
    "type",
    "description",
    "balance_after",
    "game_session_id",
    "order_id",
    "day_key",
    "meta",
    "created_at",
  ]
    .map((c) => selectCol(c))
    .join(", ");

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(TRANSACTIONS_DDL.replace("CREATE TABLE transactions", "CREATE TABLE transactions_new"));
    db.exec(
      `INSERT INTO transactions_new
        (id, user_id, amount, type, description, balance_after, game_session_id, order_id, day_key, meta, created_at)
       SELECT ${selectList} FROM transactions`
    );
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function ensureTransactionIndexes(db: DatabaseSync) {
  if (!tableExists(db, "transactions")) return;
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_user_created ON transactions(user_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_type_created ON transactions(type, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC)`);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_daily_dedupe
     ON transactions(user_id, type, day_key) WHERE day_key IS NOT NULL`
  );
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_session_reward
     ON transactions(game_session_id) WHERE game_session_id IS NOT NULL AND type IN ('GAME_REWARD','REFUND')`
  );
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_purchase_order
     ON transactions(order_id) WHERE order_id IS NOT NULL AND type = 'PURCHASE'`
  );
}

/**
 * Apply Checkpoint 6A schema upgrades. Safe to call multiple times.
 * Call before and/or after schema.sql so both fresh and legacy DBs work.
 */
export function migrate(db: DatabaseSync) {
  if (tableExists(db, "users")) {
    ensureOrders(db);
  }
  if (needsTransactionsRebuild(db)) {
    if (!tableExists(db, "orders")) ensureOrders(db);
    rebuildTransactions(db);
  }
  ensureTransactionIndexes(db);
  if (tableExists(db, "orders")) ensureOrders(db);
}
