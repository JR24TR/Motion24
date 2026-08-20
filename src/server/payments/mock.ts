import { hmacHex, timingSafeEqualString } from "./hmac";
import type {
  CreatePaymentInput,
  PaymentInitiation,
  PaymentProvider,
  PaymentStatusResult,
  ProviderPaymentStatus,
  WebhookVerification,
} from "./types";

type MockPayment = {
  reference: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  status: ProviderPaymentStatus;
  paymentMethod: string;
};

const store = new Map<string, MockPayment>();

export const MOCK_WEBHOOK_SECRET = "test-webhook-secret";

export function resetMockPayments(): void {
  store.clear();
}

export function getMockPayment(reference: string): MockPayment | undefined {
  return store.get(reference);
}

export function setMockPaymentStatus(
  reference: string,
  status: ProviderPaymentStatus,
  patch?: Partial<Pick<MockPayment, "amountMinor" | "currency" | "orderId">>
): void {
  const row = store.get(reference);
  if (!row) throw new Error(`Unknown mock payment ${reference}`);
  store.set(reference, { ...row, status, ...patch });
}

export function signMockWebhook(rawBody: string, secret = MOCK_WEBHOOK_SECRET): string {
  return hmacHex("sha256", secret, rawBody);
}

/**
 * Deterministic test provider. Never talks to a live network.
 * CRYPTO instructions are labeled test-only and are not real wallets.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock";

  async createPayment(input: CreatePaymentInput): Promise<PaymentInitiation> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("amountMinor must be a positive integer.");
    }
    const reference = `mock_${input.clientReference}`;
    store.set(reference, {
      reference,
      orderId: input.orderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "PENDING",
      paymentMethod: input.paymentMethod,
    });

    const checkoutUrl = `https://pay.mock.test/checkout/${reference}`;
    const instructions = {
      checkoutUrl,
      bankTransfer:
        input.paymentMethod === "BANK_TRANSFER"
          ? {
              bankName: "Mock Test Bank",
              accountNumber: "0000000000",
              accountName: "ARENA TEST — NOT A REAL ACCOUNT",
              amountMinor: input.amountMinor,
              currency: input.currency,
              narration: input.clientReference,
              expiresAt: null,
            }
          : null,
      crypto:
        input.paymentMethod === "CRYPTO"
          ? {
              asset: "USDT",
              network: "TRC20",
              address: "TTEST_NOT_A_REAL_WALLET",
              amount: "0",
              expiresAt: null,
            }
          : null,
    };

    return {
      provider: this.id,
      providerReference: reference,
      checkoutUrl,
      status: "PENDING",
      instructions,
    };
  }

  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    const row = store.get(providerReference);
    if (!row) {
      return {
        provider: this.id,
        providerReference,
        status: "FAILED",
        amountMinor: null,
        currency: null,
        raw: { error: "unknown_reference" },
      };
    }
    return {
      provider: this.id,
      providerReference: row.reference,
      status: row.status,
      amountMinor: row.amountMinor,
      currency: row.currency,
      raw: { ...row },
    };
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string | null | undefined>,
    rawBody: string
  ): Promise<WebhookVerification> {
    const sig = headers["x-mock-signature"] ?? headers["X-Mock-Signature"] ?? null;
    const expected = signMockWebhook(rawBody);
    if (!sig || !timingSafeEqualString(sig, expected)) {
      return {
        ok: false,
        reason: "invalid_signature",
        providerReference: null,
        orderId: null,
        success: false,
        status: null,
        amountMinor: null,
        currency: null,
      };
    }

    const body = (payload ?? {}) as {
      reference?: string;
      orderId?: string;
      status?: ProviderPaymentStatus;
      amountMinor?: number;
      currency?: string;
    };
    const reference = typeof body.reference === "string" ? body.reference : null;
    const stored = reference ? store.get(reference) : undefined;
    const status = body.status ?? stored?.status ?? "PENDING";
    const amountMinor =
      typeof body.amountMinor === "number" ? body.amountMinor : (stored?.amountMinor ?? null);
    const currency = typeof body.currency === "string" ? body.currency : (stored?.currency ?? null);
    const orderId = typeof body.orderId === "string" ? body.orderId : (stored?.orderId ?? null);

    return {
      ok: true,
      providerReference: reference,
      orderId,
      success: status === "SUCCESS",
      status,
      amountMinor,
      currency,
    };
  }
}

export const mockProvider = new MockPaymentProvider();
