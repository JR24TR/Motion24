import { ApiClientError } from "@/lib/api";
import type { OrderStatus, WalletPackage, WalletPaymentMethod } from "@/lib/account-types";

/** Live methods the 6C UI may offer. CRYPTO is unimplemented on the backend. */
export const LIVE_PAYMENT_METHODS = ["CARD", "BANK_TRANSFER"] as const;

export function isLivePaymentMethod(m: string): m is "CARD" | "BANK_TRANSFER" {
  return m === "CARD" || m === "BANK_TRANSFER";
}

/** Integer kobo → ₦ display. Never uses floats for the conversion. */
export function formatNgnFromKobo(amountMinor: number): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const naira = Math.trunc(abs / 100);
  const kobo = abs % 100;
  return `${negative ? "−" : ""}₦${naira.toLocaleString()}.${String(kobo).padStart(2, "0")}`;
}

export function recommendedPackageId(packages: readonly WalletPackage[]): string | null {
  if (packages.length === 0) return null;
  const withBonus = packages.filter((p) => p.bonusArc > 0);
  const pool = withBonus.length > 0 ? withBonus : [...packages];
  return pool.reduce((best, p) => (p.totalArc > best.totalArc ? p : best)).id;
}

export const ORDER_STATUS_COPY: Record<
  OrderStatus,
  { label: string; hint: string; tone: "pending" | "ok" | "bad" | "warn" }
> = {
  PENDING: {
    label: "Waiting for payment",
    hint: "Complete payment with the provider. We only confirm success from the server.",
    tone: "pending",
  },
  PROCESSING: {
    label: "Verifying payment",
    hint: "The provider is still confirming this payment. You can refresh the status.",
    tone: "pending",
  },
  SUCCESS: {
    label: "Payment successful",
    hint: "ARC has been credited to your wallet.",
    tone: "ok",
  },
  FAILED: {
    label: "Payment failed",
    hint: "The provider did not confirm this payment. You can start a new purchase.",
    tone: "bad",
  },
  EXPIRED: {
    label: "Payment window expired",
    hint: "This order can no longer be paid. Start a new purchase.",
    tone: "warn",
  },
  CANCELLED: {
    label: "Cancelled",
    hint: "This order was cancelled. Start a new purchase if you still want ARC.",
    tone: "warn",
  },
};

export function walletErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiClientError) {
    if (err.status === 429) return "Too many attempts. Please wait a moment and try again.";
    if (err.status === 403) return "You don't have access to that.";
    if (err.status === 404) return "We couldn't find that order.";
    if (err.status >= 500) return "Payment service is temporarily unavailable. Try again shortly.";
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
