import type { Metadata } from "next";
import { Transactions } from "@/components/transactions/transactions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transactions",
};

export default function TransactionsPage() {
  return <Transactions />;
}
