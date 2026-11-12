"use client";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { allocate } from "../lib/allocation";
import { useData, useMaintainer, usePayer } from "../lib/data";
import { fmt, periodLabel, pkgName } from "../lib/format";
import { Stat } from "../ledger/month-view";
import { Byline } from "../ui/byline";
import { ErrorBox, Loading } from "../ui/states";
import { MaintainerPicker } from "./maintainer-picker";

const CREDIT_STATUS: Record<string, { t: string; c: string }> = {
  paid: { t: "Paid", c: "label-success" },
  reserved: { t: "Sending", c: "label-attention" },
  available: { t: "Credited, pays at month-end", c: "" },
  recycled: { t: "Returned to payer", c: "" },
};

/** How much did AI use me, and what did I get? */
export function IncomeView() {
  const { period } = useData();
  const m = useMaintainer();
  const payer = usePayer();
  if (m.error && !m.data) return <ErrorBox message={m.error} retry={() => void m.reload()} />;
  if (!m.data) return <Loading label="Loading income" />;
  const d = m.data;
  const cur = Object.keys(d.earned)[0] ?? "USD";
  const earned = d.earned[cur] ?? 0;
  const credits = d.credits.filter((c) => c.period === period);
  const paid = credits.filter((c) => c.status === "paid").reduce((s, c) => s + c.cents, 0);
  const payoutState = d.hold
    ? { v: "Held", n: "A human administrator reviews a recent change", t: "attention" as const }
    : d.cooldownDays > 0
      ? { v: `${d.cooldownDays} days`, n: "Cooldown before the first payout", t: "attention" as const }
      : d.eligibility.ready
        ? { v: "Ready", n: d.eligibility.email ? `PayPal: ${d.eligibility.email}` : "Verified", t: "success" as const }
        : { v: "Not ready", n: d.eligibility.reason, t: "attention" as const };
  const rows = payer.data?.rows ?? [];
  const lines = rows.map((r) => ({ id: r.id, u: r.u, c: r.c, n: r.n }));
  const offs = payer.data ? allocate(payer.data.metrics.funded, lines, false) : undefined;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">
            {d.maintainer.login}
            <span className="label label-large">Maintainer</span>
          </h1>
          <p className="page-sub">What AI coding agents used of your packages in {periodLabel(period)}, and what you received.</p>
        </div>
        <MaintainerPicker />
      </div>

      <section className="box" aria-label="Totals">
        <div className="stats">
          <Stat
            label={`Earned in ${periodLabel(period, "month")}`}
            value={fmt(earned, cur)}
            note={paid ? `${fmt(paid, cur)} paid via PayPal` : "Pays out at month-end"}
            tone={earned ? "success" : undefined}
          />
          <Stat label="Paying organizations" value={String(d.usage.orgCount)} note={d.usage.organizations.join(", ") || "None yet"} />
          <Stat label="Repositories using you" value={String(d.usage.repoCount)} note="Counted by AI coding agents" />
          <Stat label="Payout account" value={payoutState.v} note={payoutState.n} tone={payoutState.t} />
        </div>
      </section>

      <section className="box" aria-labelledby="pay-title">
        <div className="box-header">
          <h2 className="box-title" id="pay-title">
            Payments this month <span className="counter">{credits.length}</span>
          </h2>
          <Link href={`/statements/${period}?as=maintainer`}>Statement</Link>
        </div>
        {credits.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Source</th>
                  <th>From</th>
                  <th className="r">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => {
                  const st = CREDIT_STATUS[c.status] ?? { t: c.status, c: "" };
                  return (
                    <tr key={c.id}>
                      <td className="strong">{pkgName(c.packageId)}</td>
                      <td>{c.source === "grant" ? "One-time grant, approved by the payer on PayPal" : "Monthly usage allocation"}</td>
                      <td>{d.usage.organizations[0] ?? "Private organization"}</td>
                      <td className="r strong">{fmt(c.cents, c.currency)}</td>
                      <td>
                        <span className={`label ${st.c}`}>{st.t}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="blankslate">
            <h3 style={{ fontSize: 16 }}>No payments yet this month</h3>
            <p>Amounts appear after the month-end run. Balances under $10.00 roll forward to next month.</p>
          </div>
        )}
      </section>

      <section className="box" aria-labelledby="why-title">
        <div className="box-header">
          <h2 className="box-title" id="why-title">
            Why you got this amount
          </h2>
          <Byline who="treasurer" />
        </div>
        {d.claims.length ? (
          d.claims.map((c) => {
            const r = rows.find((x) => x.id === c.packageId);
            const off = offs?.get(c.packageId)?.cents;
            return (
              <div className="box-row" key={c.id}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="row-grow stack" style={{ gap: 6 }}>
                    <span className="row-title">{pkgName(c.packageId)}</span>
                    {r ? (
                      <>
                        <p>
                          Used by agents in {d.usage.repoCount} repositories. The AI rated criticality{" "}
                          <b>{r.c.toFixed(1)}</b> and need <b>{r.n.toFixed(1)}</b> (confidence {r.confidence.toFixed(2)}).
                        </p>
                        <p className="muted">{r.reason.replace(/\s*SIMULATED injection:.*$/i, "")}</p>
                      </>
                    ) : (
                      <p className="muted">{d.statements[0]?.body ?? "Details appear after the month-end run."}</p>
                    )}
                  </div>
                  {r && off !== undefined ? (
                    <div className="compare box" style={{ minWidth: 280 }}>
                      <div>
                        <p className="stat-label">Without AI</p>
                        <p className="row-amount muted">{fmt(off, cur)}</p>
                      </div>
                      <div>
                        <p className="stat-label">With AI</p>
                        <p className="row-amount">{fmt(r.cents, cur)}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="blankslate">
            <PackageCheck size={24} aria-hidden="true" />
            <h3 style={{ fontSize: 16 }}>You have not claimed a package</h3>
            <p>Claim the packages you maintain to start receiving payouts.</p>
            <Link className="btn btn-primary" href="/maintainer/claim">
              Claim a package
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
