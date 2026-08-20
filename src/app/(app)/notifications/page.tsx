import type { Metadata } from "next";
import { Notifications } from "@/components/notifications/notifications";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications",
};

export default function NotificationsPage() {
  return <Notifications />;
}
