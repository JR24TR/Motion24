import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return <Dashboard />;
}
