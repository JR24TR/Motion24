/** Reusable ARC (coin) amount display. */
export function ArcCoin({
  amount,
  showIcon = true,
  signed = false,
  className = "",
}: {
  amount: number;
  showIcon?: boolean;
  /** Prefix + / - based on sign (e.g. "+250 ARC"). */
  signed?: boolean;
  className?: string;
}) {
  const sign =
    signed && amount > 0 ? "+" : signed && amount < 0 ? "−" : "";
  const color =
    signed && amount < 0
      ? "text-lose"
      : signed && amount > 0
        ? "text-win"
        : "text-arc";
  return (
    <span className={`inline-flex items-center gap-1.5 tnum font-bold ${color} ${className}`}>
      {showIcon ? (
        <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-arc to-arc-deep text-[9px] text-black" aria-hidden>
          ¢
        </span>
      ) : null}
      {sign}
      {amount.toLocaleString()}
      <span className="text-[0.8em] opacity-80">ARC</span>
    </span>
  );
}
