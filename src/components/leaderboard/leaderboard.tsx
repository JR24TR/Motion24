"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import type { LeaderboardResponse, LeaderboardPeriod, LeaderboardRow } from "@/lib/account-types";
import type { MeResponse } from "@/lib/account-types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "ALL", label: "All-time" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const PODIUM_STYLE: Record<number, string> = {
  1: "from-arc/30 to-arc/5 border-arc/40",
  2: "from-surface-2 to-bg-2 border-line-2",
  3: "from-brand/20 to-bg-2 border-brand/30",
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function RankRow({
  row,
  isMe,
}: {
  row: LeaderboardRow;
  isMe: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${isMe ? "rounded-xl border border-brand-2/40 bg-brand/10" : ""}`}
    >
      <span
        className={`tnum grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-black ${
          row.rank === 1
            ? "bg-arc/20 text-arc"
            : row.rank <= 3
              ? "bg-brand/20 text-brand-2"
              : "bg-surface-2 text-mute"
        }`}
      >
        {row.rank}
      </span>
      <Avatar avatar={row.avatar} name={row.displayName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">
          {row.displayName}
          {isMe ? <span className="ml-2 rounded-full bg-brand-2/20 px-2 py-0.5 text-[10px] font-bold text-brand-2">You</span> : null}
        </p>
        <p className="truncate text-xs text-dim">@{row.username}</p>
      </div>
      <div className="text-right">
        <p className="tnum text-sm font-bold text-arc">{row.coins.toLocaleString()} ARC</p>
        <p className="text-xs text-dim">{row.wins} wins · {row.xp.toLocaleString()} XP</p>
      </div>
    </li>
  );
}

export function Leaderboard() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("ALL");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lb, meRes] = await Promise.all([
        api<LeaderboardResponse>(`/api/leaderboard?period=${period}`),
        api<MeResponse>("/api/auth/me").catch(() => null),
      ]);
      setData(lb);
      setMe(meRes);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiClientError ? err.message : "Could not load the leaderboard.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const podium = (data?.rows ?? []).slice(0, 3);
  const rest = (data?.rows ?? []).slice(3);
  const myRank = data?.myRank ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Leaderboard</h1>
          <p className="mt-0.5 text-sm text-mute">The crew's ARC standings.</p>
        </div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Leaderboard period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              role="tab"
              aria-selected={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                period === p.value ? "bg-brand/20 text-ink" : "text-mute hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {myRank > 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-mute">
          You're currently ranked <span className="tnum font-bold text-brand-2">#{myRank}</span> this period.
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface/60" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>⚠️</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load the leaderboard</h2>
          <p className="mt-1 text-sm text-mute">{error}</p>
          <Button className="mt-5" onClick={() => void load()}>Try again</Button>
        </Card>
      ) : data && data.rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>🏆</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">No rankings yet</h2>
          <p className="mt-1 text-sm text-mute">
            {myRank === 0
              ? "You're unranked in this period. Earn ARC to climb the board."
              : "No one has earned ARC in this period yet."}
          </p>
        </Card>
      ) : (
        data && (
          <div className="space-y-4">
            {/* Top 3 podium */}
            {podium.length > 0 ? (
              <div className="grid grid-cols-3 items-end gap-3">
                {[2, 1, 3].map((rank) => {
                  const row = podium[rank - 1];
                  if (!row) return <div key={rank} className="h-28" />;
                  const height = rank === 1 ? "h-40" : rank === 2 ? "h-32" : "h-28";
                  return (
                    <div key={row.userId} className="flex flex-col items-center gap-2">
                      <div className="text-2xl" aria-hidden>{MEDAL[rank]}</div>
                      <Avatar avatar={row.avatar} name={row.displayName} size="lg" />
                      <p className="w-full truncate text-center text-sm font-bold text-ink">{row.displayName}</p>
                      <p className="tnum text-sm font-bold text-arc">{row.coins.toLocaleString()}</p>
                      <div
                        className={`w-full rounded-t-2xl border border-b-0 bg-gradient-to-b text-center ${PODIUM_STYLE[rank]} ${height}`}
                      >
                        <span className="tnum pt-1 font-display text-2xl font-black text-ink">#{rank}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Rest of the board */}
            <Card className="divide-y divide-line/60">
              {podium.map((row) => (
                <RankRow key={row.userId} row={row} isMe={row.userId === me?.user.id} />
              ))}
              {rest.map((row) => (
                <RankRow key={row.userId} row={row} isMe={row.userId === me?.user.id} />
              ))}
            </Card>
          </div>
        )
      )}
    </div>
  );
}
