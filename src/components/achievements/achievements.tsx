"use client";

import { useCallback, useEffect, useState } from "react";
import { api, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { AchievementsResponse, AchievementView } from "@/lib/account-types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArcCoin } from "@/components/ui/arc";

function AchievementCard({ a }: { a: AchievementView }) {
  const earned = !!a.unlockedAt;
  return (
    <Card
      className={`flex flex-col p-4 ${earned ? "border-arc/30" : "opacity-80"}`}
      hover={!earned}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-12 w-12 place-items-center rounded-2xl border text-2xl ${
            earned ? "border-arc/40 bg-arc/10" : "border-line bg-surface-2 grayscale"
          }`}
          aria-hidden
        >
          {a.icon}
        </span>
        {earned ? (
          <span className="rounded-full border border-win/30 bg-win/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-win">
            Earned
          </span>
        ) : (
          <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">
            Locked
          </span>
        )}
      </div>
      <h3 className="font-display mt-3 text-base font-bold text-ink">{a.name}</h3>
      <p className="mt-1 text-sm leading-relaxed text-mute">{a.description}</p>

      <div className="mt-3 flex items-center gap-3 text-xs text-dim">
        {a.arcReward > 0 ? <ArcCoin amount={a.arcReward} className="text-xs" /> : null}
        {a.xpReward > 0 ? <span className="font-semibold text-xp">+{a.xpReward} XP</span> : null}
        {a.unlockedAt ? (
          <span className="ml-auto">
            {new Date(a.unlockedAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      {/* progress */}
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-dim">
          <span>{earned ? "Complete" : `${Math.min(a.currentValue, a.target)} / ${a.target}`}</span>
          {!earned ? <span>{Math.round(a.progress * 100)}%</span> : null}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-all ${earned ? "bg-gradient-to-r from-arc to-arc-deep" : "bg-brand/60"}`}
            style={{ width: `${Math.round(a.progress * 100)}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

export function Achievements() {
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<AchievementsResponse>("/api/achievements");
      setData(res);
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load achievements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-3xl bg-surface/60" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load achievements</h2>
        <p className="mt-1 text-sm text-mute">{error ?? "Achievements unavailable."}</p>
        <Button className="mt-5" onClick={() => void load()}>Try again</Button>
      </Card>
    );
  }

  const total = data.achievements.length;
  const earnedCount = data.achievements.filter((a) => a.unlockedAt).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-black text-ink">Achievements</h1>
        <p className="mt-0.5 text-sm text-mute">
          {earnedCount} of {total} unlocked — keep playing to earn more ARC and XP.
        </p>
      </header>

      {total === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>🎯</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">No achievements yet</h2>
          <p className="mt-1 text-sm text-mute">Achievements will appear here as they're added.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((a) => (
            <AchievementCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
