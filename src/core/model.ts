import { z } from "zod";
export const currencies = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof currencies)[number];
export const currencySchema = z.enum(currencies);
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const moneySchema = z.number().int().nonnegative().max(100_000_000);
export const ecosystemSchema = z.enum(["npm", "pypi", "cargo", "go"]);
export type Ecosystem = z.infer<typeof ecosystemSchema>;
export const usageSchema = z
  .object({
    event_id: z.string().min(1).max(100),
    org_id: z.string(),
    repo_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    period: periodSchema,
    package: z
      .object({
        ecosystem: ecosystemSchema,
        name: z.string().min(1).max(200),
        version: z.string().min(1).max(100),
      })
      .strict(),
    signal: z.enum([
      "lockfile_diff",
      "import_graph",
      "sbom",
      "agent_hook",
      "mcp",
    ]),
    depth: z.number().int().min(0).max(40),
    agent: z.string().max(80),
    session_id: z.string().min(1).max(100),
    observed_at: z.string().datetime(),
  })
  .strict();
export type Usage = z.infer<typeof usageSchema> & { id: string };
export type Org = {
  id: string;
  name: string;
  currency: Currency;
  budgetCents: number;
  subscriptionId?: string;
  status: "pending" | "active" | "cancelled" | "payment_failed";
  publicName: boolean;
  owner: string;
};
export type Signals = {
  dependents: number;
  maintainers: number;
  fundingUsd: number;
  fundingKnown?: boolean;
  maintainerCountKnown?: boolean;
  backlog: number;
  corporate: boolean;
  infrastructure: boolean;
  scorecard: number | null;
  accountAgeDays: number;
  recentChange: boolean;
  readme?: string;
  fundingLinks: string[];
  vulnerabilities: { id: string; summary: string; modified: string }[];
};
export type Package = {
  id: string;
  ecosystem: Ecosystem;
  name: string;
  version: string;
  repoUrl: string;
  signals: Signals;
  metadataAt: string;
};
export type Maintainer = {
  id: string;
  login: string;
  email: string;
  verifiedAt: string;
  emailChangedAt: string;
  hostId?: string;
  hostAuthorizedAt?: string;
};
export type Claim = {
  id: string;
  packageId: string;
  maintainerId: string;
  share: number;
  permission: "admin" | "maintain";
  claimedAt: string;
};
export type Receipt = {
  id: string;
  orgId: string;
  period: string;
  currency: Currency;
  cents: number;
  providerId: string;
  kind: "subscription" | "recycle";
  receivedAt: string;
};
export const questions = [
  "criticality",
  "need",
  "payee_risk",
  "grant_case",
  "payout_exception",
] as const;
export type Question = (typeof questions)[number];
export type Decision = {
  id: string;
  period: string;
  subject: string;
  question: Question;
  value: number | string;
  confidence: number;
  modelVersion: string;
  inputHash: string;
  accepted: boolean;
  reason: string;
  fallback: boolean;
};
export type Allocation = {
  packageId: string;
  u: number;
  c: number;
  n: number;
  w: number;
  cents: number;
};
export type Close = {
  id: string;
  period: string;
  orgId: string;
  currency: Currency;
  budgetCents: number;
  allocations: Allocation[];
  usageSnapshot: Usage[];
  decisions: Decision[];
  paramsVersion: string;
  snapshotHash: string;
  at: string;
  ai: boolean;
};
export type Credit = {
  id: string;
  orgId: string;
  packageId: string;
  maintainerId?: string;
  period: string;
  currency: Currency;
  cents: number;
  source: "allocation" | "grant";
  sourceId: string;
  status: "available" | "reserved" | "paid" | "recycled" | "split";
  batchId?: string;
  at: string;
};
export type Hold = {
  id: string;
  maintainerId: string;
  reason: string;
  decisionId?: string;
  at: string;
  releasedAt?: string;
};
export type Grant = {
  id: string;
  orgId: string;
  packageId: string;
  currency: Currency;
  cents: number;
  decisionId: string;
  orderId?: string;
  approveUrl?: string;
  status:
    | "proposed"
    | "creating"
    | "approval_pending"
    | "approved"
    | "captured"
    | "declined";
  captureId?: string;
  createdAt: string;
  period: string;
  reason: string;
};
export type PayoutItem = {
  id: string;
  maintainerId: string;
  receiver: string;
  currency: Currency;
  cents: number;
  creditIds: string[];
  providerItemId?: string;
  status:
    | "PENDING"
    | "SUCCESS"
    | "UNCLAIMED"
    | "RETURNED"
    | "FAILED"
    | "BLOCKED"
    | "HELD"
    | "CANCELED";
  exceptionDecision?: string;
};
export type Batch = {
  id: string;
  period: string;
  status: "prepared" | "submitted" | "complete" | "denied";
  providerBatchId?: string;
  items: PayoutItem[];
  payloadHash: string;
  createdAt: string;
  lastError?: string;
};
export type Statement = {
  id: string;
  ownerType: "org" | "maintainer";
  ownerId: string;
  period: string;
  body: string;
  recomputeHash: string;
  closeIds: string[];
  createdAt: string;
};
export type Audit = {
  id: string;
  action: string;
  inputsHash: string;
  checks: { id: string; passed: boolean; reason: string }[];
  result: "allow" | "deny" | "info";
  at: string;
};
export type Host = {
  id: string;
  name: string;
  repoUrl: string;
  email: string;
  verifiedAt: string;
  changedAt: string;
  verifiedBy: string;
};
export type SubscriptionRequest = {
  id: string;
  orgId: string;
  quantity: number;
  currency: Currency;
  providerId: string;
  approveUrl: string;
  status: "pending" | "activated" | "cancelled";
  at: string;
};
export type Webhook = {
  id: string;
  type: string;
  at: string;
  resourceId: string;
};
export type State = {
  orgs: Org[];
  packages: Package[];
  maintainers: Maintainer[];
  claims: Claim[];
  receipts: Receipt[];
  usages: Usage[];
  decisions: Decision[];
  closes: Close[];
  credits: Credit[];
  holds: Hold[];
  grants: Grant[];
  batches: Batch[];
  statements: Statement[];
  audits: Audit[];
  hosts: Host[];
  subscriptions: SubscriptionRequest[];
  webhooks: Webhook[];
};
export type Collection = keyof State;
export type Row<K extends Collection> = State[K][number];
export type Event = {
  seq: number;
  id: string;
  collection: Collection;
  data: State[Collection][number];
  at: string;
  prevHash: string;
  hash: string;
};
export function emptyState(): State {
  return {
    orgs: [],
    packages: [],
    maintainers: [],
    claims: [],
    receipts: [],
    usages: [],
    decisions: [],
    closes: [],
    credits: [],
    holds: [],
    grants: [],
    batches: [],
    statements: [],
    audits: [],
    hosts: [],
    subscriptions: [],
    webhooks: [],
  };
}
export const DEFAULT_SIGNALS: Signals = {
  dependents: 0,
  maintainers: 1,
  fundingUsd: 0,
  fundingKnown: false,
  maintainerCountKnown: false,
  backlog: 0,
  corporate: false,
  infrastructure: false,
  scorecard: null,
  accountAgeDays: 0,
  recentChange: true,
  fundingLinks: [],
  vulnerabilities: [],
};
export const PARAMS = Object.freeze({
  version: "nebraska-1.0.0",
  gamma: 0.5,
  alpha: 0.5,
  minWeight: 0.5,
  maxWeight: 2,
  confidence: 0.8,
  risk: 0.3,
  cooldownDays: 14,
  minimumCents: 1000,
  unclaimedMonths: 6,
});
