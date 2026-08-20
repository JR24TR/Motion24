import { get, run, all, withTx } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";
import { ApiError, ERRORS } from "@/server/lib/errors";
import { applyCoinChange } from "./coins";
import { getPackage, type PaymentMethod } from "@/server/payments/packages";

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

function mapOrder(r: OrderRow): OrderDTO {
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

    return mapOrder(loadOrder(row.id)!);
  });
}

