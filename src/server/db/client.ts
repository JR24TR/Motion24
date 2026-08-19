import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { bootstrap } from "./bootstrap";

/**
 * SQLite connection (node:sqlite — real relational DB, transactional).
 * Single process-local connection; WAL mode; foreign keys enforced.
 */
const DB_PATH =
  process.env.ARENA_DB_PATH ?? path.join(process.cwd(), "data", "app.db");

declare module "node:sqlite" {
  interface DatabaseSync {
    __inTx?: boolean;
  }
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  bootstrap(db);
  return db;
}

/**
 * Atomic transaction wrapper. Every coin mutation MUST run inside one of
 * these — balance update + ledger row commit together or not at all.
 */
export function withTx<T>(fn: () => T): T {
  const d = getDb();
  if (d.__inTx) return fn(); // nested → join the outer transaction
  d.__inTx = true;
  d.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      d.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  } finally {
    d.__inTx = false;
  }
}

// tiny typed helpers -------------------------------------------------------
export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}
export function get<T>(
  sql: string,
  ...params: (string | number | null)[]
): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: (string | number | null)[]) {
  return getDb().prepare(sql).run(...params);
}
