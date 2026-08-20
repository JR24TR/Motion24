import crypto from "node:crypto";

/** Constant-time hex/string compare. Different lengths are not equal. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function hmacHex(alg: "sha256" | "sha512", secret: string, raw: string): string {
  return crypto.createHmac(alg, secret).update(raw, "utf8").digest("hex");
}
