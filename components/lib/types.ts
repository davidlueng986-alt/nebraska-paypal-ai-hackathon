import type { payerView, maintainerView } from "@/src/core/views";
import type { Actor } from "@/src/core/auth";
import type { Audit, Batch, Currency } from "@/src/core/model";

type RawPayer = ReturnType<typeof payerView>;
/** Decision values are numeric for c and n (the API types them loosely). */
export type PayerRow = Omit<RawPayer["rows"][number], "c" | "n"> & { c: number; n: number };
export type Payer = Omit<RawPayer, "rows"> & { rows: PayerRow[] };
export type Grant = Payer["grants"][number];
export type Statement = Payer["statements"][number];
export type Maintainer = ReturnType<typeof maintainerView>;
export type Boot = {
  mode: "demo" | "sandbox";
  actor: Pick<Actor, "role" | "id" | "login">;
  orgs: { id: string; name: string; currency: Currency; status: string }[];
  maintainers: { id: string; login: string }[];
  periods: string[];
  packages: { id: string; name: string; ecosystem: string; repoUrl: string }[];
  /** Optional, published by the API when demo-only shortcuts are active. */
  demoOverrides?: Record<string, unknown>;
};
export type Ledger = {
  batches: Batch[];
  audits: Audit[];
  events: number;
  chainHash: string;
  holds: { id: string; maintainerId: string; reason: string; at?: string }[];
  webhooks: { id: string; type: string }[];
};
export type RunEvent = {
  run_id: string;
  seq: number;
  at: string;
  actor: "treasurer" | "decision" | "gate" | "paypal" | "system";
  step: "snapshot" | "decide" | "allocate" | "gate" | "payout" | "webhook" | "statement";
  status: "running" | "ok" | "held" | "rejected";
  invariant?: "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7";
  title: string;
  detail: Record<string, unknown>;
};
