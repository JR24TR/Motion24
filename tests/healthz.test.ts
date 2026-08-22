import { describe, it, expect } from "vitest";
import { GET } from "@/app/healthz/route";

describe("GET /healthz", () => {
  it("returns HTTP 200 without requiring auth or payments", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
