import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows an inline spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-brand to-brand-2 text-white shadow-lg shadow-brand/25 hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:border-line-2 hover:bg-surface-2",
  ghost: "text-mute hover:bg-surface-2 hover:text-ink",
  danger: "bg-lose/15 text-lose border border-lose/30 hover:bg-lose/25",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-2/70 disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : null}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
