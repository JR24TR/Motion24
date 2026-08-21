"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiClientError, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { DashboardResponse } from "@/lib/account-types";
import { ArcCoin } from "@/components/ui/arc";
import { Card } from "@/components/ui/card";
import { LevelBadge } from "@/components/ui/level-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type DashboardData = DashboardResponse;

const QUICK_ACTIONS = [
  { href: "/games", label: "Play", icon: "🎮", desc: "Enter a game" },
  { href: "/earn", label: "Earn ARC", icon: "🪙", desc: "Daily bonus & challenges" },
  { href: "/wallet", label: "Buy ARC", icon: "👜", desc: "Card or bank transfer" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆", desc: "See the standings" },
  { href: "/profile", label: "Profile", icon: "👤", desc: "Edit your profile" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TxRow({ tx }: { tx: DashboardData["recentTransactions"][number] }) {
  const positive = tx.amount > 0;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm ${
            positive ? "bg-win/15" : "bg-lose/15"
          }`}
          aria-hidden
        >
          {positive ? "↑" : "↓"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{tx.description}</p>
          <p className="text-xs text-dim">{formatDate(tx.createdAt)}</p>
        </div>
      </div>
      <ArcCoin amount={tx.amount} signed className="shrink-0 text-sm" />
    </li>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<DashboardData>("/api/player/dashboard");
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          if (isUnauthorized(err)) {
            redirectToLogin();
            return;
          }
          setError(
            err instanceof ApiClientError ? err.message : "Could not load your dashboard."
          );
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
        <div className="h-28 animate-pulse rounded-3xl bg-surface/60" />
        <div className="h-32 animate-pulse rounded-3xl bg-surface/60" />
        <div className="h-40 animate-pulse rounded-3xl bg-surface/60" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>
          ⚠️
        </p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load your dashboard</h2>
        <p className="mt-1 text-sm text-mute">{error}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!data) return null;

  const pct = Math.round(data.level.progress * 100);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-mute">Your arena at a glance.</p>
        </div>
        <LevelBadge level={data.level.level} />
      </header>

      {/* Balance hero */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface to-surface-2 p-6">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-dim">ARC balance</p>
          <p className="mt-2 font-display text-4xl font-black arc-text sm:text-5xl">
            {data.balance.toLocaleString()}
          </p>
          <div className="mt-5 max-w-xs">
            <div className="flex justify-between text-xs text-mute">
              <span>Level {data.level.level}</span>
              <span>
                {data.level.xpIntoLevel.toLocaleString()} / {data.level.xpForNextLevel.toLocaleString()} XP
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-dim">
              {data.level.xpForNextLevel - data.level.xpIntoLevel > 0
                ? `${(data.level.xpForNextLevel - data.level.xpIntoLevel).toLocaleString()} XP to level ${data.level.level + 1}`
                : "Max level"}
            </p>
          </div>
        </div>
      </section>

      {/* Player status */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">Player status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Rank", value: data.rank > 0 ? `#${data.rank}` : "—" },
            { label: "Games played", value: data.gamesPlayed.toLocaleString() },
            { label: "Wins", value: data.gamesWon.toLocaleString() },
            { label: "Win rate", value: `${data.winRate}%` },
          ].map((s) => (
            <Card key={s.label} className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">{s.label}</p>
              <p className="tnum mt-1 font-display text-xl font-bold text-ink">{s.value}</p>
            </Card>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">Lifetime earned</p>
            <ArcCoin amount={data.coinsEarned} className="mt-1" />
          </Card>
          <Card className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">Lifetime spent</p>
            <ArcCoin amount={data.coinsSpent} className="mt-1" />
          </Card>
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="card flex flex-col items-center gap-1 px-4 py-4 text-center transition hover:border-line-2 hover:bg-surface-2"
            >
              <span className="text-2xl" aria-hidden>
                {a.icon}
              </span>
              <span className="mt-1 text-sm font-bold text-ink">{a.label}</span>
              <span className="text-xs text-dim">{a.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Transactions */}
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink">Recent transactions</h2>
            <Link href="/transactions" className="text-xs font-semibold text-brand-2 hover:underline">
              View all
            </Link>
          </div>
          {data.recentTransactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-dim">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.recentTransactions.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </ul>
          )}
        </Card>

        {/* Games */}
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink">Recent games</h2>
            <Link href="/games" className="text-xs font-semibold text-brand-2 hover:underline">
              Play
            </Link>
          </div>
          {data.recentGames.length === 0 ? (
            <p className="py-6 text-center text-sm text-dim">
              No games played yet. Ready for your first round?
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.recentGames.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2" aria-hidden>
                      {g.game.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{g.game.name}</p>
                      <p className="text-xs text-dim">
                        {g.status === "COMPLETED"
                          ? g.isWin
                            ? "Victory"
                            : "Played"
                          : g.status.toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {g.reward > 0 ? (
                      <ArcCoin amount={g.reward} signed className="text-sm" />
                    ) : g.score != null ? (
                      <span className="tnum text-sm font-bold text-mute">{g.score} pts</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Achievements */}
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink">Recent achievements</h2>
            <Link href="/achievements" className="text-xs font-semibold text-brand-2 hover:underline">
              View all
            </Link>
          </div>
          {data.recentAchievements.length === 0 ? (
            <p className="py-6 text-center text-sm text-dim">No achievements unlocked yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.recentAchievements.map((a) => (
                <li key={a.code} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2" aria-hidden>
                    {a.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{a.name}</p>
                    <p className="text-xs text-dim">Unlocked {formatDate(a.unlockedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
