import type { PaymentMethod } from "./packages";

export type ProviderPaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "CANCELLED";

export type BankTransferInstructions = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountMinor: number;
  currency: string;
  narration: string | null;
  expiresAt: string | null;
};

export type CryptoInstructions = {
  asset: string;
  network: string;
  address: string;
  /** Provider-quoted amount as a decimal string. Never used as ARC credit. */
  amount: string;
  expiresAt: string | null;
};

export type PaymentInstructions = {
  checkoutUrl: string | null;
  bankTransfer: BankTransferInstructions | null;
  crypto: CryptoInstructions | null;
};

export type PaymentInitiation = {
  provider: string;
  providerReference: string | null;
  checkoutUrl: string | null;
  status: "PENDING";
  instructions: PaymentInstructions;
};

export type PaymentStatusResult = {
  provider: string;
  providerReference: string;
  status: ProviderPaymentStatus;
  amountMinor: number | null;
  currency: string | null;
  raw: Record<string, unknown> | null;
};

export type WebhookVerification = {
  ok: boolean;
  reason?: string;
  providerReference: string | null;
  orderId: string | null;
  success: boolean;
  status: ProviderPaymentStatus | null;
  amountMinor: number | null;
  currency: string | null;
};

export type CreatePaymentInput = {
  orderId: string;
  userId: string;
  email?: string;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;
  clientReference: string;
  callbackUrl?: string;
};

export interface PaymentProvider {
  readonly id: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentInitiation>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  verifyWebhook(
    payload: unknown,
    headers: Record<string, string | null | undefined>,
    rawBody?: string
  ): Promise<WebhookVerification>;
}
