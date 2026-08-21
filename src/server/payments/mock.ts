import { hmacHex, timingSafeEqualString } from "./hmac";
import { isMockPaymentsEnabled } from "./mode";
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

/** Test-only. Never a production default. */
export function mockWebhookSecret(): string | null {
  if (!isMockPaymentsEnabled()) return null;
  const s = (process.env.MOCK_WEBHOOK_SECRET ?? "").trim();
  return s.length > 0 ? s : null;
}

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

export function signMockWebhook(rawBody: string, secret?: string): string {
  const key = secret ?? mockWebhookSecret();
  if (!key) throw new Error("MOCK_WEBHOOK_SECRET is not configured.");
  return hmacHex("sha256", key, rawBody);
}

/**
 * Deterministic test provider. Never talks to a live network.
 * CRYPTO instructions are labeled test-only and are not real wallets.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock";

  async createPayment(input: CreatePaymentInput): Promise<PaymentInitiation> {
    if (!isMockPaymentsEnabled()) {
      throw new Error("Mock payment provider is not available.");
    }
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
    if (!isMockPaymentsEnabled()) {
      return {
        provider: this.id,
        providerReference,
        status: "FAILED",
        amountMinor: null,
        currency: null,
        raw: { error: "mock_disabled" },
      };
    }
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
    const reject = (reason: string): WebhookVerification => ({
      ok: false,
      reason,
      providerReference: null,
      orderId: null,
      success: false,
      status: null,
      amountMinor: null,
      currency: null,
    });

    if (!isMockPaymentsEnabled()) return reject("mock_disabled");
    const secret = mockWebhookSecret();
    if (!secret) return reject("mock_secret_unconfigured");

    const sig = headers["x-mock-signature"] ?? headers["X-Mock-Signature"] ?? null;
    const expected = hmacHex("sha256", secret, rawBody);
    if (!sig || !timingSafeEqualString(sig, expected)) return reject("invalid_signature");

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
