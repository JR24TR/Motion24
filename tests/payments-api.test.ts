import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { run } from "@/server/db/client";
import { registerUser } from "@/server/services/players";
import { getBalance } from "@/server/services/coins";
import { uuid, randomToken, sha256, nowIso } from "@/server/lib/util";
import { resetRateLimits } from "@/server/lib/rate-limit";
import { SESSION_COOKIE } from "@/server/auth/session";
import { resetMockPayments, setMockPaymentStatus, signMockWebhook } from "@/server/payments/mock";
import { hmacHex } from "@/server/payments/hmac";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { token: null as string | null },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.token ? { value: cookieStore.token } : undefined,
    set: () => {},
    delete: () => {},
  }),
}));

import { POST as postOrder } from "@/app/api/wallet/orders/route";
import { POST as checkOrder } from "@/app/api/wallet/orders/[id]/check/route";
import { POST as mockWebhook } from "@/app/api/wallet/webhooks/mock/route";
import { POST as paystackWebhook } from "@/app/api/wallet/webhooks/paystack/route";
import { POST as cryptoWebhook } from "@/app/api/wallet/webhooks/crypto/route";

function jsonRequest(url: string, payload?: unknown, method = "POST", extra: Record<string, string> = {}) {
  return new NextRequest(`http://local.test${url}`, {
    method,
    body: payload === undefined ? undefined : typeof payload === "string" ? payload : JSON.stringify(payload),
    headers: { "content-type": "application/json", ...extra },
  });
}

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

function loginAs(userId: string) {
  const token = randomToken(16);
  run(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    uuid(),
    userId,
    sha256(token),
    new Date(Date.now() + 86400_000).toISOString(),
    nowIso()
  );
  cookieStore.token = token;
}

beforeEach(() => {
  cookieStore.token = null;
  resetRateLimits();
  resetMockPayments();
});

describe("wallet payment HTTP APIs", () => {
  it("rejects unauthenticated check and ignores client success fields on create", async () => {
    const unauth = await checkOrder(jsonRequest("/api/wallet/orders/x/check"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(unauth.status).toBe(401);

    loginAs(freshUser("http_inj"));
    const injected = await postOrder(
      jsonRequest("/api/wallet/orders", {
        packageId: "dev-starter",
        paymentMethod: "CARD",
        amount: 1,
        arcAmount: 999999,
        success: true,
        providerReference: "hack",
      })
    );
    expect(injected.status).toBe(400);
  });

  it("repeated /check after success does not double-credit", async () => {
    const id = freshUser("http_chk");
    loginAs(id);
    const start = getBalance(id);
    const created = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "CARD" })
    );
    const { order } = await created.json();
    setMockPaymentStatus(order.providerReference, "SUCCESS");
    const first = await checkOrder(jsonRequest(`/api/wallet/orders/${order.id}/check`), {
      params: Promise.resolve({ id: order.id }),
    });
    const second = await checkOrder(jsonRequest(`/api/wallet/orders/${order.id}/check`), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(getBalance(id)).toBe(start + 500);
  });

  it("ownership: another user cannot check an order", async () => {
    const a = freshUser("http_own_a");
    const b = freshUser("http_own_b");
    loginAs(a);
    const created = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "CARD" })
    );
    const { order } = await created.json();
    loginAs(b);
    const res = await checkOrder(jsonRequest(`/api/wallet/orders/${order.id}/check`), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(403);
  });

  it("mock webhook with valid HMAC credits once; replay does not", async () => {
    const id = freshUser("http_wh");
    loginAs(id);
    const start = getBalance(id);
    const created = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "CARD" })
    );
    const { order } = await created.json();
    const payload = {
      reference: order.providerReference,
      orderId: order.id,
      status: "SUCCESS",
      amountMinor: order.amountMinor,
      currency: "NGN",
    };
    const raw = JSON.stringify(payload);
    const sig = signMockWebhook(raw);
    const req = () =>
      new NextRequest("http://local.test/api/wallet/webhooks/mock", {
        method: "POST",
        body: raw,
        headers: { "content-type": "application/json", "x-mock-signature": sig },
      });
    expect((await mockWebhook(req())).status).toBe(200);
    expect((await mockWebhook(req())).status).toBe(200);
    expect(getBalance(id)).toBe(start + 500);
  });

  it("Paystack webhook invalid signature is 401", async () => {
    const req = new NextRequest("http://local.test/api/wallet/webhooks/paystack", {
      method: "POST",
      body: JSON.stringify({ event: "charge.success", data: { reference: "x", amount: 1, currency: "NGN" } }),
      headers: { "content-type": "application/json", "x-paystack-signature": "nope" },
    });
    const res = await paystackWebhook(req);
    expect(res.status).toBe(401);
  });

  it("Paystack webhook valid signature + matching order credits once", async () => {
    const prev = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_http_only";
    try {
      const id = freshUser("http_ps");
      loginAs(id);
      const start = getBalance(id);
      const created = await postOrder(
        jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "CARD" })
      );
      const { order } = await created.json();
      const payload = {
        event: "charge.success",
        data: {
          reference: order.providerReference,
          amount: order.amountMinor,
          currency: "NGN",
          status: "success",
          metadata: { order_id: order.id },
        },
      };
      const raw = JSON.stringify(payload);
      const sig = hmacHex("sha512", "sk_test_http_only", raw);
      const req = () =>
        new NextRequest("http://local.test/api/wallet/webhooks/paystack", {
          method: "POST",
          body: raw,
          headers: { "content-type": "application/json", "x-paystack-signature": sig },
        });
      expect((await paystackWebhook(req())).status).toBe(200);
      expect((await paystackWebhook(req())).status).toBe(200);
      expect(getBalance(id)).toBe(start + 500);
    } finally {
      process.env.PAYSTACK_SECRET_KEY = prev;
    }
  });

  it("crypto webhook is rejected while the adapter is unimplemented", async () => {
    const req = new NextRequest("http://local.test/api/wallet/webhooks/crypto", {
      method: "POST",
      body: JSON.stringify({ payment_id: "x" }),
      headers: { "content-type": "application/json", "x-crypto-signature": "x" },
    });
    const res = await cryptoWebhook(req);
    expect(res.status).toBe(401);
  });
});
