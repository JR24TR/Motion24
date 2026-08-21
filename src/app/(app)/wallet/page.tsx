import type { Metadata } from "next";
import { Suspense } from "react";
import { Wallet } from "@/components/wallet/wallet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wallet",
};

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy="true">
          <div className="h-28 animate-pulse rounded-3xl bg-surface/60" />
          <div className="h-40 animate-pulse rounded-3xl bg-surface/60" />
        </div>
      }
    >
      <Wallet />
    </Suspense>
  );
}
