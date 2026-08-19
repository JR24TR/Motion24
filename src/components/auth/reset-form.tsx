"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { post, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: typeof errors = {};
    if (!password) next.password = "Choose a new password.";
    else if (password.length < 8) next.password = "At least 8 characters.";
    else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
      next.password = "Needs at least one letter and one number.";
    if (confirmPassword !== password) next.confirmPassword = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await post("/api/auth/reset-password", { token, password, confirmPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "TOKEN_INVALID") setFormError(err.message);
        else setFormError(err.message || "Could not reset your password.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="rounded-xl border border-win/40 bg-win/10 p-4 text-sm leading-relaxed text-ink">
          <p className="font-bold text-win">Password updated</p>
          <p className="mt-1 text-mute">
            Your password has been changed. All other sessions were signed out.
          </p>
        </div>
        <Button onClick={() => router.push("/login")} fullWidth size="lg">
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number.">
        <Input
          id="password" name="password" type="password" autoComplete="new-password"
          value={password} invalid={!!errors.password}
          onChange={(e) => { setPassword(e.target.value); setErrors((s) => ({ ...s, password: undefined })); }}
          placeholder="••••••••" disabled={loading}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <Input
          id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
          value={confirmPassword} invalid={!!errors.confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setErrors((s) => ({ ...s, confirmPassword: undefined })); }}
          placeholder="••••••••" disabled={loading}
        />
      </Field>
      {formError ? (
        <p role="alert" className="rounded-xl border border-lose/40 bg-lose/10 px-3.5 py-2.5 text-sm font-medium text-lose">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={loading} fullWidth size="lg">
        {loading ? "Updating…" : "Reset password"}
      </Button>
    </form>
  );
}
