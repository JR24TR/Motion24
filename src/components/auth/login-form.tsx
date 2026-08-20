"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { post, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

interface LoginResponse {
  ok: boolean;
  role: "PLAYER" | "ADMIN";
}

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next: { login?: string; password?: string } = {};
    if (!login.trim()) next.login = "Enter your username or email.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await post<LoginResponse>("/api/auth/login", { login, password });
      toast.success(res.role === "ADMIN" ? "Signed in as admin." : "Welcome back!");
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "RATE_LIMITED") {
          setFormError("Too many attempts. Please wait a moment before trying again.");
        } else if (err.code === "SUSPENDED") {
          setFormError(err.message);
        } else {
          setFormError(err.message || "Wrong username or password.");
        }
      } else {
        setFormError("Unable to sign in right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Username or email" htmlFor="login" error={errors.login}>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={login}
          invalid={!!errors.login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="nova"
          disabled={loading}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          invalid={!!errors.password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          disabled={loading}
        />
      </Field>

      <div className="flex items-center justify-between">
        <Link
          href="/forgot-password"
          className="text-xs font-semibold text-brand-2 transition hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      {formError ? (
        <p role="alert" className="rounded-xl border border-lose/40 bg-lose/10 px-3.5 py-2.5 text-sm font-medium text-lose">
          {formError}
        </p>
      ) : null}

      <Button type="submit" loading={loading} fullWidth size="lg">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
