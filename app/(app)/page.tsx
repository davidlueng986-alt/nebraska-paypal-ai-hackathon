import type { Metadata } from "next";
import { MonthView } from "@/components/ledger/month-view";

export const metadata: Metadata = { title: "Month" };
export default function Page() {
  return <MonthView />;
}
