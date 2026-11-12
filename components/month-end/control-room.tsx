"use client";
import { CheckCircle2, Circle, CircleDot, Loader2, PauseCircle, Play, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData, usePayer } from "../lib/data";
import { clock, fmt, periodLabel, short } from "../lib/format";
import type { RunEvent } from "../lib/types";
import { Stat } from "../ledger/month-view";
import { INVARIANTS, STEPS, stepOf, type StepId } from "./steps";
import { useRun } from "./use-run";

/** Fictional demo identities, used only to name ids in the recorded fixture. */
const FIXTURE_LOGINS: Record<string, string> = {
  m1: "framework-team",
  m2: "alex-chen",
  m3: "maya-rivera",
  m4: "sam-wilson",
};
type State = "pending" | "running" | "ok" | "held" | "rejected";

function StatusIcon({ state, size = 16 }: { state: State; size?: number }) {
  const label = { pending: "Not started", running: "In progress", ok: "Done", held: "Held", rejected: "Failed" }[state];
  const Icon =
    state === "ok" ? CheckCircle2 : state === "rejected" ? XCircle : state === "held" ? PauseCircle : state === "running" ? Loader2 : Circle;
  return <Icon size={size} className={`status-${state} ${state === "running" ? "spin" : ""}`} aria-label={label} />;
}

