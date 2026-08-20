/**
 * Payment-provider registry.
 *
 * Adapters: Paystack (card / Nigerian bank transfer), unimplemented hosted
 * crypto, and a deterministic mock for tests. Order/ledger code stays
 * provider-agnostic and still credits ARC only via applyCoinChange().
 */

import { mockProvider } from "./mock";
import { paystackProvider } from "./paystack";
import { cryptoProvider } from "./crypto";
import type { PaymentProvider } from "./types";

export type {
  CreatePaymentInput,
  PaymentInitiation,
  PaymentInstructions,
  PaymentProvider,
  PaymentStatusResult,
  ProviderPaymentStatus,
  WebhookVerification,
} from "./types";

const registry = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.id, provider);
}

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return registry.get(id);
}

export function listPaymentProviders(): string[] {
  return [...registry.keys()];
}

registerPaymentProvider(mockProvider);
registerPaymentProvider(paystackProvider);
registerPaymentProvider(cryptoProvider);

/** Checkpoint 6A placeholder — kept so existing tests and registry still resolve. */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly id: string;
  constructor(id = "unconfigured") {
    this.id = id;
  }
  async createPayment(input: import("./types").CreatePaymentInput) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("amountMinor must be a positive integer.");
    }
    return {
      provider: this.id,
      providerReference: null as string | null,
      checkoutUrl: null as string | null,
      status: "PENDING" as const,
      instructions: { checkoutUrl: null, bankTransfer: null, crypto: null },
    };
  }
  async getPaymentStatus(_providerReference: string): Promise<import("./types").PaymentStatusResult> {
    throw new Error("Payment provider is not configured.");
  }
  async verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string | null | undefined>,
    _rawBody?: string
  ): Promise<import("./types").WebhookVerification> {
    throw new Error("Payment provider is not configured.");
  }
}

registerPaymentProvider(new UnconfiguredPaymentProvider());
