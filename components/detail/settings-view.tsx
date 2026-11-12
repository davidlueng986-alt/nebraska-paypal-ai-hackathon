"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useData, useMaintainer, usePayer } from "../lib/data";
import { fmt } from "../lib/format";

const ATTESTATION = "I verified the fiscal host identity and its authority to receive these funds";
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="box">
      <div className="box-header">
        <h2 className="box-title">{title}</h2>
        {note}
      </div>
      <div className="box-body stack" style={{ gap: 12, justifyItems: "start" }}>
        {children}
      </div>
    </section>
  );
}

/** Plain settings. Anything that moves money still goes through PayPal. */
export function SettingsView() {
  const { boot, orgId, maintainerId, source } = useData();
  const payer = usePayer();
  const m = useMaintainer();
  const admin = boot?.actor.role === "admin";
  const live = source === "live";
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [host, setHost] = useState({ name: "", email: "", repoUrl: "", attested: false });
  const [org, setOrg] = useState({ name: "", currency: "EUR" as (typeof CURRENCIES)[number] });

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      await Promise.all([payer.reload(), m.reload()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  const p = payer.data;
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Settings</h1>
      </div>
      {!live ? <div className="flash">Settings need the live API.</div> : null}
      {msg ? <div className="flash flash-success">{msg}</div> : null}
      {err ? <div className="flash flash-danger">{err}</div> : null}

      <Section title="Monthly budget">
        <p>
          {p ? (
            <>
              <b>{fmt(p.org.budgetCents, p.org.currency)} per month</b> for {p.org.name}, status <b>{p.org.status}</b>.
            </>
          ) : (
            "—"
          )}{" "}
          Changing it sends you to PayPal to approve the new amount.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" href="/start">
            Change on PayPal
          </Link>
          <button
            className="btn btn-danger"
            disabled={!live || busy || !p?.org.subscriptionId}
            onClick={() => {
              if (window.confirm("Cancel the monthly PayPal subscription? Money already received is still allocated."))
                void act(() => api("subscription/cancel", { orgId }), "Subscription cancelled.");
            }}
          >
            Cancel subscription
          </button>
        </div>
      </Section>

      <Section title="Privacy">
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={!!p?.org.publicName}
            disabled={!live || busy || !p}
            onChange={(e) =>
              void act(() => api("org/privacy", { orgId, publicName: e.target.checked }), "Privacy setting saved.")
            }
          />
          Show our organization name to the maintainers we pay
        </label>
        <p className="form-hint">Off by default: maintainers see &ldquo;Private organization&rdquo;.</p>
      </Section>

      <Section title="Maintainer payout email" note={m.data ? <span className="muted">{m.data.maintainer.login}</span> : null}>
        <p>
          Current: <b>{m.data?.maintainer.email || "none"}</b>. A new email restarts the 14-day cooldown before payouts.
        </p>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div className="form-group" style={{ width: 320 }}>
            <label htmlFor="newemail">New PayPal email</label>
            <input id="newemail" type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button
            className="btn"
            disabled={!live || busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
            onClick={() => void act(() => api("recipient", { maintainerId, email }), "Email saved. Cooldown restarted.")}
          >
            Save email
          </button>
        </div>
      </Section>

      <Section title="Fiscal host" note={<span className="label">Optional</span>}>
        <p>A maintainer can route payouts to a verified fiscal host instead of a personal account.</p>
        {m.data?.hosts.length ? (
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="form-group" style={{ width: 320 }}>
              <label htmlFor="hostsel">Route {m.data.maintainer.login}&rsquo;s payouts to</label>
              <select
                id="hostsel"
                className="form-control"
                defaultValue=""
                disabled={!live || busy}
                onChange={(e) =>
                  void act(
                    () => api("recipient/host", { maintainerId, hostId: e.target.value || null }),
                    "Payout destination saved.",
                  )
                }
              >
                <option value="">Personal PayPal email</option>
                {m.data.hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        {admin ? (
          <details>
            <summary className="strong" style={{ cursor: "pointer" }}>
              Add a verified fiscal host (administrator)
            </summary>
            <div className="stack" style={{ gap: 12, marginTop: 12, maxWidth: 420 }}>
              {(["name", "email", "repoUrl"] as const).map((k) => (
                <div className="form-group" key={k}>
                  <label htmlFor={`host-${k}`}>{k === "repoUrl" ? "Public verification URL" : k === "email" ? "PayPal email" : "Name"}</label>
                  <input id={`host-${k}`} className="form-control" value={host[k]} onChange={(e) => setHost({ ...host, [k]: e.target.value })} />
                </div>
              ))}
              <label className="row" style={{ gap: 8, alignItems: "flex-start", flexWrap: "nowrap" }}>
                <input type="checkbox" checked={host.attested} onChange={(e) => setHost({ ...host, attested: e.target.checked })} />
                <span>{ATTESTATION}</span>
              </label>
              <button
                className="btn"
                disabled={!live || busy || !host.attested || !host.name || !host.email || !host.repoUrl}
                onClick={() =>
                  void act(
                    () => api("hosts", { name: host.name, email: host.email, repoUrl: host.repoUrl, attestation: ATTESTATION }),
                    "Fiscal host added.",
                  )
                }
              >
                Add fiscal host
              </button>
            </div>
          </details>
        ) : null}
      </Section>

      {admin ? (
        <Section title="Meter API token">
          <p>A scoped token for the hook or CI. It is shown once.</p>
          <button
            className="btn"
            disabled={!live || busy}
            onClick={() =>
              void act(async () => {
                const r = await api<{ token: string }>("tokens", { orgId, days: 90 });
                setToken(r.token);
              }, "Token created. Copy it now.")
            }
          >
            Create 90-day token
          </button>
          {token ? (
            <div className="code-block">
              <pre>{token}</pre>
            </div>
          ) : null}
        </Section>
      ) : null}

      {admin ? (
        <Section title="Currencies" note={<span className="label">Optional</span>}>
          <p>
            Each organization pays in one currency: USD, EUR, GBP, CAD or AUD. Each currency is a separate pool; Nebraska
            never converts between them.
          </p>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="form-group" style={{ width: 240 }}>
              <label htmlFor="orgname">New organization</label>
              <input id="orgname" className="form-control" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
            </div>
            <div className="form-group" style={{ width: 120 }}>
              <label htmlFor="orgcur">Currency</label>
              <select
                id="orgcur"
                className="form-control"
                value={org.currency}
                onChange={(e) => setOrg({ ...org, currency: e.target.value as (typeof CURRENCIES)[number] })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              disabled={!live || busy || !org.name.trim()}
              onClick={() => void act(() => api("orgs", { name: org.name.trim(), currency: org.currency }), "Organization created.")}
            >
              Create
            </button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
