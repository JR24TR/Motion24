/** Compact level chip rendered from backend level info. */
export function LevelBadge({
  level,
  className = "",
}: {
  level: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-xp/30 bg-xp/10 px-2 py-0.5 text-[11px] font-bold text-xp ${className}`}
      title={`Level ${level}`}
    >
      <span aria-hidden>⚡</span>
      Lv {level}
    </span>
  );
}
