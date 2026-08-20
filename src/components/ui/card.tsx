import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ hover = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`card ${hover ? "transition hover:border-line-2 hover:shadow-lg hover:shadow-black/30" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-dim">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
