import type { Metadata } from "next";
import { DashboardView } from "@/components/charts/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };
export default function Page() {
  return <DashboardView />;
}
