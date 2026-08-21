import { get, run, all, withTx } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";
import { ApiError, ERRORS } from "@/server/lib/errors";
import { applyCoinChange } from "./coins";
import { pushNotification } from "./notifications";
import { getPackage, type PaymentMethod } from "@/server/payments/packages";
import { resolveProvider, providerForId, publicBaseUrl } from "@/server/payments/resolve";
import { isMockPaymentsEnabled } from "@/server/payments/mode";
import { getPaymentProvider } from "@/server/payments/provider";
import type { PaymentInstructions, ProviderPaymentStatus } from "@/server/payments/types";

export const ORDER_TTL_MS = 30 * 60 * 1000;

export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type OrderDTO = {
  id: string;
  packageId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  provider: string | null;
  currency: "NGN";
  amountMinor: number;
  arcAmount: number;
  clientReference: string;
  providerReference: string | null;
  ledgerTxId: string | null;
  verifiedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  checkoutUrl: string | null;
  paymentInstructions: PaymentInstructions | null;
};

type OrderRow = {
  id: string;
  user_id: string;
  package_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  provider: string | null;
  currency: string;
  amount_minor: number;
  arc_amount: number;
  provider_reference: string | null;
  client_reference: string;
  provider_meta: string | null;
  ledger_tx_id: string | null;
  verified_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function instructionsFromMeta(raw: string | null): PaymentInstructions | null {
  const meta = parseMeta(raw);
  if (!meta) return null;
  const instructions = meta.instructions as PaymentInstructions | undefined;
  if (instructions && typeof instructions === "object") return instructions;
  return null;
}

function mapOrder(r: OrderRow): OrderDTO {
  const instructions = instructionsFromMeta(r.provider_meta);
  return {
    id: r.id,
    packageId: r.package_id,
    status: r.status,
    paymentMethod: r.payment_method,
    provider: r.provider,
    currency: "NGN",
    amountMinor: r.amount_minor,
    arcAmount: r.arc_amount,
    clientReference: r.client_reference,
    providerReference: r.provider_reference,
    ledgerTxId: r.ledger_tx_id,
    verifiedAt: r.verified_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    checkoutUrl: instructions?.checkoutUrl ?? null,
    paymentInstructions: instructions,
  };
}

function loadOrder(orderId: string): OrderRow | undefined {
  return get<OrderRow>(`SELECT * FROM orders WHERE id = ?`, orderId);
}

function isExpired(row: OrderRow, now = new Date()): boolean {
  return new Date(row.expires_at).getTime() <= now.getTime();
}

export function createOrder(
  userId: string,
  input: { packageId: string; paymentMethod: PaymentMethod }
): OrderDTO {
  const pkg = getPackage(input.packageId);
  if (!pkg) throw ERRORS.BAD_REQUEST("Unknown package.");
  if (!Number.isInteger(pkg.totalArc) || pkg.totalArc <= 0) {
    throw ERRORS.BAD_REQUEST("Invalid package configuration.");
  }
  if (!Number.isInteger(pkg.amountMinor) || pkg.amountMinor <= 0) {
    throw ERRORS.BAD_REQUEST("Invalid package configuration.");
  }

  return withTx(() => {
    const user = get<{ id: string }>(`SELECT id FROM users WHERE id = ?`, userId);
    if (!user) throw ERRORS.NOT_FOUND("account");
    const id = uuid();
    const now = nowIso();
    const expires = new Date(Date.now() + ORDER_TTL_MS).toISOString();
    run(
      `INSERT INTO orders (
         id, user_id, package_id, status, payment_method, provider, currency,
         amount_minor, arc_amount, provider_reference, client_reference, provider_meta,
         ledger_tx_id, verified_at, expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'PENDING', ?, NULL, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?, ?)`,
      id,
      userId,
      pkg.id,
      input.paymentMethod,
      pkg.currency,
      pkg.amountMinor,
      pkg.totalArc,
      uuid(),
      expires,
      now,
      now
    );
    return mapOrder(loadOrder(id)!);
  });
}

export function getOrder(userId: string, orderId: string): OrderDTO {
  const row = loadOrder(orderId);
  if (!row) throw ERRORS.NOT_FOUND("order");
  if (row.user_id !== userId) throw ERRORS.FORBIDDEN();
  return mapOrder(row);
}

export function listUserOrders(
  userId: string,
  opts: { limit?: number; offset?: number } = {}
): { rows: OrderDTO[]; total: number } {
  const limit = Math.min(opts.limit ?? 25, 100);
  const offset = opts.offset ?? 0;
  const total =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders WHERE user_id = ?`, userId)?.n ?? 0;
  const rows = all<OrderRow>(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    userId,
    limit,
    offset
  );
  return { total, rows: rows.map(mapOrder) };
}

export type FinalizeInput = {
  orderId: string;
  providerReference?: string | null;
  provider?: string | null;
  providerMeta?: Record<string, unknown> | null;
};

/**
 * Persist EXPIRED in its own committed transaction.
 * Never throws after the status write — a throw in the same tx would roll it back.
 */
function persistExpiredIfStale(orderId: string): OrderStatus | null {
  return withTx(() => {
    const row = loadOrder(orderId);
    if (!row) return null;
    if (row.status === "EXPIRED") return "EXPIRED";
    if (row.status !== "PENDING" && row.status !== "PROCESSING") return row.status;
    if (!isExpired(row)) return row.status;
    run(
      `UPDATE orders SET status = 'EXPIRED', updated_at = ? WHERE id = ? AND status IN ('PENDING','PROCESSING')`,
      nowIso(),
      row.id
    );
    return "EXPIRED";
  });
}

function providerReferenceTaken(providerReference: string, exceptOrderId: string): boolean {
  const dupe = get<{ id: string }>(
    `SELECT id FROM orders WHERE provider_reference = ? AND id != ?`,
    providerReference,
    exceptOrderId
  );
  return !!dupe;
}

/**
 * Authoritative purchase finalization. NOT exposed over HTTP in 6A.
 *
 * BEGIN IMMEDIATE (via withTx)
 *   guard status (PENDING/PROCESSING only; SUCCESS is idempotent)
 *   applyCoinChange(PURCHASE)  — the only ARC credit path
 *   link ledger_tx_id, mark SUCCESS + verified_at
 * COMMIT
 *
 * Duplicate / concurrent calls never credit twice.
 */
export function finalizeSuccessfulOrder(input: FinalizeInput): OrderDTO {
  const prior = persistExpiredIfStale(input.orderId);
  if (prior === "EXPIRED") {
    throw ERRORS.BAD_REQUEST("This order has expired.");
  }

  return withTx(() => {
    const row = loadOrder(input.orderId);
    if (!row) throw ERRORS.NOT_FOUND("order");

    if (row.status === "SUCCESS") {
      return mapOrder(row);
    }
    if (row.status === "FAILED" || row.status === "CANCELLED") {
      throw ERRORS.BAD_REQUEST("This order cannot be finalized.");
    }
    if (row.status === "EXPIRED") {
      throw ERRORS.BAD_REQUEST("This order has expired.");
    }
    if (isExpired(row)) {
      // Clock raced past persistExpiredIfStale; do not credit. The outer
      // persistExpiredIfStale already committed EXPIRED on the first path;
      // here we refuse without writing so a throw cannot roll back that persist.
      throw ERRORS.BAD_REQUEST("This order has expired.");
    }
    if (row.status !== "PENDING" && row.status !== "PROCESSING") {
      throw ERRORS.BAD_REQUEST("This order cannot be finalized.");
    }

    const now = nowIso();
    const claimed = run(
      `UPDATE orders SET status = 'PROCESSING', updated_at = ? WHERE id = ? AND status IN ('PENDING','PROCESSING')`,
      now,
      row.id
    );
    if (Number(claimed.changes) !== 1) {
      const again = loadOrder(row.id);
      if (again?.status === "SUCCESS") return mapOrder(again);
      throw ERRORS.BAD_REQUEST("This order cannot be finalized.");
    }

    if (input.providerReference && providerReferenceTaken(input.providerReference, row.id)) {
      throw ERRORS.BAD_REQUEST("Duplicate provider reference.");
    }

    const pkg = getPackage(row.package_id);
    const arcAmount = row.arc_amount;
    if (!Number.isInteger(arcAmount) || arcAmount <= 0) {
      throw ERRORS.BAD_REQUEST("Invalid order amount.");
    }
    // Server-side amounts stay on the order row. Package lookup is a
    // consistency check only — the client never supplied these figures.
    if (pkg && (pkg.totalArc !== arcAmount || pkg.amountMinor !== row.amount_minor)) {
      throw ERRORS.BAD_REQUEST("Order package no longer matches catalogue.");
    }

    let txId: string;
    try {
      const credited = applyCoinChange({
        userId: row.user_id,
        amount: arcAmount,
        type: "PURCHASE",
        description: `ARC purchase — ${pkg?.name ?? row.package_id}`,
        orderId: row.id,
        meta: {
          orderId: row.id,
          packageId: row.package_id,
          amountMinor: row.amount_minor,
          currency: row.currency,
        },
      });
      txId = credited.txId;
    } catch (e) {
      if (e instanceof ApiError && e.code === "BAD_REQUEST") {
        const existing = loadOrder(row.id);
        if (existing?.status === "SUCCESS") return mapOrder(existing);
      }
      throw e;
    }

    try {
      run(
        `UPDATE orders SET
           status = 'SUCCESS',
           ledger_tx_id = ?,
           verified_at = ?,
           provider_reference = COALESCE(?, provider_reference),
           provider = COALESCE(?, provider),
           provider_meta = COALESCE(?, provider_meta),
           updated_at = ?
         WHERE id = ?`,
        txId,
        now,
        input.providerReference ?? null,
        input.provider ?? null,
        input.providerMeta ? JSON.stringify(input.providerMeta) : null,
        now,
        row.id
      );
    } catch (e) {
      if (input.providerReference && providerReferenceTaken(input.providerReference, row.id)) {
        throw ERRORS.BAD_REQUEST("Duplicate provider reference.");
      }
      throw e;
    }

    const done = loadOrder(row.id)!;
    pushNotification(
      done.user_id,
      "PURCHASE",
      `+${arcAmount.toLocaleString()} ARC added`,
      "Your purchase was confirmed. ARC has been credited to your wallet."
    );
    return mapOrder(done);
  });
}

function markTerminal(orderId: string, status: "FAILED" | "CANCELLED" | "EXPIRED"): OrderDTO {
  return withTx(() => {
    const row = loadOrder(orderId);
    if (!row) throw ERRORS.NOT_FOUND("order");
    if (row.status === "SUCCESS") return mapOrder(row);
    if (row.status === status) return mapOrder(row);
    if (row.status !== "PENDING" && row.status !== "PROCESSING") return mapOrder(row);
    run(
      `UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN ('PENDING','PROCESSING')`,
      status,
      nowIso(),
      orderId
    );
    return mapOrder(loadOrder(orderId)!);
  });
}

function loadOrderByReference(reference: string): OrderRow | undefined {
  return get<OrderRow>(
    `SELECT * FROM orders WHERE provider_reference = ? OR client_reference = ?`,
    reference,
    reference
  );
}

function attachProvider(
  orderId: string,
  patch: {
    provider: string;
    providerReference: string;
    instructions: PaymentInstructions;
  }
): OrderDTO {
  return withTx(() => {
    const row = loadOrder(orderId);
    if (!row) throw ERRORS.NOT_FOUND("order");
    if (patch.providerReference && providerReferenceTaken(patch.providerReference, orderId)) {
      throw ERRORS.BAD_REQUEST("Duplicate provider reference.");
    }
    const prev = parseMeta(row.provider_meta) ?? {};
    run(
      `UPDATE orders SET provider = ?, provider_reference = ?, provider_meta = ?, updated_at = ?
       WHERE id = ?`,
      patch.provider,
      patch.providerReference,
      JSON.stringify({ ...prev, instructions: patch.instructions }),
      nowIso(),
      orderId
    );
    return mapOrder(loadOrder(orderId)!);
  });
}

export async function createOrderAndInitiate(
  userId: string,
  input: { packageId: string; paymentMethod: PaymentMethod }
): Promise<{ order: OrderDTO; payment: { checkoutUrl: string | null; instructions: PaymentInstructions } }> {
  const order = createOrder(userId, input);
  const user = get<{ email: string }>(`SELECT email FROM users WHERE id = ?`, userId);
  const provider = resolveProvider(input.paymentMethod);
  try {
    const initiated = await provider.createPayment({
      orderId: order.id,
      userId,
      email: user?.email ?? "player@arena.local",
      amountMinor: order.amountMinor,
      currency: order.currency,
      paymentMethod: input.paymentMethod,
      clientReference: order.clientReference,
      callbackUrl: `${publicBaseUrl()}/wallet?order=${order.id}`,
    });
    if (!initiated.providerReference) {
      markTerminal(order.id, "FAILED");
      throw ERRORS.BAD_REQUEST("Payment provider did not return a reference.");
    }
    const updated = attachProvider(order.id, {
      provider: initiated.provider,
      providerReference: initiated.providerReference,
      instructions: initiated.instructions,
    });
    return {
      order: updated,
      payment: { checkoutUrl: initiated.checkoutUrl, instructions: initiated.instructions },
    };
  } catch (err) {
    markTerminal(order.id, "FAILED");
    throw err;
  }
}

function assertMatchesOrder(
  row: OrderRow,
  verified: { amountMinor: number | null; currency: string | null; providerReference: string | null }
) {
  if (verified.providerReference) {
    if (row.provider_reference && row.provider_reference !== verified.providerReference) {
      if (row.client_reference !== verified.providerReference) {
        throw ERRORS.BAD_REQUEST("Provider reference does not match this order.");
      }
    }
  }
  if (verified.amountMinor !== null) {
    if (!Number.isInteger(verified.amountMinor) || verified.amountMinor !== row.amount_minor) {
      throw ERRORS.BAD_REQUEST("Payment amount does not match the order.");
    }
  }
  if (verified.currency !== null) {
    if (verified.currency.toUpperCase() !== row.currency.toUpperCase()) {
      throw ERRORS.BAD_REQUEST("Payment currency does not match the order.");
    }
  }
}

/**
 * Apply a server-side provider status. Amount/currency/reference are checked
 * against the stored order. ARC is credited only via finalizeSuccessfulOrder.
 */
export function applyVerifiedPayment(input: {
  orderId?: string | null;
  providerReference?: string | null;
  amountMinor: number | null;
  currency: string | null;
  status: ProviderPaymentStatus;
  provider?: string | null;
}): OrderDTO {
  const row = input.orderId
    ? loadOrder(input.orderId)
    : input.providerReference
      ? loadOrderByReference(input.providerReference)
      : undefined;
  if (!row) throw ERRORS.NOT_FOUND("order");

  if (row.status === "SUCCESS") return mapOrder(row);

  if (input.provider && row.provider && row.provider !== input.provider) {
    throw ERRORS.BAD_REQUEST("Payment provider does not match this order.");
  }
  if (input.provider === "mock" && row.provider !== "mock") {
    throw ERRORS.BAD_REQUEST("Payment provider does not match this order.");
  }

  assertMatchesOrder(row, {
    amountMinor: input.amountMinor,
    currency: input.currency,
    providerReference: input.providerReference ?? null,
  });

  if (input.status === "SUCCESS") {
    if (input.amountMinor === null || input.currency === null) {
      throw ERRORS.BAD_REQUEST("Successful payment is missing amount or currency.");
    }
    return finalizeSuccessfulOrder({
      orderId: row.id,
      providerReference: input.providerReference ?? row.provider_reference,
      provider: input.provider ?? row.provider,
    });
  }
  if (input.status === "FAILED") return markTerminal(row.id, "FAILED");
  if (input.status === "CANCELLED") return markTerminal(row.id, "CANCELLED");
  if (input.status === "EXPIRED") return markTerminal(row.id, "EXPIRED");
  return mapOrder(row);
}

export async function checkOrderPayment(userId: string, orderId: string): Promise<OrderDTO> {
  const order = getOrder(userId, orderId);
  if (order.status === "SUCCESS" || order.status === "FAILED" || order.status === "CANCELLED") {
    return order;
  }
  persistExpiredIfStale(orderId);
  const latest = loadOrder(orderId);
  if (!latest) throw ERRORS.NOT_FOUND("order");
  if (latest.status === "EXPIRED") {
    throw ERRORS.BAD_REQUEST("This order has expired.");
  }
  if (!latest.provider_reference || !latest.provider) {
    throw ERRORS.BAD_REQUEST("This order has no payment in progress.");
  }
  const provider = providerForId(latest.provider);
  const result = await provider.getPaymentStatus(latest.provider_reference);
  return applyVerifiedPayment({
    orderId: latest.id,
    providerReference: result.providerReference,
    amountMinor: result.amountMinor,
    currency: result.currency,
    status: result.status,
    provider: result.provider,
  });
}

export async function ingestWebhook(
  providerId: string,
  payload: unknown,
  headers: Record<string, string | null | undefined>,
  rawBody: string
): Promise<{ ok: boolean; order?: OrderDTO }> {
  if (providerId === "mock" && !isMockPaymentsEnabled()) {
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  }
  const provider = getPaymentProvider(providerId);
  if (!provider) throw ERRORS.BAD_REQUEST("Unknown payment provider.");
  const verified = await provider.verifyWebhook(payload, headers, rawBody);
  if (!verified.ok) {
    throw new ApiError(401, "INVALID_SIGNATURE", "Invalid webhook signature.");
  }
  if (!verified.providerReference && !verified.orderId) {
    throw ERRORS.BAD_REQUEST("Webhook is missing a payment reference.");
  }
  if (verified.status === "PENDING" || verified.status === null) {
    return { ok: true };
  }
  const order = applyVerifiedPayment({
    orderId: verified.orderId,
    providerReference: verified.providerReference,
    amountMinor: verified.amountMinor,
    currency: verified.currency,
    status: verified.status,
    provider: providerId,
  });
  return { ok: true, order };
}

