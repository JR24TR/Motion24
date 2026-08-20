import { ERRORS } from "@/server/lib/errors";
import type {
  CreatePaymentInput,
  PaymentInitiation,
  PaymentProvider,
  PaymentStatusResult,
  WebhookVerification,
} from "./types";

/**
 * Hosted-crypto adapter is NOT implemented in Checkpoint 6B.
 *
 * A live processor (invoice create, status, authenticated webhooks, USDT +
 * explicit network) could not be verified from current provider docs in this
 * environment. Guessing an API would be unsafe (wrong signature scheme,
 * custody mistakes, or unverified networks).
 *
 * CRYPTO orders in tests use the mock provider. Live CRYPTO creation is refused.
 * No private keys, seed phrases, or wallet custody exist in this codebase.
 */
export class UnimplementedCryptoProvider implements PaymentProvider {
  readonly id = "crypto";

  async createPayment(_input: CreatePaymentInput): Promise<PaymentInitiation> {
    throw ERRORS.BAD_REQUEST("Cryptocurrency payments are not available yet.");
  }

  async getPaymentStatus(_providerReference: string): Promise<PaymentStatusResult> {
    throw ERRORS.BAD_REQUEST("Cryptocurrency payments are not available yet.");
  }

  async verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string | null | undefined>,
    _rawBody: string
  ): Promise<WebhookVerification> {
    return {
      ok: false,
      reason: "crypto_provider_unimplemented",
      providerReference: null,
      orderId: null,
      success: false,
      status: null,
      amountMinor: null,
      currency: null,
    };
  }
}

export const cryptoProvider = new UnimplementedCryptoProvider();
