import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/server/lib/errors";
import { isMockPaymentsEnabled } from "@/server/payments/mode";
import { ingestWebhook } from "@/server/services/orders";

/**
 * Test-adapter webhook. Completely unavailable when NODE_ENV=production.
 * Even in test/dev it can only finalize orders whose stored provider is "mock".
 */
export async function POST(req: NextRequest) {
  if (!isMockPaymentsEnabled()) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }

  const rawBody = await req.text();
  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_JSON", message: "Invalid webhook body." } },
      { status: 400 }
    );
  }
  const headers: Record<string, string | null> = {
    "x-mock-signature": req.headers.get("x-mock-signature"),
  };
  try {
    const result = await ingestWebhook("mock", payload, headers, rawBody);
    return NextResponse.json({ ok: true, orderId: result.order?.id ?? null });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    console.error("[mock-webhook]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Webhook processing failed." } },
      { status: 500 }
    );
  }
}
