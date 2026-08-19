import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <AuthShell
      title="Join the Arena"
      subtitle="Create an account, claim your welcome grant and start playing."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-2 transition hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
