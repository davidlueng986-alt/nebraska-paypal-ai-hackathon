"use client";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { approvalHref } from "../approvals/grant-ask";
import { api } from "../lib/api";
import { useData, usePayer } from "../lib/data";
import { fmt, lastDayOf, num } from "../lib/format";
import { HookLine } from "./hook-line";

/** Setup: approve a budget on PayPal, add one hook line, done. */
export function StartView() {
  const { orgId, source, period } = useData();
  const payer = usePayer(4000);
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const p = payer.data;
  const cur = p?.org.currency ?? "USD";
  const approved = !!p && p.org.status === "active" && p.org.budgetCents > 0;
  const hasUsage = !!p && p.rows.length > 0;
  const quantity = Math.floor(Number(amount));
  const valid = Number.isFinite(quantity) && quantity >= 1 && quantity <= 100000;

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const s = await api<{ id: string; approveUrl: string }>("subscription", { orgId, quantity });
      window.location.assign(approvalHref(s.approveUrl, "/start", s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the PayPal approval");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Set up Nebraska</h1>
          <p className="page-sub">Two steps, then you are done. Nebraska pays the maintainers your agent depends on, every month, through PayPal.</p>
        </div>
      </div>

      <div className="cols">
        <section className="box" aria-label="Setup steps">
          <ol className="steps">
            <li className={`step ${approved ? "step-done" : ""}`}>
              <span className="step-num">{approved ? <CheckCircle2 size={16} aria-label="Done" /> : "1"}</span>
              <div>
                <h2 className="step-title">Approve a monthly budget on PayPal</h2>
                <div className="step-body">
                  {approved ? (
                    <p>
                      <b>{fmt(p!.org.budgetCents, cur)} per month</b> approved on PayPal
                      {p!.org.subscriptionId ? (
                        <>
                          {" "}
                          · subscription <span className="mono">{p!.org.subscriptionId}</span>
                        </>
                      ) : null}
                      . This is the most the AI can ever spend.
                    </p>
                  ) : (
                    <p>This is the most the AI can ever spend. You approve it on PayPal, not here.</p>
                  )}
                  <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                    <div className="form-group" style={{ width: 200 }}>
                      <label htmlFor="budget">{approved ? "Change monthly budget" : "Monthly budget"}</label>
                      <div className="input-prefix">
                        <span>{cur}</span>
                        <input
                          id="budget"
                          className="form-control"
                          inputMode="numeric"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                          aria-invalid={!valid}
                        />
                      </div>
                    </div>
                    <button
                      className={`btn ${approved ? "" : "btn-primary"}`}
                      disabled={!valid || busy || source !== "live"}
                      onClick={() => void approve()}
                    >
                      {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
                      Approve {valid ? fmt(quantity * 100, cur) : ""} on PayPal
                      <ExternalLink size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {error ? <p className="danger">{error}</p> : null}
                </div>
              </div>
            </li>
            <li className={`step ${hasUsage ? "step-done" : ""}`}>
              <span className="step-num">{hasUsage ? <CheckCircle2 size={16} aria-label="Done" /> : "2"}</span>
              <div style={{ minWidth: 0 }}>
                <h2 className="step-title">Add one line to your coding agent</h2>
                <div className="step-body" style={{ justifyItems: "stretch" }}>
                  <p>
                    Add it as a <b>Stop</b> hook in <span className="mono">.claude/settings.json</span>. It sends package
                    names and dependency depth only. No source code, no file paths.
                  </p>
                  <HookLine orgId={orgId} />
                  <p className="form-hint">
                    Also set <span className="mono">NEBRASKA_URL</span>, <span className="mono">NEBRASKA_API_TOKEN</span>{" "}
                    and <span className="mono">NEBRASKA_REPO_SALT</span> in the agent&rsquo;s environment. Full example:{" "}
                    <span className="mono">examples/claude-hooks.json</span>.
                  </p>
                </div>
              </div>
            </li>
            <li className={`step ${approved && hasUsage ? "step-done" : ""}`}>
              <span className="step-num">{approved && hasUsage ? <CheckCircle2 size={16} aria-label="Done" /> : "3"}</span>
              <div>
                <h2 className="step-title">Done</h2>
                <div className="step-body">
                  <p>
                    On {lastDayOf(period)} the Treasurer settles the month. You only act again if it asks for an extra
                    grant, and that approval also happens on PayPal.
                  </p>
                  {approved && hasUsage ? (
                    <Link className="btn" href="/">
                      Open this month
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          </ol>
        </section>

        <aside className="box" aria-live="polite" aria-labelledby="usage-title">
          <div className="box-header">
            <h2 className="box-title" id="usage-title">
              Usage from your agent
            </h2>
            {hasUsage ? <span className="label label-success">Receiving</span> : <span className="label">Waiting</span>}
          </div>
          {hasUsage ? (
            <>
              <div className="box-row">
                <b>First usage arrived.</b> {p!.metrics.packages} packages from {p!.metrics.repos} repositories this month.
              </div>
              {p!.rows
                .slice()
                .sort((a, b) => b.u - a.u)
                .map((r) => (
                  <div className="box-row row" key={r.id} style={{ justifyContent: "space-between" }}>
                    <span className="strong">{r.name}</span>
                    <span className="muted num">usage {num(r.u)}</span>
                  </div>
                ))}
            </>
          ) : (
            <div className="blankslate">
              <Loader2 size={20} className="spin" aria-hidden="true" />
              <h3 style={{ fontSize: 16 }}>Waiting for the first run</h3>
              <p>This updates by itself when your agent finishes its next session.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
