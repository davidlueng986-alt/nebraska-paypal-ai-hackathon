import { PARAMS, type Allocation, type Decision, type Usage } from "./model";
import { DomainError, requireInt } from "./util";
export function usageUnits(events: Usage[]): Map<string, number> {
  const mins = new Map<string, { pkg: string; depth: number }>();
  for (const e of events) {
    const pkg = `${e.package.ecosystem}:${e.package.name}`;
    const key = `${e.org_id}|${e.period}|${e.repo_hash}|${pkg}`;
    const old = mins.get(key);
    if (!old || e.depth < old.depth) mins.set(key, { pkg, depth: e.depth });
  }
  const result = new Map<string, number>();
  for (const { pkg, depth } of mins.values())
    result.set(pkg, (result.get(pkg) ?? 0) + PARAMS.gamma ** depth);
  return result;
}
export function allocate(
  budgetCents: number,
  units: Map<string, number>,
  decisions: Decision[],
  ai = true,
): Allocation[] {
  requireInt(budgetCents);
  const rows = [...units.entries()]
    .filter(([, u]) => u > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([packageId, u]) => {
      const weight = (q: "criticality" | "need") => {
        const d = decisions.find(
          (d) => d.subject === packageId && d.question === q,
        );
        return ai &&
          d?.accepted &&
          typeof d.value === "number" &&
          d.value >= 0.5 &&
          d.value <= 2 &&
          d.confidence >= PARAMS.confidence
          ? d.value
          : 1;
      };
      const c = weight("criticality"),
        n = weight("need");
      return { packageId, u, c, n, w: Math.sqrt(u) * c * n, cents: 0 };
    });
  if (!rows.length) return [];
  const capFraction = Math.min(1, Math.max(0.25, 2 / rows.length));
  const capCents = Math.floor(budgetCents * capFraction);
  let remaining = budgetCents;
  let open = [...rows];
  const amounts = new Map<string, number>();
  while (open.length) {
    const sum = open.reduce((s, r) => s + r.w, 0);
    const capped = open.filter((r) => (remaining * r.w) / sum > capCents);
    if (!capped.length) {
      for (const r of open) amounts.set(r.packageId, (remaining * r.w) / sum);
      break;
    }
    for (const r of capped) {
      amounts.set(r.packageId, capCents);
      remaining -= capCents;
    }
    open = open.filter((r) => !capped.includes(r));
  }
  for (const r of rows)
    r.cents = Math.min(
      capCents,
      Math.floor((amounts.get(r.packageId) ?? 0) + 1e-8),
    );
  // Floor each package to a cent, matching the specification’s example.
  // The sub-cent remainder is recycled into the payer’s next-month pool.
  if (rows.reduce((s, r) => s + r.cents, 0) > budgetCents)
    throw new DomainError("Allocator exceeded pool");
  return rows;
}
