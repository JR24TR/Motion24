"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiClientError, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { DashboardResponse } from "@/lib/account-types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ArcCoin } from "@/components/ui/arc";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">{label}</p>
      <div className="mt-1 text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

export function ProfileView() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<DashboardResponse>("/api/player/dashboard");
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          if (isUnauthorized(err)) {
            redirectToLogin();
            return;
          }
          setError(err instanceof ApiClientError ? err.message : "Could not load your profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-40 animate-pulse rounded-3xl bg-surface/60" />
        <div className="h-40 animate-pulse rounded-3xl bg-surface/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load your profile</h2>
        <p className="mt-1 text-sm text-mute">{error ?? "Profile not available."}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Try again</Button>
      </Card>
    );
  }

  const p = data.profile;
  const pct = Math.round(data.level.progress * 100);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Profile</h1>
          <p className="mt-0.5 text-sm text-mute">Your arena identity and stats.</p>
        </div>
        <Link href="/profile/edit">
          <Button variant="secondary">Edit profile</Button>
        </Link>
      </header>

      {/* identity card */}
      <Card className="relative overflow-hidden p-6">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar avatar={p.avatar} name={p.displayName} size="xl" />
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-black text-ink">{p.displayName}</h2>
            <p className="text-sm text-dim">@{p.username}</p>
            {p.bio ? <p className="mt-2 max-w-md text-sm leading-relaxed text-mute">{p.bio}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-xp/30 bg-xp/10 px-2.5 py-0.5 text-[11px] font-bold text-xp">
                ⚡ Level {data.level.level}
              </span>
              {p.role === "ADMIN" ? (
                <span className="rounded-full border border-lose/30 bg-lose/10 px-2.5 py-0.5 text-[11px] font-bold text-lose">
                  Admin
                </span>
              ) : null}
            </div>
          </div>
          <div className="sm:ml-auto sm:text-right">
            <p className="text-[11px] uppercase tracking-wider text-dim">ARC balance</p>
            <p className="font-display text-3xl font-black arc-text">{p.balance.toLocaleString()}</p>
            <p className="mt-1 text-xs text-dim">Joined {new Date(p.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* XP progress */}
        <div className="relative mt-6">
          <div className="flex justify-between text-xs text-mute">
            <span>{data.level.xp.toLocaleString()} XP total</span>
            <span>
              {data.level.xpIntoLevel.toLocaleString()} / {data.level.xpForNextLevel.toLocaleString()} to next level
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Card>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Rank" value={data.rank > 0 ? `#${data.rank}` : "Unranked"} />
        <Stat label="Games played" value={data.gamesPlayed.toLocaleString()} />
        <Stat label="Wins" value={data.gamesWon.toLocaleString()} />
        <Stat label="Win rate" value={`${data.winRate}%`} />
        <Stat label="Achievements" value={`${data.unlockedCount}/${data.totalAchievements}`} />
        <Stat label="Invite code" value={<span className="tnum text-sm text-brand-2">{p.referralCode}</span>} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">Lifetime earned</p>
          <ArcCoin amount={data.coinsEarned} className="mt-1" />
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">Lifetime spent</p>
          <ArcCoin amount={data.coinsSpent} className="mt-1" />
        </Card>
      </div>
    </div>
  );
}
