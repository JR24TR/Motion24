"use client";

import { useState, type FormEvent } from "react";
import { post, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

interface ForgotResponse {
  ok: boolean;
  resetUrl?: string;
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ email: string; resetUrl?: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await post<ForgotResponse>("/api/auth/forgot-password", { email: trimmed });
      setSent({ email: trimmed, resetUrl: res.resetUrl });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "RATE_LIMITED") {
        setError("Too many requests. Please wait a moment and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="rounded-xl border border-win/40 bg-win/10 p-4 text-sm leading-relaxed text-ink">
          <p className="font-bold text-win">Request received</p>
          <p className="mt-1 text-mute">
            If an account exists for <span className="tnum font-semibold text-ink">{sent.email}</span>,
            a password reset link will be sent to it. It expires in 60 minutes.
          </p>
          {sent.resetUrl ? (
            <p className="mt-3 rounded-lg border border-line bg-bg-2 p-3 text-xs">
              <span className="font-semibold text-dim">Dev reset link (for local testing):</span>{" "}
              <a href={sent.resetUrl} className="text-brand-2 underline">
                {sent.resetUrl}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label="Email"
        htmlFor="email"
        error={error}
        hint="We'll send you a link to reset your password."
      >
        <Input
          id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={email} invalid={!!error}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="you@example.com" disabled={loading}
        />
      </Field>
      <Button type="submit" loading={loading} fullWidth size="lg">
        {loading ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
