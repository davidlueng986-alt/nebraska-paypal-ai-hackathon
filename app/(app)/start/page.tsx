import type { Metadata } from "next";
import { StartView } from "@/components/start/start-view";

export const metadata: Metadata = { title: "Setup" };
export default function Page() {
  return <StartView />;
}
