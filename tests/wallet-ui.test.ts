import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === SESSION_COOKIE ? undefined : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

import {
  formatNgnFromKobo,
  isLivePaymentMethod,
  LIVE_PAYMENT_METHODS,
  recommendedPackageId,
  walletErrorMessage,
  ORDER_STATUS_COPY,
} from "@/lib/wallet-helpers";
import { ApiClientError } from "@/lib/api";
import { GET as getPackages } from "@/app/api/wallet/packages/route";
import { POST as postOrder } from "@/app/api/wallet/orders/route";
import { createOrderSchema } from "@/server/lib/validation";
import type { WalletPackage } from "@/lib/account-types";

describe("wallet helpers", () => {
  it("formats NGN from integer kobo without floats", () => {
    expect(formatNgnFromKobo(10_000)).toBe("₦100.00");
    expect(formatNgnFromKobo(50_000)).toBe("₦500.00");
    expect(formatNgnFromKobo(200_000)).toBe("₦2,000.00");
    expect(formatNgnFromKobo(101)).toBe("₦1.01");
  });

  it("does not treat CRYPTO as a live payment method", () => {
    expect(LIVE_PAYMENT_METHODS).toEqual(["CARD", "BANK_TRANSFER"]);
    expect(isLivePaymentMethod("CRYPTO")).toBe(false);
    expect(isLivePaymentMethod("CARD")).toBe(true);
    expect(isLivePaymentMethod("BANK_TRANSFER")).toBe(true);
  });

  it("picks the highest-total bonus package as recommended", () => {
    const packages: WalletPackage[] = [
      {
        id: "a",
        name: "A",
        description: "",
        arcAmount: 500,
        bonusArc: 0,
        totalArc: 500,
        amountMinor: 10000,
        currency: "NGN",
      },
      {
        id: "b",
        name: "B",
        description: "",
        arcAmount: 2500,
        bonusArc: 250,
        totalArc: 2750,
        amountMinor: 50000,
        currency: "NGN",
      },
      {
        id: "c",
        name: "C",
        description: "",
        arcAmount: 10000,
        bonusArc: 2000,
        totalArc: 12000,
        amountMinor: 200000,
        currency: "NGN",
      },
    ];
    expect(recommendedPackageId(packages)).toBe("c");
  });

  it("maps order statuses without relying on color alone", () => {
    expect(ORDER_STATUS_COPY.SUCCESS.label).toMatch(/successful/i);
    expect(ORDER_STATUS_COPY.FAILED.label).toMatch(/failed/i);
    expect(ORDER_STATUS_COPY.EXPIRED.label).toMatch(/expired/i);
    expect(ORDER_STATUS_COPY.PENDING.label).toMatch(/waiting/i);
  });

  it("maps API errors to safe user messages", () => {
    expect(walletErrorMessage(new ApiClientError(429, "RATE_LIMITED", "slow"))).toMatch(/too many/i);
    expect(walletErrorMessage(new ApiClientError(500, "INTERNAL", "boom"))).toMatch(/temporarily unavailable/i);
    expect(walletErrorMessage(new ApiClientError(400, "BAD_REQUEST", "Unknown package."))).toBe(
      "Unknown package."
    );
  });

  it("order schema rejects client-controlled amounts", () => {
    expect(() =>
      createOrderSchema.parse({ packageId: "dev-starter", paymentMethod: "CARD", arcAmount: 9999 })
    ).toThrow();
    expect(createOrderSchema.parse({ packageId: "dev-starter", paymentMethod: "CARD" })).toEqual({
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
  });
});

describe("wallet APIs for UI", () => {
  it("rejects unauthenticated package and order access", async () => {
    expect((await getPackages()).status).toBe(401);
    const req = new NextRequest("http://local.test/api/wallet/orders", {
      method: "POST",
      body: JSON.stringify({ packageId: "dev-starter", paymentMethod: "CARD" }),
      headers: { "content-type": "application/json" },
    });
    expect((await postOrder(req)).status).toBe(401);
  });
});
