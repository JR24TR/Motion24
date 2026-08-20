import { ERRORS } from "@/server/lib/errors";
import type { PaymentMethod } from "./packages";
import { getPaymentProvider } from "./provider";
import type { PaymentProvider } from "./types";

function useMockProvider(): boolean {
  const forced = (process.env.ARENA_PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "mock") return true;
  if (forced === "paystack" || forced === "crypto") return false;
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

export function resolveProvider(method: PaymentMethod): PaymentProvider {
  if (useMockProvider()) {
    const mock = getPaymentProvider("mock");
    if (!mock) throw ERRORS.BAD_REQUEST("Mock payment provider is not registered.");
    return mock;
  }
  if (method === "CRYPTO") {
    const crypto = getPaymentProvider("crypto");
    if (!crypto) throw ERRORS.BAD_REQUEST("Cryptocurrency payments are not available yet.");
    return crypto;
  }
  const paystack = getPaymentProvider("paystack");
  if (!paystack) throw ERRORS.BAD_REQUEST("Payment provider is not configured.");
  return paystack;
}

export function providerForId(id: string): PaymentProvider {
  if (useMockProvider()) {
    const mock = getPaymentProvider("mock");
    if (mock) return mock;
  }
  const p = getPaymentProvider(id) ?? getPaymentProvider("mock");
  if (!p) throw ERRORS.BAD_REQUEST("Payment provider is not configured.");
  return p;
}

export function publicBaseUrl(): string {
  const raw = (process.env.ARENA_PUBLIC_BASE_URL ?? "http://localhost:3000").trim();
  return raw.replace(/\/$/, "");
}