export function ControlRoom() {
  const { ready, source, period, boot } = useData();
  const payer = usePayer();
  const [speed, setSpeed] = useState(1);
  const [auto, setAuto] = useState(false);
  const [filter, setFilter] = useState<StepId | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSpeed(Math.min(8, Math.max(0.25, Number(q.get("speed") ?? 1) || 1)));
    setAuto(q.get("replay") === "fixture" || q.get("autoplay") === "1");
  }, []);
  const live = source === "live";
  const run = useRun({ live, period, speed });
  const startRef = useRef(run.start);
  startRef.current = run.start;
  useEffect(() => {
    if (!ready || !auto) return;
    const t = setTimeout(() => void startRef.current(), 1200);
    return () => clearTimeout(t);
  }, [ready, auto]);

  const logins = useMemo(() => {
    const m: Record<string, string> = live ? {} : { ...FIXTURE_LOGINS };
    for (const x of boot?.maintainers ?? []) m[x.id] = x.login;
    return m;
  }, [boot, live]);

  const events = run.shown;
  const last = events.at(-1);
  const done = run.phase === "done";
  const failed = done && /failed/i.test(last?.title ?? "");
  const currentStep = last ? stepOf(last) : undefined;
  const stepState = (id: StepId): State => {
    const es = events.filter((e) => stepOf(e) === id);
    if (!es.length) return "pending";
    if (es.some((e) => e.step === "gate" && e.status === "rejected")) return "rejected";
    if (id === currentStep && !done) return "running";
    if (id === "payout" && es.some((e) => e.status === "held" && e.step === "payout")) return "held";
    return "ok";
  };
  const gates = new Map(events.filter((e) => e.invariant).map((e) => [e.invariant!, e]));
  const payout = events.find((e) => e.step === "payout" && e.detail.batch_id);
  const batchId = payout ? String(payout.detail.batch_id) : "";
  const reused = !!batchId && run.priorBatches.includes(batchId);
  const paidCents = events
    .filter((e) => e.step === "webhook" && e.status === "ok")
    .reduce((s, e) => s + Number(e.detail.cents ?? 0), 0);
  const allocation = events.find((e) => e.step === "allocate" && e.actor === "treasurer");
  const allocatedCents = allocation
    ? Number(allocation.detail.budget_cents) - Number(allocation.detail.recycled_cents ?? 0)
    : undefined;
  const statusLabel =
    run.phase === "idle"
      ? { t: "Not started", c: "" }
      : run.phase === "error" || failed
        ? { t: "Failed", c: "label-danger" }
        : done
          ? { t: "Success", c: "label-success" }
          : { t: "In progress", c: "label-attention" };
  const shownEvents = filter ? events.filter((e) => stepOf(e) === filter) : events;
  const logEnd = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logEnd.current;
    if (el && !filter) el.scrollTop = el.scrollHeight;
  }, [events.length, filter]);

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">
            Month-end run: {periodLabel(period)}
            <span className={`label label-large ${statusLabel.c}`}>{statusLabel.t}</span>
          </h1>
          <p className="page-sub">
            {run.runId ? (
              <span className="mono">{run.runId}</span>
            ) : (
              "The Treasurer decides, the gate checks I1–I7, PayPal pays one batch."
            )}
          </p>
        </div>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => {
            setFilter(null);
            void run.start();
          }}
          disabled={!ready || run.phase === "starting" || run.phase === "running"}
        >
          {done ? <RotateCcw size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {live ? (done ? "Run month-end again" : "Run month-end") : done ? "Replay recorded run" : "Play recorded run"}
        </button>
      </div>

      {run.error ? (
        <div className="flash flash-danger" role="alert">
          <XCircle size={16} aria-hidden="true" /> {run.error}
        </div>
      ) : null}
      {reused && done ? (
        <div className="flash flash-success" role="status">
          <CheckCircle2 size={16} className="success" aria-hidden="true" />
          <span>
            <b>No second payment.</b> This run reused batch <span className="mono">{batchId}</span> with the same payload
            hash <span className="mono">{short(String(payout?.detail.payload_hash ?? ""), 6)}</span>. PayPal received it
            once.
          </span>
        </div>
      ) : null}

      <section className="box" aria-label="Run summary">
        <div className="stats">
          <Stat
            label="AI decisions"
            value={String(events.filter((e) => e.step === "decide" && e.actor === "decision").length || "—")}
            note={
              events.some((e) => e.step === "decide")
                ? `${events.filter((e) => e.step === "decide" && e.status === "rejected").length} rejected by bounds, ${holdsCount(events)} recipient held`
                : "Typed questions only"
            }
          />
          <Stat
            label="Allocated"
            value={allocatedCents === undefined ? "—" : fmt(allocatedCents)}
            note={allocation ? `of ${fmt(Number(allocation.detail.budget_cents))} budget` : "Waiting"}
          />
          <Stat
            label={reused ? "Paid (earlier, same batch)" : "Paid via PayPal"}
            value={paidCents ? fmt(paidCents) : "—"}
            note={paidCents ? "Includes approved grants" : "Nothing moves until all 7 checks pass"}
            tone={paidCents ? "success" : undefined}
          />
          <Stat label="Payout batch" value={batchId || "—"} note={payout ? String(payout.detail.provider_batch_id ?? "") : "One per month"} />
        </div>
      </section>

      <div className="run">
        <div className="stack" style={{ gap: 16 }}>
          <section className="box" aria-labelledby="steps-title">
            <div className="box-header">
              <h2 className="box-title" id="steps-title">
                Steps
              </h2>
              {filter ? (
                <button className="btn btn-sm btn-invisible" onClick={() => setFilter(null)}>
                  Show all
                </button>
              ) : null}
            </div>
            <ol className="run-steps">
              {STEPS.map((s) => {
                const es = events.filter((e) => stepOf(e) === s.id);
                const rejected = es.filter((e) => e.status === "rejected").length;
                const held = es.filter((e) => e.status === "held").length;
                return (
                  <li key={s.id}>
                    <button
                      className="run-step"
                      aria-current={filter === s.id ? "true" : undefined}
                      onClick={() => setFilter(filter === s.id ? null : s.id)}
                    >
                      <StatusIcon state={stepState(s.id)} />
                      {s.name}
                      <span className="count">
                        {rejected ? <span className="danger">{rejected} rejected </span> : null}
                        {held ? <span className="attention">{held} held </span> : null}
                        {es.length || ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="box" aria-labelledby="checks-title">
            <div className="box-header">
              <h2 className="box-title" id="checks-title">
                Gate checks
              </h2>
              <span className="muted">{gates.size} of 7</span>
            </div>
            <ol className="checks">
              {INVARIANTS.map((inv) => {
                const g = gates.get(inv.id);
                const state: State = !g ? "pending" : g.status === "ok" ? "ok" : "rejected";
                return (
                  <li key={inv.id} className="check">
                    <StatusIcon state={state} />
                    <span className="check-id">{inv.id}</span>
                    <span className={state === "pending" ? "muted" : undefined}>{inv.name}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <section className="box" aria-labelledby="log-title">
          <div className="box-header">
            <h2 className="box-title" id="log-title">
              Log{filter ? `: ${STEPS.find((s) => s.id === filter)?.name}` : ""}
            </h2>
            <span className="muted">{events.length} events</span>
          </div>
          {events.length ? (
            <ol className="log" ref={logEnd} aria-live="polite" aria-relevant="additions">
              {shownEvents.map((e) => (
                <LogLine key={e.seq} e={e} logins={logins} readme={readmeFor(e, payer.data?.rows)} />
              ))}
            </ol>
          ) : (
            <div className="blankslate">
              <CircleDot size={24} aria-hidden="true" />
              <h3>Not started</h3>
              <p>
                {live
                  ? "Run month-end to settle this period. Events stream here as they happen."
                  : "Play the recorded run to watch each step. This is a recorded simulation."}
              </p>
            </div>
          )}
          {done ? (
            <div className="box-row row" style={{ justifyContent: "space-between" }}>
              <span>Statements are ready for both sides.</span>
              <Link className="btn btn-sm" href={`/statements/${period}`}>
                Open statement
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function LogLine({ e, logins, readme }: { e: RunEvent; logins: Record<string, string>; readme?: string }) {
  const who =
    e.actor === "gate"
      ? "Gate"
      : e.actor === "paypal"
        ? e.step === "allocate"
          ? "You"
          : "PayPal"
        : e.actor === "system"
          ? "Nebraska"
          : "Treasurer";
  const state: State = e.status === "running" ? "running" : e.status;
  const title = e.title.replace(/\bm\d+\b/g, (m) => logins[m] ?? m).replace(/npm:/g, "");
  const d = e.detail as Record<string, unknown>;
  const detail =
    e.step === "gate" || e.step === "decide"
      ? (d.reason as string | undefined)?.replace(/\s*SIMULATED injection:.*$/i, "")
      : e.step === "payout"
        ? `PayPal batch ${d.provider_batch_id ?? "—"} · payload ${short(String(d.payload_hash ?? ""), 6)}`
        : undefined;
  return (
    <li className={`log-line ${e.status === "rejected" ? "log-line-rejected" : e.status === "held" ? "log-line-held" : ""}`}>
      <span className="seq">{e.seq}</span>
      <span className="time">{clock(e.at)}</span>
      <span className="ico">
        <StatusIcon state={state} size={14} />
      </span>
      <span className="text">
        <span className="who-tag">{who}</span>
        {who === "You" ? title.replace(/^Grant approved on PayPal/, "approved a grant on PayPal") : title}
      </span>
      {detail ? <span className="log-detail">{detail}</span> : null}
      {readme ? (
        <span className="log-detail">
          <span className="label label-attention">Simulated injection</span> README text, rejected:{" "}
          <s className="danger">{readme}</s>
        </span>
      ) : null}
    </li>
  );
}

function holdsCount(events: RunEvent[]) {
  return events.filter((e) => e.step === "decide" && e.status === "held").length;
}

function readmeFor(e: RunEvent, rows?: { id: string; signals?: { readme?: string } }[]) {
  if (e.step !== "decide" || e.status !== "rejected" || !e.detail.untrusted_text_present) return undefined;
  return rows?.find((r) => r.id === e.detail.package)?.signals?.readme;
}
