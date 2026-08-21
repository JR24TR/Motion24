import { ERRORS } from "@/server/lib/errors";
import type { PaymentMethod } from "./packages";
import { getPaymentProvider } from "./provider";
import type { PaymentProvider } from "./types";
import { isMockPaymentsEnabled } from "./mode";

export { isMockPaymentsEnabled };

export function resolveProvider(method: PaymentMethod): PaymentProvider {
  if (isMockPaymentsEnabled()) {
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
  if (id === "mock" && !isMockPaymentsEnabled()) {
    throw ERRORS.BAD_REQUEST("Unknown payment provider.");
  }
  const p = getPaymentProvider(id);
  if (!p) throw ERRORS.BAD_REQUEST("Unknown payment provider.");
  return p;
}

export function publicBaseUrl(): string {
  const raw = (process.env.ARENA_PUBLIC_BASE_URL ?? "http://localhost:3000").trim();
  return raw.replace(/\/$/, "");
}
