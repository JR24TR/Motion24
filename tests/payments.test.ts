import { describe, it, expect, beforeEach } from "vitest";
import { get, all, run } from "@/server/db/client";
import { registerUser } from "@/server/services/players";
import { getBalance } from "@/server/services/coins";
import {
  createOrder,
  createOrderAndInitiate,
  checkOrderPayment,
  ingestWebhook,
  finalizeSuccessfulOrder,
  getOrder,
} from "@/server/services/orders";
import { getPackage } from "@/server/payments/packages";
import {
  resetMockPayments,
  setMockPaymentStatus,
  signMockWebhook,
} from "@/server/payments/mock";
import { verifyPaystackSignature } from "@/server/payments/paystack";
import { hmacHex } from "@/server/payments/hmac";
import { ApiError } from "@/server/lib/errors";

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

beforeEach(() => resetMockPayments());

describe("mock provider lifecycle", () => {
  it("PENDING → SUCCESS credits ARC exactly once via applyCoinChange", async () => {
    const id = freshUser("pay_ok");
    const start = getBalance(id);
    const pkg = getPackage("dev-starter")!;
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    expect(order.status).toBe("PENDING");
    expect(order.amountMinor).toBe(pkg.amountMinor);
    expect(getBalance(id)).toBe(start);

    setMockPaymentStatus(order.providerReference!, "SUCCESS");
    const paid = await checkOrderPayment(id, order.id);
    expect(paid.status).toBe("SUCCESS");
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    const purchases = all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id);
    expect(purchases).toHaveLength(1);

    const again = await checkOrderPayment(id, order.id);
    expect(again.status).toBe("SUCCESS");
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    expect(
      all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id)
    ).toHaveLength(1);
  });

  it("PENDING → FAILED credits 0 ARC", async () => {
    const id = freshUser("pay_fail");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-plus",
      paymentMethod: "BANK_TRANSFER",
    });
    setMockPaymentStatus(order.providerReference!, "FAILED");
    const done = await checkOrderPayment(id, order.id);
    expect(done.status).toBe("FAILED");
    expect(getBalance(id)).toBe(start);
    expect(all(`SELECT id FROM transactions WHERE order_id = ?`, order.id)).toHaveLength(0);
  });

  it("PENDING → EXPIRED credits 0 ARC", async () => {
    const id = freshUser("pay_exp");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    setMockPaymentStatus(order.providerReference!, "EXPIRED");
    const done = await checkOrderPayment(id, order.id);
    expect(done.status).toBe("EXPIRED");
    expect(getBalance(id)).toBe(start);
  });

  it("PENDING → CANCELLED credits 0 ARC", async () => {
    const id = freshUser("pay_can");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    setMockPaymentStatus(order.providerReference!, "CANCELLED");
    const done = await checkOrderPayment(id, order.id);
    expect(done.status).toBe("CANCELLED");
    expect(getBalance(id)).toBe(start);
  });

  it("bank transfer returns instructions and does not credit until verified", async () => {
    const id = freshUser("pay_bank");
    const { order, payment } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "BANK_TRANSFER",
    });
    expect(payment.instructions.bankTransfer?.accountNumber).toBeTruthy();
    expect(order.status).toBe("PENDING");
    expect(getBalance(id)).toBe(1000);
  });

  it("mock CRYPTO returns labeled test USDT/TRC20 instructions without crediting", async () => {
    const id = freshUser("pay_crypto");
    const { order, payment } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CRYPTO",
    });
    expect(payment.instructions.crypto?.asset).toBe("USDT");
    expect(payment.instructions.crypto?.network).toBe("TRC20");
    expect(payment.instructions.crypto?.address).toMatch(/TEST/i);
    expect(order.status).toBe("PENDING");
    expect(getBalance(id)).toBe(1000);
  });
});

