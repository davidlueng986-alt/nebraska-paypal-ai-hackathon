"use client";
import { Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GrantAsk } from "../approvals/grant-ask";
import { useData, usePayer } from "../lib/data";
import { fmt, lastDayOf, periodLabel } from "../lib/format";
import { HookLine } from "../start/hook-line";
import { ErrorBox, Loading } from "../ui/states";
import { AllocBar } from "./alloc-bar";
import { PackageGrid } from "./package-grid";
import { WhyDrawer } from "./why-drawer";

export function MonthView() {
  const { orgId } = useData();
  const payer = usePayer();
  const [pick, setPick] = useState<string>();

  if (payer.error && !payer.data) return <ErrorBox message={payer.error} retry={() => void payer.reload()} />;
  if (!payer.data) return <Loading label="Loading this month" />;

  const p = payer.data;
  const cur = p.org.currency;
  const rows = p.rows;
  const funded = p.metrics.funded;
  const allocated = p.metrics.allocated;
  const heldRows = rows.filter((r) => r.status === "Held");
  const held = heldRows.reduce((s, r) => s + r.cents, 0);
  const recycled = p.close ? Math.max(0, funded - allocated) : 0;
  const pending = p.grants.filter((g) => g.status === "approval_pending");
  const paid = p.metrics.paid > 0;
  const grantCents = p.grants
    .filter((g) => g.status === "captured" && g.period === p.period)
    .reduce((s, g) => s + g.cents, 0);
  const status = paid ? "Paid" : p.close ? "Allocated, not paid yet" : "Open";

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">
            {periodLabel(p.period)}
            <span className={`label label-large ${paid ? "label-success" : p.close ? "label-attention" : ""}`}>{status}</span>
          </h1>
          <p className="page-sub">
            {p.org.name}: where this month&rsquo;s open-source budget goes.
          </p>
        </div>
        <Link className="btn" href="/month-end">
          <Play size={16} aria-hidden="true" /> Month-end run
        </Link>
      </div>

      <section className="box" aria-label="Totals">
        <div className="stats">
          <Stat
            label={paid ? "Paid to maintainers" : "Going to maintainers"}
            value={fmt(paid ? p.metrics.paid : p.close ? allocated : funded, cur)}
            note={
              p.close
                ? `${rows.length} packages${paid && grantCents ? `, incl. ${fmt(grantCents, cur)} grant you approved` : ""}${recycled ? `, ${fmt(recycled, cur)} rolls over` : ""}`
                : `Allocated on ${lastDayOf(p.period)}`
            }
            tone={paid ? "success" : undefined}
          />
          <Stat label="Monthly budget" value={fmt(p.org.budgetCents, cur)} note="Approved by you on PayPal" />
          <Stat label="Received this month" value={fmt(funded, cur)} note="Confirmed by PayPal" />
          <Stat
            label="Held for review"
            value={fmt(held, cur)}
            note={held ? `${heldRows.map((r) => r.name).join(", ")}: recipient changed` : "Nothing held"}
            tone={held ? "attention" : undefined}
          />
        </div>
      </section>

      {pending.length ? (
        <section className="box box-attention" aria-labelledby="pending-title">
          <div className="box-header">
            <h2 className="box-title" id="pending-title">
              Waiting for your approval <span className="counter">{pending.length}</span>
            </h2>
            <Link href="/approvals">All approvals</Link>
          </div>
          {pending.map((g) => (
            <GrantAsk key={g.id} grant={g} row={rows.find((r) => r.id === g.packageId)} onChange={() => void payer.reload()} />
          ))}
        </section>
      ) : null}

      {rows.length ? (
        <>
          <section className="box" aria-labelledby="split-title">
            <div className="box-header">
              <h2 className="box-title" id="split-title">
                Split by package
              </h2>
              <span className="muted">Click a package to see why</span>
            </div>
            <div className="box-body">
              <AllocBar rows={rows} currency={cur} onPick={setPick} />
            </div>
          </section>

          <section className="box" aria-labelledby="grid-title">
            <div className="box-header">
              <h2 className="box-title" id="grid-title">
                Packages your agents used <span className="counter">{rows.length}</span>
              </h2>
              <span className="muted">
                {p.metrics.repos} repositories
              </span>
            </div>
            <PackageGrid rows={rows} currency={cur} onPick={setPick} />
          </section>
        </>
      ) : (
        <section className="box">
          <div className="blankslate">
            <h3>No usage yet</h3>
            <p>Add this line to your coding agent. Packages appear here after its next run.</p>
          </div>
          <div className="box-body" style={{ paddingTop: 0 }}>
            <HookLine orgId={orgId} />
          </div>
        </section>
      )}

      <WhyDrawer
        row={rows.find((r) => r.id === pick)}
        rows={rows}
        budgetCents={funded}
        grants={p.grants}
        currency={cur}
        onClose={() => setPick(undefined)}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "success" | "attention" | "danger";
}) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${tone ?? ""}`}>{value}</p>
      {note ? <p className="stat-note">{note}</p> : null}
    </div>
  );
}
