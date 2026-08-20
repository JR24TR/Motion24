import { describe, it, expect } from "vitest";
import { get, all, run } from "@/server/db/client";
import { registerUser } from "@/server/services/players";
import { applyCoinChange, getBalance } from "@/server/services/coins";
import {
  createOrder,
  getOrder,
  listUserOrders,
  finalizeSuccessfulOrder,
} from "@/server/services/orders";
import { getPackage, listPackages } from "@/server/payments/packages";
import { ApiError } from "@/server/lib/errors";
import {
  getPaymentProvider,
  listPaymentProviders,
  UnconfiguredPaymentProvider,
} from "@/server/payments/provider";

function freshUser(name: string) {
  const n = `${name}_${Math.random().toString(36).slice(2, 8)}`;
  const { userId } = registerUser({
    username: n,
    displayName: n,
    email: `${n}@t.local`,
    password: "passw0rd1",
  });
  return userId;
}

describe("ARC packages (server-controlled)", () => {
  it("exposes development packages with integer NGN kobo and integer ARC", () => {
    const pkgs = listPackages();
    expect(pkgs.length).toBeGreaterThan(0);
    for (const p of pkgs) {
      expect(p.development).toBe(true);
      expect(p.currency).toBe("NGN");
      expect(Number.isInteger(p.arcAmount)).toBe(true);
      expect(Number.isInteger(p.bonusArc)).toBe(true);
      expect(Number.isInteger(p.totalArc)).toBe(true);
      expect(Number.isInteger(p.amountMinor)).toBe(true);
      expect(p.totalArc).toBe(p.arcAmount + p.bonusArc);
      expect(p.amountMinor).toBeGreaterThan(0);
    }
  });
});

describe("order creation", () => {
  it("creates a PENDING order using server-resolved price and ARC", () => {
    const id = freshUser("ord_create");
    const pkg = getPackage("dev-plus")!;
    const order = createOrder(id, { packageId: "dev-plus", paymentMethod: "CARD" });
    expect(order.status).toBe("PENDING");
    expect(order.packageId).toBe("dev-plus");
    expect(order.amountMinor).toBe(pkg.amountMinor);
    expect(order.arcAmount).toBe(pkg.totalArc);
    expect(order.currency).toBe("NGN");
    expect(order.ledgerTxId).toBeNull();
    expect(order.providerReference).toBeNull();
    expect(getBalance(id)).toBe(1000); // welcome grant only — not credited yet
  });

  it("rejects unknown packages", () => {
    const id = freshUser("ord_badpkg");
    expect(() =>
      createOrder(id, { packageId: "not-a-real-pack", paymentMethod: "CARD" })
    ).toThrowError(/unknown package/i);
  });

  it("rejects invalid payment methods at the type boundary via sqlite check if forced", () => {
    const id = freshUser("ord_badpm");
    expect(() =>
      createOrder(id, { packageId: "dev-starter", paymentMethod: "PAYPAL" as "CARD" })
    ).toThrow();
  });
});

describe("order access / ownership", () => {
  it("owner can read their order; another user cannot", () => {
    const a = freshUser("ord_own_a");
    const b = freshUser("ord_own_b");
    const order = createOrder(a, { packageId: "dev-starter", paymentMethod: "CRYPTO" });
    expect(getOrder(a, order.id).id).toBe(order.id);
    expect(() => getOrder(b, order.id)).toThrow(ApiError);
    try {
      getOrder(b, order.id);
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(403);
    }
    expect(listUserOrders(b).rows).toHaveLength(0);
    expect(listUserOrders(a).rows.map((o) => o.id)).toContain(order.id);
  });

  it("missing order is 404", () => {
    const id = freshUser("ord_404");
    expect(() => getOrder(id, "00000000-0000-4000-8000-000000000000")).toThrowError(/order/i);
  });
});

