/**
 * Server-controlled ARC packages.
 *
 * The client submits ONLY `{ packageId, paymentMethod }`. NGN price (kobo)
 * and ARC amounts are resolved here — never from the request body.
 *
 * These are DEVELOPMENT/TEST packages. They are not connected to a live
 * payment provider. Checkpoint 6B will add real providers.
 */

export type PaymentMethod = "CARD" | "BANK_TRANSFER" | "CRYPTO";

export type ArcPackage = {
  id: string;
  name: string;
  description: string;
  /** Base ARC granted on successful payment. Integer. */
  arcAmount: number;
  /** Bonus ARC included in the same PURCHASE credit. Integer. */
  bonusArc: number;
  /** arcAmount + bonusArc. Integer. */
  totalArc: number;
  /** NGN price in kobo (minor units). Integer. Never a float. */
  amountMinor: number;
  currency: "NGN";
  /** Always true in Checkpoint 6A. */
  development: true;
};

function pkg(p: Omit<ArcPackage, "totalArc" | "currency" | "development">): ArcPackage {
  if (!Number.isInteger(p.arcAmount) || p.arcAmount <= 0) {
    throw new Error(`Invalid package arcAmount for ${p.id}`);
  }
  if (!Number.isInteger(p.bonusArc) || p.bonusArc < 0) {
    throw new Error(`Invalid package bonusArc for ${p.id}`);
  }
  if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) {
    throw new Error(`Invalid package amountMinor for ${p.id}`);
  }
  return {
    ...p,
    totalArc: p.arcAmount + p.bonusArc,
    currency: "NGN",
    development: true,
  };
}

/** Development-only catalogue. Not for live money. */
export const ARC_PACKAGES: readonly ArcPackage[] = [
  pkg({
    id: "dev-starter",
    name: "Starter Pack (dev)",
    description: "Development package — 500 ARC for ₦100. Not a live product.",
    arcAmount: 500,
    bonusArc: 0,
    amountMinor: 10_000, // ₦100.00
  }),
  pkg({
    id: "dev-plus",
    name: "Plus Pack (dev)",
    description: "Development package — 2,500 ARC + 250 bonus for ₦500. Not a live product.",
    arcAmount: 2_500,
    bonusArc: 250,
    amountMinor: 50_000, // ₦500.00
  }),
  pkg({
    id: "dev-pro",
    name: "Pro Pack (dev)",
    description: "Development package — 10,000 ARC + 2,000 bonus for ₦2,000. Not a live product.",
    arcAmount: 10_000,
    bonusArc: 2_000,
    amountMinor: 200_000, // ₦2,000.00
  }),
];

const BY_ID = new Map(ARC_PACKAGES.map((p) => [p.id, p]));

export function listPackages(): readonly ArcPackage[] {
  return ARC_PACKAGES;
}

export function getPackage(id: string): ArcPackage | undefined {
  return BY_ID.get(id);
}

export function publicPackage(p: ArcPackage) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    arcAmount: p.arcAmount,
    bonusArc: p.bonusArc,
    totalArc: p.totalArc,
    amountMinor: p.amountMinor,
    currency: p.currency,
    development: p.development as true,
  };
}
