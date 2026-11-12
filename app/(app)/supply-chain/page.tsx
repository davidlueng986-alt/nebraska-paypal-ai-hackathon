import type { Metadata } from "next";
import { SupplyChainView } from "@/components/detail/supply-chain-view";

export const metadata: Metadata = { title: "Supply chain" };
export default function Page() {
  return <SupplyChainView />;
}