describe("purchase finalization", () => {
  it("credits ARC once through applyCoinChange and writes a PURCHASE ledger row", () => {
    const id = freshUser("ord_ok");
    const start = getBalance(id);
    const pkg = getPackage("dev-starter")!;
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "BANK_TRANSFER" });
    const done = finalizeSuccessfulOrder({ orderId: order.id, providerReference: "dev-ref-1" });
    expect(done.status).toBe("SUCCESS");
    expect(done.ledgerTxId).toBeTruthy();
    expect(done.verifiedAt).toBeTruthy();
    expect(done.providerReference).toBe("dev-ref-1");
    expect(getBalance(id)).toBe(start + pkg.totalArc);

    const txs = all<{ type: string; amount: number; order_id: string }>(
      `SELECT type, amount, order_id FROM transactions WHERE user_id = ? AND type = 'PURCHASE'`,
      id
    );
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ type: "PURCHASE", amount: pkg.totalArc, order_id: order.id });
  });

  it("duplicate finalization is idempotent — balance increases exactly once", () => {
    const id = freshUser("ord_dupe");
    const start = getBalance(id);
    const pkg = getPackage("dev-plus")!;
    const order = createOrder(id, { packageId: "dev-plus", paymentMethod: "CARD" });
    const a = finalizeSuccessfulOrder({ orderId: order.id });
    const b = finalizeSuccessfulOrder({ orderId: order.id });
    expect(a.status).toBe("SUCCESS");
    expect(b.status).toBe("SUCCESS");
    expect(b.ledgerTxId).toBe(a.ledgerTxId);
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    const purchases = all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id);
    expect(purchases).toHaveLength(1);
  });

  it("concurrent finalization never double-credits", async () => {
    const id = freshUser("ord_race");
    const start = getBalance(id);
    const pkg = getPackage("dev-pro")!;
    const order = createOrder(id, { packageId: "dev-pro", paymentMethod: "CARD" });
    const results = await Promise.all([
      Promise.resolve().then(() => finalizeSuccessfulOrder({ orderId: order.id })),
      Promise.resolve().then(() => finalizeSuccessfulOrder({ orderId: order.id })),
    ]);
    expect(results.every((r) => r.status === "SUCCESS")).toBe(true);
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    expect(
      all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id)
    ).toHaveLength(1);
  });

  it("failed finalization rolls back — order stays PENDING and no ledger row", () => {
    const id = freshUser("ord_rb");
    const start = getBalance(id);
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    run(`DELETE FROM profiles WHERE user_id = ?`, id);
    expect(() => finalizeSuccessfulOrder({ orderId: order.id })).toThrow();
    const row = get<{ status: string; ledger_tx_id: string | null }>(
      `SELECT status, ledger_tx_id FROM orders WHERE id = ?`,
      order.id
    );
    expect(row).toMatchObject({ status: "PENDING", ledger_tx_id: null });
    expect(
      all(`SELECT id FROM transactions WHERE order_id = ?`, order.id)
    ).toHaveLength(0);
    run(
      `INSERT INTO profiles (user_id, avatar, bio, xp, balance, games_played, games_won, lifetime_earned, lifetime_spent, created_at, updated_at)
       VALUES (?, '🎮', '', 0, ?, 0, 0, 0, 0, datetime('now'), datetime('now'))`,
      id,
      start
    );
    expect(getBalance(id)).toBe(start);
  });

  it("expired orders cannot finalize", () => {
    const id = freshUser("ord_exp");
    const start = getBalance(id);
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    run(`UPDATE orders SET expires_at = ? WHERE id = ?`, "2000-01-01T00:00:00.000Z", order.id);
    expect(() => finalizeSuccessfulOrder({ orderId: order.id })).toThrowError(/expired/i);
    expect(getBalance(id)).toBe(start);
    expect(get<{ status: string }>(`SELECT status FROM orders WHERE id = ?`, order.id)!.status).toBe(
      "EXPIRED"
    );
  });

  it("failed orders cannot finalize", () => {
    const id = freshUser("ord_fail");
    const start = getBalance(id);
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    run(`UPDATE orders SET status = 'FAILED' WHERE id = ?`, order.id);
    expect(() => finalizeSuccessfulOrder({ orderId: order.id })).toThrowError(/cannot be finalized/i);
    expect(getBalance(id)).toBe(start);
  });

  it("cancelled orders cannot finalize", () => {
    const id = freshUser("ord_cancel");
    const start = getBalance(id);
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    run(`UPDATE orders SET status = 'CANCELLED' WHERE id = ?`, order.id);
    expect(() => finalizeSuccessfulOrder({ orderId: order.id })).toThrowError(/cannot be finalized/i);
    expect(getBalance(id)).toBe(start);
  });

  it("database forbids a second PURCHASE ledger row for the same order", () => {
    const id = freshUser("ord_uniq");
    const start = getBalance(id);
    const pkg = getPackage("dev-starter")!;
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    finalizeSuccessfulOrder({ orderId: order.id });
    expect(() =>
      applyCoinChange({
        userId: id,
        amount: 1,
        type: "PURCHASE",
        description: "sneaky double credit",
        orderId: order.id,
      })
    ).toThrow(ApiError);
    try {
      applyCoinChange({
        userId: id,
        amount: 1,
        type: "PURCHASE",
        description: "sneaky double credit",
        orderId: order.id,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("BAD_REQUEST");
      expect((e as ApiError).message).toMatch(/already been credited/i);
    }
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    expect(all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id)).toHaveLength(
      1
    );
  });

  it("unique index remains the last safety net against two PURCHASE rows", () => {
    const id = freshUser("ord_idx");
    const start = getBalance(id);
    const pkg = getPackage("dev-starter")!;
    const order = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    finalizeSuccessfulOrder({ orderId: order.id });
    expect(() =>
      run(
        `INSERT INTO transactions
          (id, user_id, amount, type, description, balance_after, game_session_id, order_id, day_key, meta, created_at)
         VALUES (?, ?, 1, 'PURCHASE', 'raw duplicate', ?, NULL, ?, NULL, NULL, ?)`,
        `${order.id}-dup`,
        id,
        start + pkg.totalArc + 1,
        order.id,
        new Date().toISOString()
      )
    ).toThrow();
    expect(all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id)).toHaveLength(
      1
    );
    expect(getBalance(id)).toBe(start + pkg.totalArc);
  });

  it("duplicate provider_reference is rejected and does not credit the second order", () => {
    const id = freshUser("ord_pref");
    const start = getBalance(id);
    const a = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    const b = createOrder(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    finalizeSuccessfulOrder({ orderId: a.id, providerReference: "same-ref-xyz" });
    expect(() =>
      finalizeSuccessfulOrder({ orderId: b.id, providerReference: "same-ref-xyz" })
    ).toThrowError(/duplicate provider/i);
    const pkg = getPackage("dev-starter")!;
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    expect(get<{ status: string }>(`SELECT status FROM orders WHERE id = ?`, b.id)!.status).toBe(
      "PENDING"
    );
  });
});

describe("payment provider abstraction", () => {
  it("registers an unconfigured provider and refuses status/webhook (no fake success)", async () => {
    expect(listPaymentProviders()).toContain("unconfigured");
    const p = getPaymentProvider("unconfigured")!;
    const initiated = await p.createPayment({
      orderId: "o",
      userId: "u",
      amountMinor: 1000,
      currency: "NGN",
      paymentMethod: "CARD",
      clientReference: "c",
    });
    expect(initiated.status).toBe("PENDING");
    expect(initiated.checkoutUrl).toBeNull();
    await expect(p.getPaymentStatus("x")).rejects.toThrow(/not configured/i);
    await expect(p.verifyWebhook({}, {})).rejects.toThrow(/not configured/i);
    const extra = new UnconfiguredPaymentProvider("also-unconfigured");
    await expect(extra.getPaymentStatus("x")).rejects.toThrow(/not configured/i);
  });
});
