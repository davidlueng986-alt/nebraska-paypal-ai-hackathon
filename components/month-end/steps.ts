import type { RunEvent } from "../lib/types";

export const INVARIANTS: { id: NonNullable<RunEvent["invariant"]>; name: string }[] = [
  { id: "I1", name: "Pay only verified, unheld recipients" },
  { id: "I2", name: "Spend only money PayPal confirmed" },
  { id: "I3", name: "No package above max(25%, 2/K) of the budget" },
  { id: "I4", name: "One payout batch per month, never twice" },
  { id: "I5", name: "AI may answer only catalog questions" },
  { id: "I6", name: "Grants need a human approval on PayPal" },
  { id: "I7", name: "Every amount can be recomputed" },
];

export type StepId = "snapshot" | "decide" | "allocate" | "gate" | "payout" | "statement";
export const STEPS: { id: StepId; name: string }[] = [
  { id: "snapshot", name: "Read usage" },
  { id: "decide", name: "Treasurer decisions" },
  { id: "allocate", name: "Allocate the budget" },
  { id: "gate", name: "Gate checks I1–I7" },
  { id: "payout", name: "Pay with PayPal Payouts" },
  { id: "statement", name: "Write statements" },
];
export const stepOf = (e: RunEvent): StepId => (e.step === "webhook" ? "payout" : e.step);
export const isTerminal = (e: RunEvent) => e.actor === "system" && /run (complete|failed)/i.test(e.title);

/** Pause after each event at speed 1, so a viewer can follow cause and effect. */
export function dwell(e: RunEvent) {
  if (e.step === "decide") return e.status === "rejected" || e.status === "held" ? 2200 : 700;
  if (e.step === "gate") return 550;
  if (e.step === "webhook") return 900;
  if (isTerminal(e)) return 0;
  return 1600;
}
