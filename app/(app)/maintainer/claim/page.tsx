import type { Metadata } from "next";
import { ClaimView } from "@/components/maintainer/claim-view";

export const metadata: Metadata = { title: "Claim a package" };
export default function Page() {
  return <ClaimView />;
}
