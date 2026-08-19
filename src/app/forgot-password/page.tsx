import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-brand-2 transition hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