describe("webhook security", () => {
  function mockWebhook(body: object) {
    const raw = JSON.stringify(body);
    return { raw, sig: signMockWebhook(raw), payload: body };
  }

  it("invalid signature is rejected and credits nothing", async () => {
    const id = freshUser("wh_bad");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    await expect(
      ingestWebhook(
        "mock",
        { reference: order.providerReference, status: "SUCCESS", amountMinor: order.amountMinor, currency: "NGN" },
        { "x-mock-signature": "deadbeef" },
        JSON.stringify({ reference: order.providerReference })
      )
    ).rejects.toThrow(ApiError);
    expect(getBalance(id)).toBe(start);
    expect(getOrder(id, order.id).status).toBe("PENDING");
  });

  it("valid signature + wrong amount is rejected", async () => {
    const id = freshUser("wh_amt");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    const { raw, sig, payload } = mockWebhook({
      reference: order.providerReference,
      status: "SUCCESS",
      amountMinor: 1,
      currency: "NGN",
    });
    await expect(ingestWebhook("mock", payload, { "x-mock-signature": sig }, raw)).rejects.toThrow(
      /amount/i
    );
    expect(getBalance(id)).toBe(start);
  });

  it("valid signature + wrong currency is rejected", async () => {
    const id = freshUser("wh_cur");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    const { raw, sig, payload } = mockWebhook({
      reference: order.providerReference,
      status: "SUCCESS",
      amountMinor: order.amountMinor,
      currency: "USD",
    });
    await expect(ingestWebhook("mock", payload, { "x-mock-signature": sig }, raw)).rejects.toThrow(
      /currency/i
    );
    expect(getBalance(id)).toBe(start);
  });

  it("valid signature + wrong reference is rejected", async () => {
    const id = freshUser("wh_ref");
    const start = getBalance(id);
    await createOrderAndInitiate(id, { packageId: "dev-starter", paymentMethod: "CARD" });
    const { raw, sig, payload } = mockWebhook({
      reference: "mock_does_not_exist",
      status: "SUCCESS",
      amountMinor: 10_000,
      currency: "NGN",
    });
    await expect(ingestWebhook("mock", payload, { "x-mock-signature": sig }, raw)).rejects.toThrow();
    expect(getBalance(id)).toBe(start);
  });

  it("duplicate webhook does not credit twice", async () => {
    const id = freshUser("wh_dupe");
    const start = getBalance(id);
    const pkg = getPackage("dev-starter")!;
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    const { raw, sig, payload } = mockWebhook({
      reference: order.providerReference,
      orderId: order.id,
      status: "SUCCESS",
      amountMinor: order.amountMinor,
      currency: "NGN",
    });
    await ingestWebhook("mock", payload, { "x-mock-signature": sig }, raw);
    await ingestWebhook("mock", payload, { "x-mock-signature": sig }, raw);
    expect(getBalance(id)).toBe(start + pkg.totalArc);
    expect(
      all(`SELECT id FROM transactions WHERE order_id = ? AND type = 'PURCHASE'`, order.id)
    ).toHaveLength(1);
  });

  it("Paystack HMAC-SHA512 rejects tampered bodies", () => {
    const prev = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_only";
    try {
      const raw = JSON.stringify({ event: "charge.success", data: { reference: "r1", amount: 100 } });
      const sig = hmacHex("sha512", "sk_test_unit_only", raw);
      expect(verifyPaystackSignature(raw, sig)).toBe(true);
      expect(verifyPaystackSignature(raw + "x", sig)).toBe(false);
      expect(verifyPaystackSignature(raw, "00")).toBe(false);
    } finally {
      process.env.PAYSTACK_SECRET_KEY = prev;
    }
  });
});

describe("authorization / injection", () => {
  it("client cannot mark SUCCESS or credit via finalize from another user", async () => {
    const a = freshUser("inj_a");
    const b = freshUser("inj_b");
    const { order } = await createOrderAndInitiate(a, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    expect(() => getOrder(b, order.id)).toThrow(ApiError);
    await expect(checkOrderPayment(b, order.id)).rejects.toThrow(ApiError);
  });

  it("createOrder still ignores client amounts — server package wins", async () => {
    const id = freshUser("inj_pkg");
    const pkg = getPackage("dev-pro")!;
    const order = createOrder(id, { packageId: "dev-pro", paymentMethod: "CARD" });
    expect(order.amountMinor).toBe(pkg.amountMinor);
    expect(order.arcAmount).toBe(pkg.totalArc);
  });

  it("provider failure during finalization leaves no partial credit", async () => {
    const id = freshUser("inj_rb");
    const start = getBalance(id);
    const { order } = await createOrderAndInitiate(id, {
      packageId: "dev-starter",
      paymentMethod: "CARD",
    });
    setMockPaymentStatus(order.providerReference!, "SUCCESS");
    run(`DELETE FROM profiles WHERE user_id = ?`, id);
    await expect(checkOrderPayment(id, order.id)).rejects.toThrow();
    expect(
      get<{ status: string }>(`SELECT status FROM orders WHERE id = ?`, order.id)!.status
    ).not.toBe("SUCCESS");
    expect(all(`SELECT id FROM transactions WHERE order_id = ?`, order.id)).toHaveLength(0);
    run(
      `INSERT INTO profiles (user_id, avatar, bio, xp, balance, games_played, games_won, lifetime_earned, lifetime_spent, created_at, updated_at)
       VALUES (?, '🎮', '', 0, ?, 0, 0, 0, 0, datetime('now'), datetime('now'))`,
      id,
      start
    );
    expect(getBalance(id)).toBe(start);
  });
});

describe("paystack signature helper export", () => {
  it("does not treat empty secret as valid", () => {
    const prev = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    try {
      expect(verifyPaystackSignature("{}", "abc")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PAYSTACK_SECRET_KEY;
      else process.env.PAYSTACK_SECRET_KEY = prev;
    }
  });
});
