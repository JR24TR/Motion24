"use client";

import { useCallback, useEffect, useState } from "react";
import { api, post, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { EarnResponse, DailyClaimResponse } from "@/lib/account-types";
import { useAccount } from "@/components/app/account-provider";
import { ArcCoin } from "@/components/ui/arc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function Earn() {
  const toast = useToast();
  const { refresh } = useAccount();
  const [data, setData] = useState<EarnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<EarnResponse>("/api/player/earn");
      setData(res);
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load the Earn page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claimDaily() {
    setClaiming(true);
    try {
      const res = await post<DailyClaimResponse>("/api/rewards/daily/claim");
      toast.success(`Daily bonus claimed: +${res.amount.toLocaleString()} ARC`);
      // Balance/unread changed server-side — mirror in the shared shell state.
      await refresh();
      await load();
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not claim your daily bonus.");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-32 animate-pulse rounded-3xl bg-surface/60" />
        <div className="h-32 animate-pulse rounded-3xl bg-surface/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load the Earn page</h2>
        <p className="mt-1 text-sm text-mute">{error ?? "Earn data unavailable."}</p>
        <Button className="mt-5" onClick={() => void load()}>Try again</Button>
      </Card>
    );
  }

  const { daily, dailyWinChallenge } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Earn ARC</h1>
          <p className="mt-0.5 text-sm text-mute">Claim rewards and grow your balance.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <span className="mr-1 text-dim">Balance</span>
          <ArcCoin amount={data.balance} />
        </div>
      </header>

      {/* Daily reward */}
      <Card className="relative overflow-hidden p-6">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2 text-2xl" aria-hidden>
              🎁
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Daily reward</h2>
              <p className="mt-1 text-sm text-mute">
                Claim once per day for{" "}
                <ArcCoin amount={daily.amount} className="text-sm" />
                {daily.xp > 0 ? <span> and <span className="font-semibold text-xp">+{daily.xp} XP</span></span> : null}
                .
              </p>
              {daily.claimedToday ? (
                <span className="mt-2 inline-block rounded-full border border-win/30 bg-win/10 px-2.5 py-0.5 text-[11px] font-bold text-win">
                  Claimed today
                </span>
              ) : null}
            </div>
          </div>
          <Button
            size="lg"
            loading={claiming}
            disabled={daily.claimedToday}
            onClick={claimDaily}
          >
            {daily.claimedToday ? "Claimed" : "Claim now"}
          </Button>
        </div>
      </Card>

      {/* Daily win challenge + victory floor */}
      <Card className="p-5">
        <h2 className="font-display text-base font-bold text-ink">Daily challenge</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-mute">
              Win a game today to earn{" "}
              <ArcCoin amount={dailyWinChallenge.amount} className="text-sm" />
              {dailyWinChallenge.xp > 0 ? <span> and <span className="font-semibold text-xp">+{dailyWinChallenge.xp} XP</span></span> : null}
              .
            </p>
            <p className="mt-1 text-xs text-dim">
              Wins today: <span className="tnum font-semibold text-ink">{dailyWinChallenge.winsToday}</span>
            </p>
            {dailyWinChallenge.claimedToday ? (
              <span className="mt-2 inline-block rounded-full border border-win/30 bg-win/10 px-2.5 py-0.5 text-[11px] font-bold text-win">
                Completed today
              </span>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-dim">Victory floor</p>
            <p className="tnum text-lg font-bold text-arc">{data.victoryFloor.toLocaleString()} ARC</p>
            <p className="mt-0.5 text-xs text-dim">min. reward on a win</p>
          </div>
        </div>
      </Card>

      {/* Referral */}
      <Card className="p-5">
        <h2 className="font-display text-base font-bold text-ink">Referrals</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-mute">
              Invite a friend — you earn{" "}
              <ArcCoin amount={data.referral.bonus} className="text-sm" />
              , they get{" "}
              <ArcCoin amount={data.referral.welcome} className="text-sm" />
              .
            </p>
            <p className="mt-2 text-xs text-dim">
              People you've invited: <span className="tnum font-semibold text-ink">{data.referral.count}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(data.referralCode).catch(() => undefined);
                toast.info("Invite code copied");
              }}
              className="mt-2 inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold text-brand-2 transition hover:border-line-2"
            >
              <span className="tnum">{data.referralCode}</span>
              <span className="text-xs text-dim">copy</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-wider text-dim">You earn</p>
              <p className="tnum mt-1 text-lg font-bold text-arc">{data.referral.bonus.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-wider text-dim">They get</p>
              <p className="tnum mt-1 text-lg font-bold text-arc">{data.referral.welcome.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Win rate */}
      <Card className="p-5">
        <h2 className="font-display text-base font-bold text-ink">Your stats</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-dim">Games</p>
            <p className="tnum mt-1 text-lg font-bold text-ink">{data.winRate.gamesPlayed.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-dim">Wins</p>
            <p className="tnum mt-1 text-lg font-bold text-ink">{data.winRate.gamesWon.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-dim">Win rate</p>
            <p className="tnum mt-1 text-lg font-bold text-ink">{data.winRate.winRate}%</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
