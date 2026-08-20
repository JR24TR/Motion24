import { ERRORS } from "@/server/lib/errors";
import { hmacHex, timingSafeEqualString } from "./hmac";
import type {
  CreatePaymentInput,
  PaymentInitiation,
  PaymentInstructions,
  PaymentProvider,
  PaymentStatusResult,
  ProviderPaymentStatus,
  WebhookVerification,
} from "./types";

const PAYSTACK_API = "https://api.paystack.co";

function paystackSecret(): string {
  return (process.env.PAYSTACK_SECRET_KEY ?? "").trim();
}

/** Paystack signs webhooks with the API secret key (no separate webhook secret). */
export function paystackWebhookKey(): string {
  return paystackSecret();
}

export function verifyPaystackSignature(rawBody: string, signature: string | null | undefined): boolean {
  const secret = paystackWebhookKey();
  if (!secret || !signature) return false;
  const expected = hmacHex("sha512", secret, rawBody);
  return timingSafeEqualString(expected, signature);
}

function mapPaystackStatus(status: string | undefined): ProviderPaymentStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "success") return "SUCCESS";
  if (s === "failed" || s === "reversed") return "FAILED";
  if (s === "abandoned") return "CANCELLED";
  return "PENDING";
}

async function paystackRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const key = paystackSecret();
  if (!key) throw ERRORS.BAD_REQUEST("Payment provider is not configured.");
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw ERRORS.BAD_REQUEST("Payment provider returned an invalid response.");
  }
  if (!res.ok || json.status !== true) {
    throw ERRORS.BAD_REQUEST("Payment provider request failed.");
  }
  return json;
}

function instructionsFromInitialize(
  input: CreatePaymentInput,
  data: Record<string, unknown>
): PaymentInstructions {
  const checkoutUrl = typeof data.authorization_url === "string" ? data.authorization_url : null;
  const accountNumber =
    typeof data.account_number === "string"
      ? data.account_number
      : typeof (data.account as { account_number?: string } | undefined)?.account_number === "string"
        ? (data.account as { account_number: string }).account_number
        : null;
  const bankName =
    typeof data.bank === "string"
      ? data.bank
      : typeof (data.account as { bank?: string } | undefined)?.bank === "string"
        ? (data.account as { bank: string }).bank
        : null;
  const accountName =
    typeof data.account_name === "string"
      ? data.account_name
      : typeof (data.account as { account_name?: string } | undefined)?.account_name === "string"
        ? (data.account as { account_name: string }).account_name
        : null;

  return {
    checkoutUrl,
    bankTransfer:
      input.paymentMethod === "BANK_TRANSFER" && accountNumber && bankName
        ? {
            bankName,
            accountNumber,
            accountName: accountName ?? "ARENA",
            amountMinor: input.amountMinor,
            currency: input.currency,
            narration: input.clientReference,
            expiresAt: typeof data.expires_at === "string" ? data.expires_at : null,
          }
        : null,
    crypto: null,
  };
}

/**
 * Paystack adapter for CARD and Nigerian BANK_TRANSFER (including transfers
 * from apps such as OPay into the Paystack-issued account — not a direct OPay API).
 */
export class PaystackPaymentProvider implements PaymentProvider {
  readonly id = "paystack";

  async createPayment(input: CreatePaymentInput): Promise<PaymentInitiation> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw ERRORS.BAD_REQUEST("Invalid payment amount.");
    }
    if (!input.email) throw ERRORS.BAD_REQUEST("Payment email is required.");
    const channels = input.paymentMethod === "BANK_TRANSFER" ? ["bank_transfer"] : ["card"];
    const json = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.clientReference,
        callback_url: input.callbackUrl ?? undefined,
        channels,
        metadata: {
          order_id: input.orderId,
          user_id: input.userId,
        },
      }),
    });
    const data = (json.data ?? {}) as Record<string, unknown>;
    const reference = typeof data.reference === "string" ? data.reference : input.clientReference;
    const instructions = instructionsFromInitialize(input, data);
    return {
      provider: this.id,
      providerReference: reference,
      checkoutUrl: instructions.checkoutUrl,
      status: "PENDING",
      instructions,
    };
  }

  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    const json = await paystackRequest(`/transaction/verify/${encodeURIComponent(providerReference)}`);
    const data = (json.data ?? {}) as Record<string, unknown>;
    const amountMinor = typeof data.amount === "number" && Number.isInteger(data.amount) ? data.amount : null;
    const currency = typeof data.currency === "string" ? data.currency : null;
    const reference = typeof data.reference === "string" ? data.reference : providerReference;
    return {
      provider: this.id,
      providerReference: reference,
      status: mapPaystackStatus(typeof data.status === "string" ? data.status : undefined),
      amountMinor,
      currency,
      raw: { status: data.status, amount: data.amount, currency: data.currency, reference },
    };
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string | null | undefined>,
    rawBody: string
  ): Promise<WebhookVerification> {
    const signature = headers["x-paystack-signature"] ?? headers["X-Paystack-Signature"] ?? null;
    if (!verifyPaystackSignature(rawBody, signature)) {
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
      event?: string;
      data?: {
        reference?: string;
        amount?: number;
        currency?: string;
        status?: string;
        metadata?: { order_id?: string };
      };
    };
    const data = body.data ?? {};
    const status = mapPaystackStatus(data.status ?? (body.event === "charge.success" ? "success" : undefined));
    const amountMinor = typeof data.amount === "number" && Number.isInteger(data.amount) ? data.amount : null;
    const currency = typeof data.currency === "string" ? data.currency : null;
    const reference = typeof data.reference === "string" ? data.reference : null;
    const orderId = typeof data.metadata?.order_id === "string" ? data.metadata.order_id : null;

    return {
      ok: true,
      providerReference: reference,
      orderId,
      success: body.event === "charge.success" || status === "SUCCESS",
      status,
      amountMinor,
      currency,
    };
  }
}

export const paystackProvider = new PaystackPaymentProvider();
