"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { post, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

interface RegisterResponse {
  ok: boolean;
  userId: string;
}

type Errors = Partial<Record<"username" | "displayName" | "email" | "password" | "confirmPassword" | "inviteCode", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
    inviteCode: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!form.username.trim()) next.username = "Choose a username.";
    else if (form.username.length < 3 || form.username.length > 20)
      next.username = "Username must be 3–20 characters.";
    else if (!/^[a-zA-Z0-9_]+$/.test(form.username))
      next.username = "Letters, numbers and underscores only.";

    if (!form.displayName.trim()) next.displayName = "Enter a display name.";
    else if (form.displayName.length < 2 || form.displayName.length > 24)
      next.displayName = "Display name must be 2–24 characters.";

    if (!form.email.trim()) next.email = "Enter your email.";
    else if (!EMAIL_RE.test(form.email)) next.email = "Enter a valid email address.";

    if (!form.password) next.password = "Choose a password.";
    else if (form.password.length < 8) next.password = "At least 8 characters.";
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      next.password = "Needs at least one letter and one number.";

    if (form.confirmPassword !== form.password)
      next.confirmPassword = "Passwords don't match.";

    if (form.inviteCode.trim() && form.inviteCode.trim().length > 24)
      next.inviteCode = "Invite code is too long.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await post<RegisterResponse>("/api/auth/register", {
        username: form.username,
        displayName: form.displayName,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword,
        inviteCode: form.inviteCode.trim(),
      });
      toast.success("Account created — welcome to the Arena!");
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "RATE_LIMITED") {
          setFormError("Too many sign-ups from this connection. Please wait a moment.");
        } else if (err.code === "USERNAME_TAKEN" || err.code === "EMAIL_TAKEN") {
          setFormError(err.message);
        } else {
          setFormError(err.message || "Could not create your account.");
        }
      } else {
        setFormError("Unable to create your account right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Username" htmlFor="username" error={errors.username} hint="3–20 characters, letters/numbers/underscores.">
        <Input
          id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={form.username} invalid={!!errors.username}
          onChange={(e) => set("username", e.target.value)} placeholder="nova" disabled={loading}
        />
      </Field>
      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <Input
          id="displayName" name="displayName" autoComplete="name"
          value={form.displayName} invalid={!!errors.displayName}
          onChange={(e) => set("displayName", e.target.value)} placeholder="Nova" disabled={loading}
        />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input
          id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={form.email} invalid={!!errors.email}
          onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" disabled={loading}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number.">
        <Input
          id="password" name="password" type="password" autoComplete="new-password"
          value={form.password} invalid={!!errors.password}
          onChange={(e) => set("password", e.target.value)} placeholder="••••••••" disabled={loading}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <Input
          id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
          value={form.confirmPassword} invalid={!!errors.confirmPassword}
          onChange={(e) => set("confirmPassword", e.target.value)} placeholder="••••••••" disabled={loading}
        />
      </Field>
      <Field label="Invite code (optional)" htmlFor="inviteCode" error={errors.inviteCode} hint="Got an invite from a friend? Enter it here.">
        <Input
          id="inviteCode" name="inviteCode" autoCapitalize="characters" spellCheck={false}
          value={form.inviteCode} invalid={!!errors.inviteCode}
          onChange={(e) => set("inviteCode", e.target.value)} placeholder="e.g. NOVA24" disabled={loading}
        />
      </Field>

      {formError ? (
        <p role="alert" className="rounded-xl border border-lose/40 bg-lose/10 px-3.5 py-2.5 text-sm font-medium text-lose">
          {formError}
        </p>
      ) : null}

      <Button type="submit" loading={loading} fullWidth size="lg">
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
