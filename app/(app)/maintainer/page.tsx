import type { Metadata } from "next";
import { IncomeView } from "@/components/maintainer/income-view";

export const metadata: Metadata = { title: "Maintainer income" };
export default function Page() {
  return <IncomeView />;
}
