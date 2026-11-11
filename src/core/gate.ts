import { allocate, usageUnits } from "./allocator";
import {
  PARAMS,
  type Audit,
  type Batch,
  type Close,
  type Maintainer,
  type State,
} from "./model";
import { activeHold, daysSince, hash, id, now } from "./util";
export function closeHash(
  c: Pick<
    Close,
    | "usageSnapshot"
    | "decisions"
    | "budgetCents"
    | "paramsVersion"
    | "orgId"
    | "period"
    | "currency"
    | "ai"
  >,
) {
  return hash({
    usageSnapshot: c.usageSnapshot,
    decisions: c.decisions,
    budgetCents: c.budgetCents,
    paramsVersion: c.paramsVersion,
    orgId: c.orgId,
    period: c.period,
    currency: c.currency,
    ai: c.ai,
  });
}
export function recipient(
  s: State,
  m: Maintainer,
): { email: string; ready: boolean; reason: string } {
  if (!m.verifiedAt || !m.email)
    return { email: "", ready: false, reason: "Unverified recipient" };
  if (daysSince(m.emailChangedAt) < PARAMS.cooldownDays)
    return { email: m.email, ready: false, reason: "14-day email cooldown" };
  if (activeHold(s, m.id))
    return { email: m.email, ready: false, reason: "Recipient is held" };
  const host = m.hostId ? s.hosts.find((h) => h.id === m.hostId) : undefined;
  if (m.hostId && (!host?.verifiedAt || !m.hostAuthorizedAt))
    return {
      email: "",
      ready: false,
      reason: "Fiscal host lacks verification or maintainer authorization",
    };
  if (
    host &&
    (daysSince(host.changedAt) < 14 || daysSince(m.hostAuthorizedAt!) < 14)
  )
    return {
      email: host.email,
      ready: false,
      reason: "14-day fiscal-host cooldown",
    };
  return {
    email: host?.email ?? m.email,
    ready: true,
    reason: "Verified and eligible",
  };
}
export function validDecision(d: State["decisions"][number]) {
  if (
    d.confidence < 0 ||
    d.confidence > 1 ||
    !Number.isFinite(d.confidence) ||
    !d.inputHash ||
    !d.modelVersion
  )
    return false;
  if (["criticality", "need"].includes(d.question))
    return typeof d.value === "number" && d.value >= 0.5 && d.value <= 2;
  if (d.question === "payee_risk")
    return typeof d.value === "number" && d.value >= 0 && d.value <= 1;
  if (d.question === "grant_case")
    return [0, 100, 250, 500].includes(d.value as number);
  return ["retry_next_month", "hold_notify"].includes(d.value as string);
}
export function checkPayout(s: State, batch: Batch): Audit {
  const checks: Audit["checks"] = [];
  const check = (id: string, passed: boolean, reason: string) =>
    checks.push({ id, passed, reason });
  const items = batch.items;
  const creditIds = items.flatMap((i) => i.creditIds);
  const credits = creditIds.map((id) => s.credits.find((c) => c.id === id));
  check(
    "I1",
    items.every((i) => {
      const m = s.maintainers.find((m) => m.id === i.maintainerId);
      if (!m) return false;
      const r = recipient(s, m);
      return (
        r.ready &&
        r.email === i.receiver &&
        i.creditIds.every((id) => {
          const c = s.credits.find((c) => c.id === id);
          if (!c) return false;
          const claim = s.claims.find(
            (cl) => cl.packageId === c.packageId && cl.maintainerId === m.id,
          );
          return !!claim && daysSince(claim.claimedAt) >= 14;
        })
      );
    }),
    "All recipients verified, cooldowns passed, no holds, receiver matches authoritative record",
  );
  check(
    "I2",
    credits.every(Boolean) &&
      s.closes.every(
        (c) =>
          c.allocations.reduce((sum, a) => sum + a.cents, 0) <=
          s.receipts
            .filter(
              (r) =>
                r.orgId === c.orgId &&
                r.period === c.period &&
                r.currency === c.currency,
            )
            .reduce((sum, r) => sum + r.cents, 0),
      ) &&
      items.every(
        (i) =>
          i.cents >= PARAMS.minimumCents &&
          Number.isSafeInteger(i.cents) &&
          i.cents ===
            i.creditIds.reduce(
              (sum, id) =>
                sum + (s.credits.find((c) => c.id === id)?.cents ?? 0),
              0,
            ) &&
          i.creditIds.every((id) => {
            const c = s.credits.find((c) => c.id === id);
            return (
              c?.currency === i.currency &&
              c.maintainerId === i.maintainerId &&
              c.period <= batch.period
            );
          }),
      ),
    "Only funded integer credits; threshold and currency isolation enforced",
  );
  check(
    "I3",
    s.closes.every((c) => {
      const cap = Math.floor(
        c.budgetCents * Math.min(1, Math.max(0.25, 2 / c.allocations.length)),
      );
      return c.allocations.every((a) => a.cents >= 0 && a.cents <= cap);
    }),
    "Every recurring package allocation respects max(25%, 2/K)",
  );
  const existing = s.batches.find((b) => b.period === batch.period);
  check(
    "I4",
    batch.id === `nebraska-${batch.period}` &&
      (!existing ||
        (existing.id === batch.id &&
          existing.payloadHash === batch.payloadHash)) &&
      new Set(items.map((i) => i.id)).size === items.length &&
      new Set(creditIds).size === creditIds.length &&
      credits.every(
        (c) =>
          c?.status === "available" ||
          (c?.status === "reserved" && c.batchId === batch.id),
      ) &&
      items.every(
        (i) => i.id === itemId(i.maintainerId, batch.period, i.currency),
      ) &&
      (!existing || daysSince(existing.createdAt) < 29),
    "One immutable batch and item identity per period; unique credits; uncertain retries stop before PayPal dedupe expires",
  );
  check(
    "I5",
    s.decisions.every(validDecision) &&
      s.closes.every((c) => c.decisions.every(validDecision)),
    "All adopted and fallback decisions match the fixed question catalog",
  );
  check(
    "I6",
    credits.every(
      (c) =>
        c?.source !== "grant" ||
        s.grants.some(
          (g) =>
            g.id === c.sourceId &&
            g.status === "captured" &&
            !!g.captureId &&
            g.orgId === c.orgId &&
            g.currency === c.currency,
        ),
    ),
    "Grant credits require provider-confirmed capture and human approval",
  );
  const recomputable = s.closes.every(
    (c) =>
      c.paramsVersion === PARAMS.version &&
      c.snapshotHash === closeHash(c) &&
      hash(
        allocate(c.budgetCents, usageUnits(c.usageSnapshot), c.decisions, c.ai),
      ) === hash(c.allocations),
  );
  const sourced = credits.every(
    (c) =>
      c &&
      (c.source === "allocation"
        ? s.closes.some(
            (close) =>
              close.id === c.sourceId &&
              close.orgId === c.orgId &&
              close.currency === c.currency &&
              close.allocations.some(
                (a) =>
                  a.packageId === c.packageId &&
                  s.credits
                    .filter(
                      (x) =>
                        x.sourceId === c.sourceId &&
                        x.packageId === c.packageId &&
                        x.status !== "split",
                    )
                    .reduce((sum, x) => sum + x.cents, 0) === a.cents,
              ),
          )
        : s.grants.some(
            (g) =>
              g.id === c.sourceId &&
              s.credits
                .filter((x) => x.sourceId === g.id && x.status !== "split")
                .reduce((sum, x) => sum + x.cents, 0) === g.cents,
          )),
  );
  check(
    "I7",
    recomputable &&
      sourced &&
      batch.payloadHash ===
        hash(
          items.map(
            ({ id, receiver, cents, currency, creditIds, maintainerId }) => ({
              id,
              receiver,
              cents,
              currency,
              creditIds,
              maintainerId,
            }),
          ),
        ) &&
      items.length <= 15000,
    "Snapshots, formulas, credit provenance and immutable payment payload recompute",
  );
  return {
    id: id("gate"),
    action: "payout.execute",
    inputsHash: hash(batch),
    checks,
    result: checks.every((c) => c.passed) ? "allow" : "deny",
    at: now(),
  };
}
export function itemId(maintainerId: string, period: string, currency: string) {
  return `${hash(maintainerId).slice(0, 10)}-${period}-${currency}`;
}
