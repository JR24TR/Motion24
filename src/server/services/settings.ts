import { get, all } from "@/server/db/client";

/** Platform settings (level curve etc.) — admin configurable, never hardcoded. */
export function getSetting(key: string, fallback: string): string {
  const row = get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key);
  return row?.value ?? fallback;
}
export function getSettingInt(key: string, fallback: number): number {
  const v = parseInt(getSetting(key, String(fallback)), 10);
  return Number.isFinite(v) ? v : fallback;
}

/** Reward configuration from the `rewards` table. */
export type RewardCfg = { code: string; label: string; arc: number; xp: number };
export function getReward(code: string, fallbackArc = 0, fallbackXp = 0): RewardCfg {
  const row = get<{ code: string; label: string; arc_amount: number; xp_amount: number }>(
    `SELECT code, label, arc_amount, xp_amount FROM rewards WHERE code = ?`,
    code
  );
  if (!row) return { code, label: code, arc: fallbackArc, xp: fallbackXp };
  return { code: row.code, label: row.label, arc: row.arc_amount, xp: row.xp_amount };
}
export function listRewards(): (RewardCfg & { description: string; updatedAt: string })[] {
  const { all } = require("@/server/db/client") as typeof import("@/server/db/client");
  return all<{
    code: string;
    label: string;
    description: string;
    arc_amount: number;
    xp_amount: number;
    updated_at: string;
  }>(`SELECT code, label, description, arc_amount, xp_amount, updated_at FROM rewards ORDER BY code`).map(
    (r) => ({
      code: r.code,
      label: r.label,
      description: r.description,
      arc: r.arc_amount,
      xp: r.xp_amount,
      updatedAt: r.updated_at,
    })
  );
}
