type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  sm: "h-7 w-7 rounded-lg text-sm",
  md: "h-9 w-9 rounded-xl text-lg",
  lg: "h-12 w-12 rounded-xl text-2xl",
  xl: "h-16 w-16 rounded-2xl text-3xl",
};

export function Avatar({
  avatar,
  name,
  size = "md",
  className = "",
}: {
  avatar?: string | null;
  name?: string | null;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      title={name ?? undefined}
      role="img"
      aria-label={name ? `${name}'s avatar` : "Avatar"}
      className={`grid shrink-0 place-items-center border border-line bg-surface-2 ${SIZES[size]} ${className}`}
    >
      {avatar || "🎮"}
    </span>
  );
}
