import type { Metadata } from "next";
import { ControlRoom } from "@/components/month-end/control-room";

export const metadata: Metadata = { title: "Month-end run" };
export default function Page() {
  return <ControlRoom />;
}
