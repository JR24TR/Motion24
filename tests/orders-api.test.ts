import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { run } from "@/server/db/client";
import { registerUser } from "@/server/services/players";
import { uuid, randomToken, sha256, nowIso } from "@/server/lib/util";
import { resetRateLimits } from "@/server/lib/rate-limit";
import { getPackage } from "@/server/payments/packages";
import { SESSION_COOKIE } from "@/server/auth/session";

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

import { GET as getPackages } from "@/app/api/wallet/packages/route";
import { GET as getOrders, POST as postOrder } from "@/app/api/wallet/orders/route";
import { GET as getOrderById } from "@/app/api/wallet/orders/[id]/route";

function jsonRequest(url: string, payload?: unknown, method = "GET", ip = "10.0.0.1") {
  return new NextRequest(`http://local.test${url}`, {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
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
});

describe("wallet package + order HTTP APIs", () => {
  it("rejects unauthenticated access", async () => {
    expect((await getPackages()).status).toBe(401);
    expect((await getOrders(jsonRequest("/api/wallet/orders"))).status).toBe(401);
    expect(
      (await postOrder(jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "CARD" }, "POST")))
        .status
    ).toBe(401);
    expect(
      (
        await getOrderById(jsonRequest("/api/wallet/orders/x"), {
          params: Promise.resolve({ id: "x" }),
        })
      ).status
    ).toBe(401);
  });

  it("lists development packages for an authenticated user", async () => {
    loginAs(freshUser("api_pkg"));
    const res = await getPackages();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packages.length).toBeGreaterThan(0);
    expect(body.packages.every((p: { development: boolean }) => p.development === true)).toBe(true);
  });

  it("creates an order with server-resolved amounts", async () => {
    loginAs(freshUser("api_create"));
    const pkg = getPackage("dev-plus")!;
    const res = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "dev-plus", paymentMethod: "CARD" }, "POST")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.status).toBe("PENDING");
    expect(body.order.amountMinor).toBe(pkg.amountMinor);
    expect(body.order.arcAmount).toBe(pkg.totalArc);
  });

  it("rejects client amount / ARC / success injection (strict body)", async () => {
    loginAs(freshUser("api_inject"));
    const attempts = [
      { packageId: "dev-starter", paymentMethod: "CARD", amount: 1, amountMinor: 1 },
      { packageId: "dev-starter", paymentMethod: "CARD", arcAmount: 9_999_999 },
      { packageId: "dev-starter", paymentMethod: "CARD", balance: 50 },
      { packageId: "dev-starter", paymentMethod: "CARD", success: true },
      { packageId: "dev-starter", paymentMethod: "CARD", credit: 100 },
      { packageId: "dev-starter", paymentMethod: "CARD", reward: 100 },
    ];
    for (const payload of attempts) {
      const res = await postOrder(jsonRequest("/api/wallet/orders", payload, "POST"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toMatch(/VALIDATION|BAD_REQUEST/);
    }
  });

  it("rejects invalid package id and invalid payment method", async () => {
    loginAs(freshUser("api_invalid"));
    const badPkg = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "nope", paymentMethod: "CARD" }, "POST")
    );
    expect(badPkg.status).toBe(400);
    const badPm = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "PAYPAL" }, "POST")
    );
    expect(badPm.status).toBe(400);
  });

  it("enforces ownership on GET /orders/:id", async () => {
    const a = freshUser("api_own_a");
    const b = freshUser("api_own_b");
    loginAs(a);
    const created = await postOrder(
      jsonRequest("/api/wallet/orders", { packageId: "dev-starter", paymentMethod: "CRYPTO" }, "POST")
    );
    const { order } = await created.json();
    loginAs(b);
    const res = await getOrderById(jsonRequest(`/api/wallet/orders/${order.id}`), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(res.status).toBe(403);
    const list = await getOrders(jsonRequest("/api/wallet/orders"));
    const listBody = await list.json();
    expect(listBody.rows.every((r: { id: string }) => r.id !== order.id)).toBe(true);
  });

  it("rate-limits order creation", async () => {
    loginAs(freshUser("api_rl"));
    let lastStatus = 200;
    for (let i = 0; i < 21; i++) {
      const res = await postOrder(
        jsonRequest(
          "/api/wallet/orders",
          { packageId: "dev-starter", paymentMethod: "CARD" },
          "POST",
          "203.0.113.9"
        )
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
