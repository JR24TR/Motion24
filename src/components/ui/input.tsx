import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className = "", ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-xl border bg-bg-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-dim transition focus:outline-none focus:ring-2 focus:ring-brand-2/60 ${
        invalid ? "border-lose/70" : "border-line hover:border-line-2"
      } ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid = false, className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-xl border bg-bg-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-dim transition focus:outline-none focus:ring-2 focus:ring-brand-2/60 ${
        invalid ? "border-lose/70" : "border-line hover:border-line-2"
      } ${className}`}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
