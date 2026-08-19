import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { gameCreateSchema } from "@/server/lib/validation";
import { listGames } from "@/server/services/games";
import { recordAdminAction } from "@/server/services/admin";
import { run, get } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";
import { parseEngineConfig } from "@/server/games/engines";
import { ApiError } from "@/server/lib/errors";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return { games: listGames() };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const input = await body(req, gameCreateSchema);
    const dupe = get<{ id: string }>(`SELECT id FROM games WHERE slug = ?`, input.slug);
    if (dupe) throw new ApiError(409, "SLUG_TAKEN", "A game with that slug already exists.");
    const config = parseEngineConfig(input.engine, input.config ?? {}); // throws if invalid
    const id = uuid();
    run(
      `INSERT INTO games (id, slug, name, description, icon, thumbnail, difficulty, entry_cost, max_reward, engine, config, status, play_count, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      id,
      input.slug,
      input.name,
      input.description,
      input.icon,
      input.thumbnail || null,
      input.difficulty,
      input.entryCost,
      input.maxReward,
      input.engine,
      JSON.stringify(config),
      input.status,
      input.sortOrder,
      nowIso(),
      nowIso()
    );
    recordAdminAction(admin.id, "GAME_CREATE", { type: "GAME", id, label: input.name }, undefined, {
      entryCost: input.entryCost,
      maxReward: input.maxReward,
      engine: input.engine,
    });
    return { ok: true, id };
  });
}
