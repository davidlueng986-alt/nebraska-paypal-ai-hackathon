"use client";
import { allocate, capOf } from "../lib/allocation";
import { fmt, num } from "../lib/format";
import type { Grant, PayerRow } from "../lib/types";
import { Byline } from "../ui/byline";
import { Drawer } from "../ui/drawer";

const CONFIDENCE_FLOOR = 0.8;

/** "Why this amount": the formula with real values, the Treasurer's reason, and the AI-off comparison. */
export function WhyDrawer({
  row,
  rows,
  budgetCents,
  grants,
  currency,
  onClose,
}: {
  row?: PayerRow;
  rows: PayerRow[];
  budgetCents: number;
  grants: Grant[];
  currency: string;
  onClose: () => void;
}) {
  if (!row) return null;
  const lines = rows.map((r) => ({ id: r.id, u: r.u, c: r.c, n: r.n }));
  const sumW = rows.reduce((s, r) => s + Math.sqrt(r.u) * r.c * r.n, 0);
  const w = Math.sqrt(row.u) * row.c * row.n;
  const share = w / sumW;
  const k = rows.filter((r) => r.u > 0).length;
  const cap = capOf(k);
  const capCents = Math.floor(budgetCents * cap);
  const capped = allocate(budgetCents, lines, true).get(row.id)?.capped ?? false;
  const offCents =
    (row as PayerRow & { aiOffCents?: number }).aiOffCents ?? allocate(budgetCents, lines, false).get(row.id)?.cents ?? 0;
  const delta = row.cents - offCents;
  const rejected = row.confidence < CONFIDENCE_FLOOR;
  const simulatedInjection = /SIMULATED injection/i.test(row.reason);
  const reasons = row.reason
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^SIMULATED/i.test(s));
  const advisories = row.signals?.vulnerabilities ?? [];
  const extra = grants.filter((g) => g.packageId === row.id && ["captured", "approval_pending"].includes(g.status));

  return (
    <Drawer open onClose={onClose} title={<>Why {row.name} gets {fmt(row.cents, currency)}</>}>
      <section className="box">
        <div className="box-header">
          <h3 className="box-title">1. The calculation</h3>
        </div>
        <table className="calc">
          <tbody>
            <tr>
              <td>Weight</td>
              <td>
                √usage × criticality × need
                <br />
                <span className="muted">
                  √{num(row.u)} × {row.c.toFixed(1)} × {row.n.toFixed(1)}
                </span>
              </td>
              <td>{num(w)}</td>
            </tr>
            <tr>
              <td>Share</td>
              <td>
                weight ÷ all weights
                <br />
                <span className="muted">
                  {num(w)} ÷ {num(sumW)}
                </span>
              </td>
              <td>{(share * 100).toFixed(2)}%</td>
            </tr>
            <tr>
              <td>Amount</td>
              <td>
                budget × share
                <br />
                <span className="muted">
                  {fmt(budgetCents, currency)} × {(share * 100).toFixed(2)}%, rounded down to the cent
                </span>
              </td>
              <td>{fmt(row.cents, currency)}</td>
            </tr>
            <tr>
              <td>Cap</td>
              <td>
                No package gets more than max(25%, 2 ÷ {k} packages) = {Math.round(cap * 100)}%
              </td>
              <td className={capped ? "attention" : "muted"}>
                {fmt(capCents, currency)} {capped ? "reached" : "not reached"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="box">
        <div className="box-header">
          <h3 className="box-title">2. What the AI decided</h3>
          <Byline who="treasurer" />
        </div>
        <div className="box-body stack" style={{ gap: 12 }}>
          <dl className="dl">
            <dt>Criticality (c)</dt>
            <dd>
              <b>{row.c.toFixed(1)}</b>
            </dd>
            <dt>Need (n)</dt>
            <dd>
              <b>{row.n.toFixed(1)}</b>
              {rejected ? <span className="label label-danger" style={{ marginLeft: 8 }}>AI answer rejected, neutral 1.0 used</span> : null}
            </dd>
            <dt>Confidence</dt>
            <dd>{rejected ? "Below 0.80, not used" : row.confidence.toFixed(2)}</dd>
          </dl>
          {reasons.map((r) => (
            <p key={r} className="quote">
              {r}
            </p>
          ))}
          {rejected && row.signals?.readme ? (
            <div className="stack" style={{ gap: 8 }}>
              <p>
                <b>Rejected input.</b> This package&rsquo;s README tried to change its own amount. The answer was out of
                bounds, so the gate used 1.0.
                {simulatedInjection ? <span className="label label-attention" style={{ marginLeft: 8 }}>Simulated</span> : null}
              </p>
              <p className="untrusted">{row.signals.readme}</p>
            </div>
          ) : null}
          {advisories.map((a) => (
            <p key={a.id} className="muted">
              Advisory <span className="mono">{a.id}</span>: {a.summary}
            </p>
          ))}
        </div>
      </section>

      <section className="box">
        <div className="box-header">
          <h3 className="box-title">3. Without AI</h3>
        </div>
        <div className="compare">
          <div>
            <p className="stat-label">AI off (c = n = 1)</p>
            <p className="stat-value muted">{fmt(offCents, currency)}</p>
          </div>
          <div>
            <p className="stat-label">With AI judgment</p>
            <p className="stat-value">{fmt(row.cents, currency)}</p>
          </div>
        </div>
        <div className="box-row">
          {delta === 0
            ? "The AI did not change this amount."
            : `The AI's judgment ${delta > 0 ? "adds" : "removes"} ${fmt(Math.abs(delta), currency)}.`}
        </div>
      </section>

      {row.status !== "Verified" || extra.length ? (
        <section className="box">
          <div className="box-header">
            <h3 className="box-title">4. Recipient</h3>
          </div>
          {row.status === "Held" ? (
            <div className="box-row">
              <Byline who="gate">I1</Byline> Held. The maintainer&rsquo;s PayPal email changed recently. The money stays
              credited; only a human administrator can release it.
            </div>
          ) : null}
          {row.status === "Unclaimed" ? (
            <div className="box-row">Nobody has claimed this package yet. The amount stays credited for six months.</div>
          ) : null}
          {extra.map((g) => (
            <div className="box-row" key={g.id}>
              {g.status === "captured" ? (
                <>
                  <Byline who="you" /> approved a {fmt(g.cents, currency)} grant on PayPal.
                </>
              ) : (
                <>
                  <Byline who="treasurer" /> proposed a {fmt(g.cents, currency)} grant. It waits for your approval on
                  PayPal.
                </>
              )}
            </div>
          ))}
        </section>
      ) : null}
    </Drawer>
  );
}
