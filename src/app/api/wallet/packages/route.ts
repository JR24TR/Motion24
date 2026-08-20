import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listPackages, publicPackage } from "@/server/payments/packages";

export async function GET() {
  return handle(async () => {
    await requireUser();
    return { packages: listPackages().map(publicPackage) };
  });
}
