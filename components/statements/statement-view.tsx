"use client";
import { Check, Copy, Download, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useData, useMaintainer, usePayer } from "../lib/data";
import { periodLabel } from "../lib/format";
import type { Statement } from "../lib/types";
import { ErrorBox, Loading } from "../ui/states";

function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyHash({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
      <span className="mono" style={{ overflowWrap: "anywhere" }}>
        {value}
      </span>
      <button
        className="icon-btn"
        aria-label={ok ? "Copied" : "Copy hash"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          } catch {
            /* selectable anyway */
          }
        }}
      >
        {ok ? <Check size={14} className="success" /> : <Copy size={14} />}
      </button>
    </span>
  );
}

/** Can I trust this? Plain-English statement, recompute hash, audit bundle. */
export function StatementView({ period }: { period: string }) {
  const { orgId, source } = useData();
  const [side, setSide] = useState<"payer" | "maintainer">("payer");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("as") === "maintainer") setSide("maintainer");
  }, []);
  const payer = usePayer();
  const maintainer = useMaintainer();
  const [error, setError] = useState("");
  const res = side === "payer" ? payer : maintainer;
  if (res.error && !res.data) return <ErrorBox message={res.error} retry={() => void res.reload()} />;
  if (!res.data) return <Loading label="Loading statement" />;
  const statements: Statement[] = (res.data.statements as Statement[]).filter((s) => s.period === period);
  const st = statements[0];
  const name = side === "payer" ? payer.data?.org.name : maintainer.data?.maintainer.login;
  const close = payer.data?.close;

  async function bundle() {
    setError("");
    try {
      const b = await api<unknown>(`audit?org=${encodeURIComponent(orgId)}&period=${period}`);
      download(`nebraska-audit-${period}.json`, JSON.stringify(b, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }
  async function csv() {
    setError("");
    try {
      const r = await fetch(`/api/export?org=${encodeURIComponent(orgId)}&period=${period}`);
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      download(`nebraska-${period}.csv`, await r.text(), "text/csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Statement: {periodLabel(period)}</h1>
          <p className="page-sub">Plain English, with everything you need to recompute it yourself.</p>
        </div>
        <div className="segmented" role="group" aria-label="Whose statement">
          <button aria-pressed={side === "payer"} onClick={() => setSide("payer")}>
            Payer
          </button>
          <button aria-pressed={side === "maintainer"} onClick={() => setSide("maintainer")}>
            Maintainer
          </button>
        </div>
      </div>

      {!st ? (
        <section className="box">
          <div className="blankslate">
            <FileText size={24} aria-hidden="true" />
            <h3 style={{ fontSize: 16 }}>No statement yet for {periodLabel(period)}</h3>
            <p>Statements are written at the end of the month-end run, for the payer and for every maintainer.</p>
            <Link className="btn" href="/month-end">
              Go to month-end run
            </Link>
          </div>
        </section>
      ) : (
        <div className="cols">
          <section className="box" aria-labelledby="st-title">
            <div className="box-header">
              <h2 className="box-title" id="st-title">
                {name}
              </h2>
              <span className="muted">{new Date(st.createdAt).toUTCString().replace(" GMT", " UTC")}</span>
            </div>
            <div className="box-body" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: "72ch" }}>
              {st.body
                .split(/(?<=\.)\s+(?=[A-Za-z@][\w.-]*:)/)
                .map((s, i) => (
                  <p key={i} style={{ marginTop: i ? 12 : 0 }}>
                    {s}
                  </p>
                ))}
            </div>
          </section>

          <aside className="box" aria-labelledby="verify-title">
            <div className="box-header">
              <h2 className="box-title" id="verify-title">
                Verify it
              </h2>
            </div>
            <div className="box-body stack" style={{ gap: 12 }}>
              <dl className="dl" style={{ gridTemplateColumns: "1fr" }}>
                <dt>Recompute hash</dt>
                <dd>
                  <CopyHash value={st.recomputeHash} />
                </dd>
                {close ? (
                  <>
                    <dt>Usage snapshot hash</dt>
                    <dd>
                      <CopyHash value={close.snapshotHash} />
                    </dd>
                    <dt>Formula parameters</dt>
                    <dd className="mono">{close.paramsVersion}</dd>
                  </>
                ) : null}
              </dl>
              {side === "payer" ? (
                <>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => void bundle()} disabled={source !== "live"}>
                      <Download size={14} aria-hidden="true" /> Audit bundle
                    </button>
                    <button className="btn" onClick={() => void csv()} disabled={source !== "live"}>
                      <Download size={14} aria-hidden="true" /> CSV
                    </button>
                  </div>
                  <p>Then run, from the Nebraska repository:</p>
                  <div className="code-block">
                    <pre>npm run recompute -- nebraska-audit-{period}.json</pre>
                  </div>
                  <p className="form-hint">It recomputes every amount from the frozen snapshot and prints VERIFIED or fails.</p>
                </>
              ) : (
                <p className="form-hint">The payer&rsquo;s audit bundle recomputes to this same hash.</p>
              )}
              {error ? <p className="danger">{error}</p> : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
