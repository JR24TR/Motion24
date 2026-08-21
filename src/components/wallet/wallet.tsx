"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, post, ApiClientError, isUnauthorized, redirectToLogin } from "@/lib/api";
import type {
  CreateOrderResponse,
  OrderResponse,
  OrdersListResponse,
  PackagesResponse,
  WalletOrder,
  WalletPackage,
} from "@/lib/account-types";
import { useAccount } from "@/components/app/account-provider";
import { ArcCoin } from "@/components/ui/arc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  formatNgnFromKobo,
  isLivePaymentMethod,
  LIVE_PAYMENT_METHODS,
  ORDER_STATUS_COPY,
  recommendedPackageId,
  walletErrorMessage,
} from "@/lib/wallet-helpers";

type PayMethod = "CARD" | "BANK_TRANSFER";

const TONE_CLASS = {
  pending: "border-brand/30 bg-brand/10 text-brand-2",
  ok: "border-win/30 bg-win/10 text-win",
  bad: "border-lose/30 bg-lose/10 text-lose",
  warn: "border-arc/30 bg-arc/10 text-arc",
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => undefined);
        toast.info(`${label} copied`);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-semibold text-brand-2 transition hover:border-line-2"
      aria-label={`Copy ${label}`}
    >
      Copy
    </button>
  );
}

