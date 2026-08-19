import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "./lib/errors";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data as object, { status: init ?? 200 });
}

/** Wraps a handler with uniform, safe error mapping. */
export function handle<T>(fn: () => Promise<T> | T) {
  return Promise.resolve()
    .then(fn)
    .then((data) => NextResponse.json(data ?? { ok: true }))
    .catch((err: unknown) => {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.status }
        );
      }
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        return NextResponse.json(
          { error: { code: "VALIDATION", message: issue?.message ?? "Invalid input." } },
          { status: 400 }
        );
      }
      console.error("[api]", err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
        { status: 500 }
      );
    });
}

export async function body<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "BAD_JSON", "Invalid request body.");
  }
  return schema.parse(raw);
}

export function searchParam(req: NextRequest, key: string): string | undefined {
  return req.nextUrl.searchParams.get(key) ?? undefined;
}
