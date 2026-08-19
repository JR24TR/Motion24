import crypto from "node:crypto";

export const uuid = () => crypto.randomUUID();
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** UTC day key for once-per-day dedupe, e.g. "2026-08-19" */
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** ISO week key, e.g. "2026-W34" (weeks start Monday, UTC) */
export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Month key, e.g. "2026-08" */
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export const nowIso = () => new Date().toISOString();

export function referralCodeFor(username: string): string {
  const base = username.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "PLAYER";
  return `AR-${base}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}
