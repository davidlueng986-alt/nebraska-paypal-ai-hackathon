"use client";
import graph from "@/fixtures/dependency-graph.json";
import { allocate } from "../lib/allocation";
import { usePayer } from "../lib/data";
import { fmt, periodLabel } from "../lib/format";
import { Stat } from "../ledger/month-view";
import { ErrorBox, Loading } from "../ui/states";
import { AiCompareBars, DepthColumns, MoneyStatus, ShareBars, SqrtCurve, type Part } from "./charts";
import { CATEGORICAL, STATUS, packageColors } from "./colors";

const INK_ON: Record<string, string> = { [CATEGORICAL[0]]: "#FFFFFF" };
const inkFor = (c: string) => INK_ON[c] ?? "#1F2328";

/** One-glance view of the month: where the money is, what the AI changed, why. */
export function DashboardView() {
  const payer = usePayer();
  if (payer.error && !payer.data) return <ErrorBox message={payer.error} retry={() => void payer.reload()} />;
  if (!payer.data) return <Loading label="Loading dashboard" />;
  const p = payer.data;
  const cur = p.org.currency;
  const rows = p.rows;
  const color = packageColors(rows.map((r) => r.id));
  const funded = p.metrics.funded;
  const paid = p.metrics.paid;
  const held = rows.filter((r) => r.status === "Held").reduce((s, r) => s + r.cents, 0);
  const allocated = p.metrics.allocated;
  const recycled = p.close ? Math.max(0, funded - allocated) : 0;
  const captured = p.grants.filter((g) => g.status === "captured" && g.period === p.period).reduce((s, g) => s + g.cents, 0);
  const pendingGrant = p.grants.filter((g) => g.status === "approval_pending").reduce((s, g) => s + g.cents, 0);
  const waiting = paid ? 0 : Math.max(0, allocated - held) + captured;
  const lines = rows.map((r) => ({ id: r.id, u: r.u, c: r.c, n: r.n }));
  const off = allocate(funded, lines, false);
  const totalU = rows.reduce((s, r) => s + r.u, 0);

  const parts: Part[] = [
    { id: "paid", label: "Paid via PayPal", cents: paid, color: STATUS.good, ink: "#FFFFFF" },
    { id: "waiting", label: "Allocated, pays at month-end", cents: waiting, color: "#8C959F", ink: "#1F2328" },
    { id: "held", label: "Held for review", cents: held, color: STATUS.warning, ink: "#1F2328" },
    { id: "pending", label: "Grant awaiting your approval", cents: pendingGrant, color: STATUS.warning, ink: "#1F2328", pattern: true },
    { id: "recycled", label: "Rolls into next month", cents: recycled, color: STATUS.neutral, ink: "#1F2328" },
  ];
  const series = [...rows]
    .sort((a, b) => b.cents - a.cents)
    .map((r) => ({ id: r.id, name: r.name, color: color(r.id), ink: inkFor(color(r.id)) }));
  const depthCounts = Object.entries(
    (graph as { nodes: { depth: number }[] }).nodes.reduce<Record<number, number>>((m, n) => {
      m[n.depth] = (m[n.depth] ?? 0) + 1;
      return m;
    }, {}),
  )
    .map(([d, n]) => ({ depth: Number(d), n }))
    .sort((a, b) => a.depth - b.depth);

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Dashboard: {periodLabel(p.period)}</h1>
          <p className="page-sub">{p.org.name} at a glance. Every chart has a table view.</p>
        </div>
      </div>

      <section className="box" aria-label="Key numbers">
        <div className="stats stats-5">
          <Stat label="Monthly budget" value={fmt(p.org.budgetCents, cur)} note="Approved by you on PayPal" />
          <Stat label="Received" value={fmt(funded, cur)} note="Confirmed by PayPal" />
          <Stat
            label={paid ? "Paid to maintainers" : "Allocated"}
            value={fmt(paid || allocated, cur)}
            note={captured ? `Includes ${fmt(captured, cur)} grant` : `${rows.length} packages`}
            tone={paid ? "success" : undefined}
          />
          <Stat label="Repositories" value={String(p.metrics.repos)} note={`${rows.length} packages used`} />
          <Stat label="Held for review" value={fmt(held, cur)} tone={held ? "attention" : undefined} note={held ? "Released only by a human" : "Nothing held"} />
        </div>
      </section>

      <MoneyStatus parts={parts} currency={cur} title="Where this month's money is now" />

      <div className="dash-grid">
        <AiCompareBars
          currency={cur}
          rows={rows.map((r) => ({ id: r.id, name: r.name, on: r.cents, off: off.get(r.id)?.cents ?? 0, color: color(r.id) }))}
        />
        <ShareBars
          series={series}
          rows={[
            {
              id: "usage",
              label: "Usage",
              sub: "repositories × depth",
              values: Object.fromEntries(rows.map((r) => [r.id, r.u])),
              format: (v) => `u = ${v} of ${totalU}`,
            },
            {
              id: "off",
              label: "Money, AI off",
              sub: "√usage and the cap",
              values: Object.fromEntries(rows.map((r) => [r.id, off.get(r.id)?.cents ?? 0])),
              format: (v) => fmt(v, cur),
            },
            {
              id: "on",
              label: "Money, AI on",
              sub: "what is paid",
              values: Object.fromEntries(rows.map((r) => [r.id, r.cents])),
              format: (v) => fmt(v, cur),
            },
          ]}
        />
        <SqrtCurve points={rows.map((r) => ({ id: r.id, name: r.name, u: r.u, color: color(r.id) }))} />
        <DepthColumns counts={depthCounts} color={CATEGORICAL[6]} source="this repository's own package-lock.json (real meter output)" />
      </div>
    </div>
  );
}
