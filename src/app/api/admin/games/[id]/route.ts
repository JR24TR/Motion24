import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { gamePatchSchema } from "@/server/lib/validation";
import { recordAdminAction } from "@/server/services/admin";
import { run, get } from "@/server/db/client";
import { nowIso } from "@/server/lib/util";
import { parseEngineConfig } from "@/server/games/engines";
import { ApiError } from "@/server/lib/errors";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const patch = await body(req, gamePatchSchema);
    const game = get<{ id: string; slug: string; name: string; engine: string; config: string }>(
      `SELECT id, slug, name, engine, config FROM games WHERE id = ?`,
      id
    );
    if (!game) throw new ApiError(404, "NOT_FOUND", "Game not found.");

    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    const simple: [string, keyof typeof patch][] = [
      ["name", "name"],
      ["description", "description"],
      ["icon", "icon"],
      ["thumbnail", "thumbnail"],
      ["difficulty", "difficulty"],
      ["entry_cost", "entryCost"],
      ["max_reward", "maxReward"],
      ["status", "status"],
      ["sort_order", "sortOrder"],
    ];
    for (const [col, key] of simple) {
      const v = patch[key as keyof typeof patch];
      if (v !== undefined) {
        sets.push(`${col} = ?`);
        params.push(v === "" ? null : (v as string | number));
      }
    }
    if (patch.engine !== undefined || patch.config !== undefined) {
      const engine = patch.engine ?? game.engine;
      const raw = patch.config !== undefined ? patch.config : JSON.parse(game.config);
      const config = parseEngineConfig(engine, raw ?? {});
      sets.push("engine = ?", "config = ?");
      params.push(engine, JSON.stringify(config));
    }
    if (sets.length === 0) return { ok: true };
    run(`UPDATE games SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...params, nowIso(), id);

    const statusChanged = patch.status !== undefined;
    recordAdminAction(
      admin.id,
      statusChanged && patch.status === "DISABLED" ? "GAME_DEACTIVATE" : statusChanged ? "GAME_ACTIVATE" : "GAME_UPDATE",
      { type: "GAME", id, label: patch.name ?? game.name },
      undefined,
      { patch: { ...patch, config: undefined } }
    );
    return { ok: true };
  });
}
