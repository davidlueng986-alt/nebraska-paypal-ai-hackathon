import type { Metadata } from "next";
import { StatementView } from "@/components/statements/statement-view";

export const metadata: Metadata = { title: "Statement" };
export default async function Page({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  return <StatementView period={/^\d{4}-\d{2}$/.test(period) ? period : "2026-11"} />;
}
