import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}

/** Label + control + hint/error block. For use inside client form components. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-mute">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs leading-relaxed text-dim">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-lose">
          {error}
        </p>
      ) : null}
    </div>
  );
}
