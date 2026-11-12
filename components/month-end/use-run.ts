"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import runFixture from "@/fixtures/month-end-run.json";
import { api } from "../lib/api";
import type { Ledger, RunEvent } from "../lib/types";
import { dwell, isTerminal } from "./steps";

export type Phase = "idle" | "starting" | "running" | "done" | "error";

/**
 * Plays a month-end run at a human pace. Live: POST a run, read its SSE
 * stream, and pace the events client-side. Fixture: the same player fed from
 * fixtures/month-end-run.json, so recordings are deterministic.
 */
export function useRun({ live, period, speed }: { live: boolean; period: string; speed: number }) {
  const [shown, setShown] = useState<RunEvent[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [runId, setRunId] = useState<string>();
  const [priorBatches, setPriorBatches] = useState<string[]>([]);
  const queue = useRef<RunEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = useRef<EventSource | null>(null);
  const playing = useRef(false);

  const pump = useCallback(() => {
    if (playing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    playing.current = true;
    setShown((s) => [...s, next]);
    if (isTerminal(next)) {
      setPhase("done");
      playing.current = false;
      return;
    }
    timer.current = setTimeout(() => {
      playing.current = false;
      pump();
    }, dwell(next) / Math.max(0.1, speed));
  }, [speed]);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    source.current?.close();
    source.current = null;
    playing.current = false;
    queue.current = [];
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    stop();
    setShown([]);
    setError(undefined);
    setPhase("starting");
    if (!live) {
      const f = runFixture as { run_id: string; events: RunEvent[] };
      setRunId(f.run_id);
      queue.current = [...f.events];
      setPhase("running");
      pump();
      return;
    }
    try {
      const ledger = await api<Ledger>(`ledger?period=${period}`).catch(() => null);
      setPriorBatches(ledger?.batches.map((b) => b.id) ?? []);
      const r = await api<{ run_id: string; events: string }>("month-end/runs", { period, execute: true });
      setRunId(r.run_id);
      setPhase("running");
      const es = new EventSource(r.events);
      source.current = es;
      es.addEventListener("month-end", (m) => {
        const e = JSON.parse((m as MessageEvent).data) as RunEvent;
        queue.current.push(e);
        if (isTerminal(e)) es.close();
        pump();
      });
      es.addEventListener("error", (m) => {
        const data = (m as MessageEvent).data;
        if (data) {
          setError("The run stream could not be read.");
          setPhase("error");
        }
        es.close();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run");
      setPhase("error");
    }
  }, [live, period, pump, stop]);

  return { shown, phase, error, runId, priorBatches, start };
}
