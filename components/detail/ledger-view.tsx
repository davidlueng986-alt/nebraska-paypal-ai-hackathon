"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useData, useLedger } from "../lib/data";
import { fmt, short } from "../lib/format";
import { Stat } from "../ledger/month-view";
import { ErrorBox, Loading } from "../ui/states";

/** Administrator detail: journal head, payout batches, holds and every gate decision. */
export function LedgerView() {
  const { boot, source, period, ready } = useData();
  const ledger = useLedger();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (ready && (source !== "live" || boot?.actor.role !== "admin"))
    return (
      <div className="stack">
        <h1 className="page-title">Ledger</h1>
        <div className="flash">The ledger needs the live API and an administrator session.</div>
      </div>
    );
  if (ledger.error && !ledger.data) return <ErrorBox message={ledger.error} retry={() => void ledger.reload()} />;
  if (!ledger.data) return <Loading label="Loading ledger" />;
  const l = ledger.data;
  const login = (id: string) => boot?.maintainers.find((m) => m.id === id)?.login ?? id;
  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      await ledger.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Ledger</h1>
          <p className="page-sub">Append-only, hash-chained journal. Every gate decision and payout is here.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => void act(() => api("osv/scan", { period }), "Advisory scan finished.")}>
            Scan advisories (OSV)
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void act(() => api("reconcile", { period, toolkit: false }), "Read-only reconciliation finished.")}
          >
            Reconcile with PayPal (read-only)
          </button>
        </div>
      </div>
      {msg ? <div className="flash flash-success">{msg}</div> : null}
      {err ? <div className="flash flash-danger">{err}</div> : null}
      <section className="box">
        <div className="stats">
          <Stat label="Journal events" value={l.events.toLocaleString("en-US")} />
          <Stat label="Chain head" value={short(l.chainHash, 6)} note="SHA-256 of the latest event" />
          <Stat label="Payout batches" value={String(l.batches.length)} note="At most one per month" />
          <Stat label="Held recipients" value={String(l.holds.length)} tone={l.holds.length ? "attention" : undefined} />
        </div>
      </section>

      {l.holds.length ? (
        <section className="box box-attention">
          <div className="box-header">
            <h2 className="box-title">
              Held recipients <span className="counter">{l.holds.length}</span>
            </h2>
          </div>
          {l.holds.map((h) => (
            <div className="box-row row" key={h.id} style={{ justifyContent: "space-between" }}>
              <div>
                <span className="row-title">{login(h.maintainerId)}</span>
                <p className="row-meta">{h.reason}</p>
              </div>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void act(() => api("holds/release", { maintainerId: h.maintainerId }), "Hold released by a human administrator.")
                }
              >
                Release after review
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {l.batches.map((b) => (
        <section className="box" key={b.id}>
          <div className="box-header">
            <h2 className="box-title">
              Batch <span className="mono">{b.id}</span>
              <span className={`label ${b.status === "complete" ? "label-success" : "label-attention"}`}>{b.status}</span>
            </h2>
            {boot?.mode !== "demo" ? (
              <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => api("payout/sync", { batchId: b.id }), "Statuses refreshed from PayPal.")}>
                Sync from PayPal
              </button>
            ) : null}
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Recipient</th>
                  <th className="r">Amount</th>
                  <th>PayPal status</th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.id}</td>
                    <td>{login(i.maintainerId)}</td>
                    <td className="r strong">{fmt(i.cents, i.currency)}</td>
                    <td>
                      <span className={`label ${i.status === "SUCCESS" ? "label-success" : ["FAILED", "RETURNED"].includes(i.status) ? "label-danger" : "label-attention"}`}>
                        {i.status}
                      </span>
                      {i.status === "UNCLAIMED" ? (
                        <button
                          className="btn btn-sm"
                          style={{ marginLeft: 8 }}
                          onClick={() => void act(() => api("payout/cancel-unclaimed", { batchId: b.id, itemId: i.id }), "Cancellation requested.")}
                        >
                          Cancel unclaimed
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.lastError ? <div className="box-row danger">{b.lastError}</div> : null}
        </section>
      ))}

      <section className="box">
        <div className="box-header">
          <h2 className="box-title">
            <ShieldCheck size={16} aria-hidden="true" /> Gate decisions <span className="counter">{l.audits.length}</span>
          </h2>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Action</th>
                <th>Checks</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {l.audits.slice(0, 50).map((a) => (
                <tr key={a.id}>
                  <td className="mono nowrap">{a.at.slice(0, 19).replace("T", " ")}</td>
                  <td className="mono">{a.action}</td>
                  <td>
                    {a.checks.map((c) => (
                      <span key={c.id} className={`label ${c.passed ? "label-success" : "label-danger"}`} title={c.reason} style={{ marginRight: 4 }}>
                        {c.id}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className={`label ${a.result === "deny" ? "label-danger" : "label-success"}`}>{a.result}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
