import type { PaymentMethod } from "./packages";

/**
 * Payment-provider abstraction (Checkpoint 6A).
 *
 * Real providers (Paystack, bank transfer, crypto, …) are NOT implemented
 * here. This registry exists so Checkpoint 6B can register adapters without
 * changing order/ledger code.
 *
 * No SDKs, no credentials, no webhooks, no fake success path.
 */

export type PaymentInitiation = {
  provider: string;
  providerReference: string | null;
  checkoutUrl: string | null;
  status: "PENDING";
};

export type PaymentStatusResult = {
  provider: string;
  providerReference: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "CANCELLED";
  amountMinor: number | null;
  currency: string | null;
  raw: Record<string, unknown> | null;
};

export type WebhookVerification = {
  ok: boolean;
  providerReference: string | null;
  orderId: string | null;
  success: boolean;
};

export type CreatePaymentInput = {
  orderId: string;
  userId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;
  clientReference: string;
};

export interface PaymentProvider {
  readonly id: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentInitiation>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  verifyWebhook(
    payload: unknown,
    headers: Record<string, string | null | undefined>
  ): Promise<WebhookVerification>;
}

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

/**
 * Placeholder adapter. createPayment records that a provider is not wired;
 * status/webhook calls refuse so nothing can be marked paid through this path.
 */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly id: string;
  constructor(id = "unconfigured") {
    this.id = id;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentInitiation> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("amountMinor must be a positive integer.");
    }
    return {
      provider: this.id,
      providerReference: null,
      checkoutUrl: null,
      status: "PENDING",
    };
  }

  async getPaymentStatus(_providerReference: string): Promise<PaymentStatusResult> {
    throw new Error("Payment provider is not configured.");
  }

  async verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string | null | undefined>
  ): Promise<WebhookVerification> {
    throw new Error("Payment provider is not configured.");
  }
}

registerPaymentProvider(new UnconfiguredPaymentProvider());
