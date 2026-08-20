"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { MeResponse, DashboardResponse } from "@/lib/account-types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const AVATARS = ["🎮", "🦊", "🐉", "🦅", "🐺", "🦁", "🐍", "🦈", "🤖", "👾", "👑", "🛸", "⚡", "🔥", "🌟", "💎"];

export function ProfileEdit() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("🎮");
  const [bio, setBio] = useState("");
  const [errors, setErrors] = useState<{ displayName?: string; bio?: string }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, dash] = await Promise.all([
          api<MeResponse>("/api/auth/me"),
          api<DashboardResponse>("/api/player/dashboard"),
        ]);
        if (cancelled) return;
        setDisplayName(me.user.displayName);
        setAvatar(me.user.avatar || "🎮");
        setBio(dash.profile.bio ?? "");
      } catch (err) {
        if (!cancelled) {
          if (isUnauthorized(err)) {
            redirectToLogin();
            return;
          }
          setLoadError(err instanceof ApiClientError ? err.message : "Could not load your profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const next: { displayName?: string; bio?: string } = {};
    if (displayName.trim().length < 2 || displayName.trim().length > 24) {
      next.displayName = "Display name must be 2–24 characters.";
    }
    if (bio.length > 160) {
      next.bio = "Bio must be at most 160 characters.";
    }
    setErrors(next);
    if (next.displayName || next.bio) return;

    setSaving(true);
    try {
      await api<{ ok: boolean }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: displayName.trim(), avatar, bio: bio.trim() }),
      });
      toast.success("Profile updated");
      router.push("/profile");
      router.refresh();
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-64 animate-pulse rounded-3xl bg-surface/60" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load your profile</h2>
        <p className="mt-1 text-sm text-mute">{loadError}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Try again</Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Edit profile</h1>
          <p className="mt-0.5 text-sm text-mute">Update your public identity.</p>
        </div>
        <Link href="/profile" className="text-sm font-semibold text-mute transition hover:text-ink">
          ← Back
        </Link>
      </header>

      <Card className="p-6">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Display name" htmlFor="displayName" error={errors.displayName} hint="2–24 characters. Shown to other players.">
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              invalid={!!errors.displayName}
              onChange={(e) => { setDisplayName(e.target.value); setErrors((s) => ({ ...s, displayName: undefined })); }}
              placeholder="Your name"
              disabled={saving}
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-semibold text-mute">Avatar</legend>
            <div className="mt-2 grid grid-cols-8 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={`Choose avatar ${a}`}
                  aria-pressed={avatar === a}
                  onClick={() => setAvatar(a)}
                  disabled={saving}
                  className={`grid h-10 w-10 place-items-center rounded-xl border text-xl transition ${
                    avatar === a
                      ? "border-brand-2 bg-brand/20 ring-2 ring-brand-2/50"
                      : "border-line bg-surface-2 hover:border-line-2"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </fieldset>

          <Field label="Bio" htmlFor="bio" error={errors.bio} hint={`${bio.length}/160 characters.`}>
            <Textarea
              id="bio"
              name="bio"
              rows={3}
              value={bio}
              invalid={!!errors.bio}
              onChange={(e) => { setBio(e.target.value); setErrors((s) => ({ ...s, bio: undefined })); }}
              placeholder="Tell the arena about yourself…"
              disabled={saving}
            />
          </Field>

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={saving} fullWidth size="lg">
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Link href="/profile" className="w-full">
              <Button type="button" variant="secondary" size="lg" fullWidth>
                Cancel
              </Button>
            </Link>
          </div>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-dim">
          You can only edit your display name, avatar and bio. ARC balance, XP, role and account
          ID are managed by the platform and cannot be changed from here.
        </p>
      </Card>
    </div>
  );
}
