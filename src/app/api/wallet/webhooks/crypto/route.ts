import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/server/lib/errors";
import { ingestWebhook } from "@/server/services/orders";

export async function POST(req: NextRequest) {
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
    "x-nowpayments-sig": req.headers.get("x-nowpayments-sig"),
    "x-crypto-signature": req.headers.get("x-crypto-signature"),
  };
  try {
    const result = await ingestWebhook("crypto", payload, headers, rawBody);
    return NextResponse.json({ ok: true, orderId: result.order?.id ?? null });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    console.error("[crypto-webhook]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Webhook processing failed." } },
      { status: 500 }
    );
  }
}
