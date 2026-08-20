"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import type { TransactionsResponse, Transaction } from "@/lib/account-types";
import { ArcCoin } from "@/components/ui/arc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Filter = "ALL" | "EARNED" | "SPENT";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "EARNED", label: "Earned" },
  { value: "SPENT", label: "Spent" },
];

const PAGE_SIZE = 25;

const TX_META: Partial<Record<Transaction["type"], { icon: string; tag: string }>> = {
  GAME_ENTRY: { icon: "🎮", tag: "Game entry" },
  GAME_REWARD: { icon: "🏆", tag: "Game reward" },
  DAILY_BONUS: { icon: "🎁", tag: "Daily" },
  ACHIEVEMENT: { icon: "🎯", tag: "Achievement" },
  REFERRAL: { icon: "🤝", tag: "Referral" },
  CHALLENGE: { icon: "⚡", tag: "Challenge" },
  WELCOME: { icon: "👋", tag: "Welcome" },
  REFUND: { icon: "↩️", tag: "Refund" },
  ADMIN_ADJUSTMENT: { icon: "🛠️", tag: "Adjustment" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TxRow({ tx }: { tx: Transaction }) {
  const positive = tx.amount > 0;
  const meta = TX_META[tx.type] ?? { icon: "💸", tag: tx.type.replace(/_/g, " ") };
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-base ${
            positive ? "border-win/25 bg-win/10" : "border-lose/25 bg-lose/10"
          }`}
          aria-hidden
        >
          {meta.icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{tx.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-dim">
            <span className="capitalize">{meta.tag}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(tx.createdAt)}</span>
            {tx.gameSessionId ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-mute">
                  🎮 game session
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <ArcCoin amount={tx.amount} signed className="text-sm" />
        <p className="mt-0.5 text-[11px] text-dim">
          Bal <span className="tnum">{tx.balanceAfter.toLocaleString()}</span>
        </p>
      </div>
    </li>
  );
}

export function Transactions() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<TransactionsResponse>(
        `/api/wallet/transactions?filter=${filter}&page=${page}&limit=${PAGE_SIZE}`
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiClientError ? err.message : "Could not load transactions.");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-black text-ink">Transactions</h1>
        <p className="mt-0.5 text-sm text-mute">Your full ARC ledger — every coin in and out.</p>
      </header>

      {/* filter tabs */}
      <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Filter transactions">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => changeFilter(f.value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              filter === f.value ? "bg-brand/20 text-ink" : "text-mute hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface/60" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>⚠️</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load transactions</h2>
          <p className="mt-1 text-sm text-mute">{error}</p>
          <Button className="mt-5" onClick={() => void load()}>Try again</Button>
        </Card>
      ) : data && data.rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>💸</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">No {filter.toLowerCase()} transactions</h2>
          <p className="mt-1 text-sm text-mute">
            {filter === "ALL"
              ? "Your ARC ledger is empty for now."
              : filter === "EARNED"
                ? "You haven't earned any ARC yet."
                : "You haven't spent any ARC yet."}
          </p>
        </Card>
      ) : (
        data && (
          <Card className="p-5">
            <p className="mb-2 text-xs text-dim">
              {data.total.toLocaleString()} transaction{data.total === 1 ? "" : "s"}
            </p>
            <ul className="divide-y divide-line/60">
              {data.rows.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </ul>

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ← Prev
                </Button>
                <span className="text-sm text-dim">
                  Page <span className="tnum text-ink">{page}</span> of{" "}
                  <span className="tnum text-ink">{totalPages}</span>
                </span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </Button>
              </div>
            ) : null}
          </Card>
        )
      )}
    </div>
  );
}
