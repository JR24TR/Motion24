import type { Metadata } from "next";
import { Earn } from "@/components/earn/earn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earn ARC",
};

export default function EarnPage() {
  return <Earn />;
}
