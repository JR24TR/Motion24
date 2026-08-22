import { NextResponse } from "next/server";

/**
 * Liveness probe for hosts such as Render.
 * Intentionally does not open SQLite or touch payment code.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
