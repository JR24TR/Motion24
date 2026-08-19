import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");

  const { token } = await searchParams;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Enter your new password below. All other sessions will be signed out."
      footer={
        <>
          <Link href="/login" className="font-semibold text-brand-2 transition hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p role="alert" className="rounded-xl border border-lose/40 bg-lose/10 px-3.5 py-2.5 text-sm font-medium text-lose">
          This reset link is missing its token. Request a new one.
        </p>
      )}
    </AuthShell>
  );
}
