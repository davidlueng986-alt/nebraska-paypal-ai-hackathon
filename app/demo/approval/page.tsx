import type { Metadata } from "next";
import { SimulatedApproval } from "@/components/approval/simulated-approval";
import { DataProvider } from "@/components/lib/data";

export const metadata: Metadata = { title: "Simulated approval" };
export default function Page() {
  return (
    <DataProvider>
      <main id="main">
        <div className="container">
          <SimulatedApproval />
        </div>
      </main>
    </DataProvider>
  );
}
