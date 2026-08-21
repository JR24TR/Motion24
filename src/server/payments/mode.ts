/**
 * Mock payments are test/dev only. Production (`NODE_ENV=production`) never
 * enables the mock adapter, even if ARENA_PAYMENT_PROVIDER=mock is set.
 */
export function isMockPaymentsEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const forced = (process.env.ARENA_PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "mock") return true;
  if (forced === "paystack" || forced === "crypto") return false;
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}
