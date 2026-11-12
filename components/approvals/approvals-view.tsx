"use client";
import { Inbox } from "lucide-react";
import { usePayer } from "../lib/data";
import { ErrorBox, Loading } from "../ui/states";
import { GrantAsk } from "./grant-ask";

/** What extra does the AI want to pay? Approving always happens on PayPal. */
export function ApprovalsView() {
  const payer = usePayer();
  if (payer.error && !payer.data) return <ErrorBox message={payer.error} retry={() => void payer.reload()} />;
  if (!payer.data) return <Loading label="Loading approvals" />;
  const p = payer.data;
  const pending = p.grants.filter((g) => g.status === "approval_pending");
  const past = p.grants.filter((g) => g.status !== "approval_pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub">
            The Treasurer can propose an extra grant. It can never approve one: only you can, on PayPal.
          </p>
        </div>
      </div>
      <section className={`box ${pending.length ? "box-attention" : ""}`} aria-labelledby="open-title">
        <div className="box-header">
          <h2 className="box-title" id="open-title">
            Waiting for you <span className="counter">{pending.length}</span>
          </h2>
        </div>
        {pending.length ? (
          pending.map((g) => (
            <GrantAsk key={g.id} grant={g} row={p.rows.find((r) => r.id === g.packageId)} onChange={() => void payer.reload()} />
          ))
        ) : (
          <div className="blankslate">
            <Inbox size={24} aria-hidden="true" />
            <h3 style={{ fontSize: 16 }}>Nothing to approve</h3>
            <p>When a package you depend on has a security advisory, the Treasurer may propose a one-time grant here.</p>
          </div>
        )}
      </section>
      {past.length ? (
        <section className="box" aria-labelledby="past-title">
          <div className="box-header">
            <h2 className="box-title" id="past-title">
              History <span className="counter">{past.length}</span>
            </h2>
          </div>
          {past.map((g) => (
            <GrantAsk key={g.id} grant={g} row={p.rows.find((r) => r.id === g.packageId)} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
