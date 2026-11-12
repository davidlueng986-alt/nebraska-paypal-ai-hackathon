/**
 * Display-side mirror of src/core/allocator.ts `allocate` (that module imports
 * node:crypto via util and cannot ship to the browser). Used only to explain
 * an amount and to show the "AI off" comparison; the authoritative amounts
 * always come from the API. If the API ever returns `aiOffCents` on a row,
 * the UI prefers it.
 */
export type Line = { id: string; u: number; c: number; n: number };
export type Shares = Map<string, { w: number; cents: number; capped: boolean }>;

export function allocate(budgetCents: number, lines: Line[], ai = true): Shares {
  const rows = [...lines]
    .filter((l) => l.u > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => {
      const c = ai ? l.c : 1;
      const n = ai ? l.n : 1;
      return { id: l.id, w: Math.sqrt(l.u) * c * n };
    });
  const out: Shares = new Map();
  if (!rows.length) return out;
  const capFraction = capOf(rows.length);
  const capCents = Math.floor(budgetCents * capFraction);
  let remaining = budgetCents;
  let open = [...rows];
  const amounts = new Map<string, number>();
  const capped = new Set<string>();
  while (open.length) {
    const sum = open.reduce((s, r) => s + r.w, 0);
    const over = open.filter((r) => (remaining * r.w) / sum > capCents);
    if (!over.length) {
      for (const r of open) amounts.set(r.id, (remaining * r.w) / sum);
      break;
    }
    for (const r of over) {
      amounts.set(r.id, capCents);
      capped.add(r.id);
      remaining -= capCents;
    }
    open = open.filter((r) => !over.includes(r));
  }
  for (const r of rows)
    out.set(r.id, {
      w: r.w,
      cents: Math.min(capCents, Math.floor((amounts.get(r.id) ?? 0) + 1e-8)),
      capped: capped.has(r.id),
    });
  return out;
}
export const capOf = (k: number) => Math.min(1, Math.max(0.25, 2 / k));
