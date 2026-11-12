"use client";
import { FlaskConical, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useData, usePayer } from "../lib/data";
import { fmt, pkgName } from "../lib/format";

type Query = { kind: "grant" | "subscription"; id: string; quantity?: number; back: string };

/**
 * Demo-mode stand-in for the PayPal approval page. It is deliberately plain
 * and labelled: in sandbox mode the approve buttons go to PayPal itself.
 */
export function SimulatedApproval() {
  const { mode, ready } = useData();
  const payer = usePayer();
  const [q, setQ] = useState<Query>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search);
    const kind = s.get("kind") === "grant" ? "grant" : "subscription";
    const back = s.get("return") ?? "/";
    setQ({
      kind,
      id: (kind === "grant" ? s.get("grant") : s.get("id")) ?? "",
      quantity: s.get("quantity") ? Number(s.get("quantity")) : undefined,
      back: back.startsWith("/") && !back.startsWith("//") ? back : "/",
    });
  }, []);
  if (!q || !ready) return null;
  const grant = q.kind === "grant" ? payer.data?.grants.find((g) => g.id === q.id) : undefined;
  const sub = payer.data?.subscription;
  const quantity = q.quantity ?? (sub && sub.id === q.id ? sub.quantity : undefined);
  const org = payer.data?.org.name ?? "Your organization";
  const cur = payer.data?.org.currency ?? "USD";

  async function approve() {
    setBusy(true);
    setError("");
    try {
      await api("demo/approve", { kind: q!.kind, id: q!.id });
      window.location.assign(q!.back);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 520, margin: "48px auto" }}>
      <div className="flash" role="note">
        <FlaskConical size={16} aria-hidden="true" />
        <span>
          <b>Simulated approval page.</b> In demo mode this page stands in for PayPal. In sandbox mode you approve on
          PayPal&rsquo;s own page instead. No real money.
        </span>
      </div>
      <section className="box">
        <div className="box-header">
          <h1 className="box-title" style={{ fontSize: 16 }}>
            Approve a payment
          </h1>
          <span className="label">Demo</span>
        </div>
        <div className="box-body stack" style={{ gap: 16 }}>
          {mode !== "demo" ? (
            <p className="danger">This page only works in demo mode.</p>
          ) : q.kind === "grant" ? (
            <dl className="dl">
              <dt>Requested by</dt>
              <dd>{org}</dd>
              <dt>Type</dt>
              <dd>One-time grant</dd>
              <dt>For</dt>
              <dd>{grant ? `Maintainers of ${pkgName(grant.packageId)}` : "—"}</dd>
              <dt>Amount</dt>
              <dd className="row-amount">{grant ? fmt(grant.cents, grant.currency) : "—"}</dd>
            </dl>
          ) : (
            <dl className="dl">
              <dt>Requested by</dt>
              <dd>{org}</dd>
              <dt>Type</dt>
              <dd>Monthly subscription</dd>
              <dt>Amount</dt>
              <dd className="row-amount">{quantity ? `${fmt(quantity * 100, cur)} / month` : "—"}</dd>
            </dl>
          )}
          {error ? <p className="danger">{error}</p> : null}
        </div>
        <div className="box-row row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <a className="btn" href={q.back}>
            Cancel
          </a>
          <button className="btn btn-primary" disabled={busy || mode !== "demo" || !q.id} onClick={() => void approve()}>
            {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
            Approve (simulated)
          </button>
        </div>
      </section>
    </div>
  );
}