function StatusBadge({ status }: { status: WalletOrder["status"] }) {
  const copy = ORDER_STATUS_COPY[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${TONE_CLASS[copy.tone]}`}
    >
      {copy.label}
    </span>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return <p className="text-sm font-semibold text-lose">This payment window has ended.</p>;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <p className="text-sm text-mute" aria-live="polite">
      Time left:{" "}
      <span className="tnum font-bold text-ink">
        {m}:{String(s).padStart(2, "0")}
      </span>
    </p>
  );
}

export function Wallet() {
  const toast = useToast();
  const { me, refresh } = useAccount();
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("order");

  const [packages, setPackages] = useState<WalletPackage[]>([]);
  const [orders, setOrders] = useState<OrdersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("CARD");
  const [placing, setPlacing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [active, setActive] = useState<WalletOrder | null>(null);

  const recommended = useMemo(() => recommendedPackageId(packages), [packages]);
  const selected = packages.find((p) => p.id === packageId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pkgRes, orderRes] = await Promise.all([
        api<PackagesResponse>("/api/wallet/packages"),
        api<OrdersListResponse>("/api/wallet/orders?page=1&limit=25"),
      ]);
      setPackages(pkgRes.packages);
      setOrders(orderRes);
      setPackageId((current) => {
        if (current && pkgRes.packages.some((p) => p.id === current)) return current;
        return recommendedPackageId(pkgRes.packages);
      });
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      setError(walletErrorMessage(err, "Could not load your wallet."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hydrateOrder = useCallback(async (id: string) => {
    try {
      const res = await api<OrderResponse>(`/api/wallet/orders/${id}`);
      setActive(res.order);
      if (res.order.status === "SUCCESS") await refresh();
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      toast.error(walletErrorMessage(err, "Could not load that order."));
    }
  }, [refresh, toast]);

  useEffect(() => {
    if (focusOrderId) void hydrateOrder(focusOrderId);
  }, [focusOrderId, hydrateOrder]);

  async function placeOrder() {
    if (!packageId || !isLivePaymentMethod(method)) return;
    setPlacing(true);
    try {
      const res = await post<CreateOrderResponse>("/api/wallet/orders", {
        packageId,
        paymentMethod: method,
      });
      setActive(res.order);
      toast.info("Order created", "Complete payment with the provider. We confirm success on the server only.");
      await load();
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      toast.error(walletErrorMessage(err, "Could not start this purchase."));
    } finally {
      setPlacing(false);
    }
  }

  async function checkStatus() {
    if (!active) return;
    setChecking(true);
    try {
      const res = await post<OrderResponse>(`/api/wallet/orders/${active.id}/check`);
      setActive(res.order);
      if (res.order.status === "SUCCESS") {
        toast.success("Payment confirmed", `${res.order.arcAmount.toLocaleString()} ARC added to your wallet.`);
        await refresh();
      } else if (res.order.status === "PENDING" || res.order.status === "PROCESSING") {
        toast.info("Still waiting", "The provider has not confirmed this payment yet.");
      } else {
        toast.error(ORDER_STATUS_COPY[res.order.status].label, ORDER_STATUS_COPY[res.order.status].hint);
      }
      await load();
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      const msg = walletErrorMessage(err, "Could not check payment status.");
      toast.error(msg);
      if (err instanceof ApiClientError && /expired/i.test(err.message) && active) {
        void hydrateOrder(active.id);
      }
    } finally {
      setChecking(false);
    }
  }

  function startNew() {
    setActive(null);
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-28 animate-pulse rounded-3xl bg-surface/60" />
        <div className="h-40 animate-pulse rounded-3xl bg-surface/60" />
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
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn&apos;t load your wallet</h2>
        <p className="mt-1 text-sm text-mute">{error}</p>
        <Button className="mt-5" onClick={() => void load()}>
          Try again
        </Button>
      </Card>
    );
  }

  const checkoutUrl = active?.checkoutUrl ?? active?.paymentInstructions?.checkoutUrl ?? null;
  const bank = active?.paymentInstructions?.bankTransfer ?? null;
  const copy = active ? ORDER_STATUS_COPY[active.status] : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Wallet</h1>
          <p className="mt-0.5 text-sm text-mute">Buy ARC with card or Nigerian bank transfer.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-dim">Balance</p>
          <ArcCoin amount={me.balance} className="text-base" />
        </div>
      </header>

      {active ? (
        <section aria-labelledby="order-status-heading">
          <Card className="relative overflow-hidden p-5 sm:p-6">
            <div className="grid-backdrop absolute inset-0" aria-hidden />
            <div className="relative space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="order-status-heading" className="font-display text-lg font-bold text-ink">
                    Your purchase
                  </h2>
                  <p className="mt-1 text-sm text-mute">{copy?.hint}</p>
                </div>
                <StatusBadge status={active.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-line bg-bg-2 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-dim">ARC</p>
                  <p className="tnum mt-0.5 font-bold text-arc">{active.arcAmount.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-line bg-bg-2 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-dim">Price</p>
                  <p className="tnum mt-0.5 font-bold text-ink">{formatNgnFromKobo(active.amountMinor)}</p>
                </div>
                <div className="rounded-xl border border-line bg-bg-2 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-dim">Method</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {active.paymentMethod === "CARD" ? "Card" : "Bank transfer"}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-2 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-dim">Reference</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-mute">{active.clientReference}</p>
                </div>
              </div>

              {active.status === "SUCCESS" ? (
                <div className="rounded-2xl border border-win/30 bg-win/10 p-4">
                  <p className="font-display text-base font-bold text-ink">ARC received</p>
                  <p className="mt-1 text-sm text-mute">
                    <ArcCoin amount={active.arcAmount} signed className="text-sm" /> credited from the server ledger.
                  </p>
                  <Button className="mt-4" onClick={startNew}>
                    Buy more ARC
                  </Button>
                </div>
              ) : null}

              {active.status === "FAILED" || active.status === "EXPIRED" || active.status === "CANCELLED" ? (
                <div>
                  <Button onClick={startNew}>Start a new purchase</Button>
                </div>
              ) : null}

              {(active.status === "PENDING" || active.status === "PROCESSING") &&
              active.paymentMethod === "CARD" ? (
                <div className="space-y-3">
                  {checkoutUrl ? (
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand/25"
                    >
                      Continue to payment
                    </a>
                  ) : (
                    <p className="text-sm text-mute">
                      Waiting for a checkout link from the payment provider.
                    </p>
                  )}
                  <p className="text-xs text-dim">
                    After paying, return here. We never mark an order successful in the browser — tap check
                    status so the server asks the provider.
                  </p>
                  <ExpiryCountdown expiresAt={active.expiresAt} />
                  <Button variant="secondary" loading={checking} onClick={() => void checkStatus()}>
                    Check payment status
                  </Button>
                </div>
              ) : null}

              {(active.status === "PENDING" || active.status === "PROCESSING") &&
              active.paymentMethod === "BANK_TRANSFER" ? (
                <div className="space-y-3">
                  <p className="text-sm text-mute">
                    Transfer the exact amount using Nigerian bank transfer (including bank apps such as OPay).
                    This is processed through Paystack — not a direct OPay integration.
                  </p>
                  {bank ? (
                    <dl className="space-y-2 rounded-2xl border border-line bg-bg-2 p-4">
                      {[
                        ["Bank", bank.bankName],
                        ["Account name", bank.accountName],
                        ["Account number", bank.accountNumber],
                        ["Amount", formatNgnFromKobo(bank.amountMinor)],
                        ["Narration / reference", bank.narration ?? active.clientReference],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-start justify-between gap-3">
                          <dt className="text-xs uppercase tracking-wider text-dim">{k}</dt>
                          <dd className="flex min-w-0 items-center gap-2 text-right text-sm font-semibold text-ink">
                            <span className="break-all">{v}</span>
                            <CopyButton value={String(v)} label={k} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : checkoutUrl ? (
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand/25"
                    >
                      Open bank-transfer checkout
                    </a>
                  ) : (
                    <p className="text-sm text-mute">Payment instructions will appear once the provider responds.</p>
                  )}
                  <ExpiryCountdown expiresAt={active.expiresAt} />
                  <Button loading={checking} onClick={() => void checkStatus()}>
                    I&apos;ve made the transfer
                  </Button>
                  <p className="text-xs text-dim">
                    This only asks the payment provider for status. It does not credit ARC by itself.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      ) : (
        <>
          <section aria-labelledby="buy-arc-heading">
            <h2 id="buy-arc-heading" className="mb-3 font-display text-lg font-bold text-ink">
              Buy ARC
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => {
                const selectedPkg = p.id === packageId;
                const rec = p.id === recommended;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackageId(p.id)}
                    aria-pressed={selectedPkg}
                    className={`card relative p-5 text-left transition hover:border-line-2 ${
                      selectedPkg ? "ring-2 ring-brand-2/70" : ""
                    }`}
                  >
                    {rec ? (
                      <span className="absolute right-3 top-3 rounded-full border border-arc/40 bg-arc/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-arc">
                        Best value
                      </span>
                    ) : null}
                    <p className="font-display text-base font-bold text-ink">{p.name}</p>
                    <p className="mt-2 font-display text-3xl font-black arc-text">{p.totalArc.toLocaleString()}</p>
                    <p className="text-xs text-dim">ARC total</p>
                    {p.bonusArc > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-win">
                        {p.arcAmount.toLocaleString()} + {p.bonusArc.toLocaleString()} bonus
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-dim">{p.arcAmount.toLocaleString()} ARC</p>
                    )}
                    <p className="mt-3 tnum text-lg font-bold text-ink">{formatNgnFromKobo(p.amountMinor)}</p>
                    <p className="mt-1 text-xs text-mute">{p.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="pay-method-heading">
            <h2 id="pay-method-heading" className="mb-3 font-display text-lg font-bold text-ink">
              Payment method
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {LIVE_PAYMENT_METHODS.map((m) => {
                const on = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    aria-pressed={on}
                    className={`card flex items-start gap-3 p-4 text-left transition hover:border-line-2 ${
                      on ? "ring-2 ring-brand-2/70" : ""
                    }`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-xl" aria-hidden>
                      {m === "CARD" ? "💳" : "🏦"}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-ink">
                        {m === "CARD" ? "Debit / Credit Card" : "Bank Transfer"}
                      </span>
                      <span className="mt-0.5 block text-xs text-mute">
                        {m === "CARD"
                          ? "Paystack checkout. We confirm payment on the server."
                          : "Nigerian bank transfer via Paystack, including bank apps such as OPay. Not a direct OPay API."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              className="mt-4"
              size="lg"
              fullWidth
              loading={placing}
              disabled={!selected}
              onClick={() => void placeOrder()}
            >
              {selected
                ? `Buy ${selected.totalArc.toLocaleString()} ARC · ${formatNgnFromKobo(selected.amountMinor)}`
                : "Select a package"}
            </Button>
            <p className="mt-2 text-xs text-dim">
              Price and ARC amounts come from the server. Completing checkout does not credit ARC until
              payment is verified.
            </p>
          </section>
        </>
      )}

      <section aria-labelledby="history-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="history-heading" className="font-display text-lg font-bold text-ink">
            Purchase history
          </h2>
        </div>
        {!orders || orders.rows.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-3xl" aria-hidden>
              👜
            </p>
            <h3 className="mt-3 font-display text-lg font-bold text-ink">No purchases yet</h3>
            <p className="mt-1 text-sm text-mute">Your Buy ARC orders will show up here.</p>
          </Card>
        ) : (
          <Card className="p-5">
            <ul className="divide-y divide-line/60">
              {orders.rows.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      <ArcCoin amount={o.arcAmount} className="text-sm" />
                      <span className="ml-2 text-xs text-dim">{formatNgnFromKobo(o.amountMinor)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-dim">
                      {o.paymentMethod === "CARD" ? "Card" : "Bank transfer"} · {formatDate(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActive(o)}
                      aria-label={`View order ${o.id}`}
                    >
                      View
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {orders.total > orders.rows.length ? (
              <p className="mt-3 text-xs text-dim">Showing latest {orders.rows.length} of {orders.total} orders.</p>
            ) : null}
          </Card>
        )}
      </section>
    </div>
  );
}
