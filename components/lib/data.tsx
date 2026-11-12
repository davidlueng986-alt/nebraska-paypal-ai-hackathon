"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { Boot, Ledger, Maintainer, Payer } from "./types";
import payerFixture from "@/fixtures/payer-month.json";
import maintainerFixture from "@/fixtures/maintainer-income.json";

export type Source = "live" | "fixture";
type Ctx = {
  ready: boolean;
  source: Source;
  mode: "demo" | "sandbox" | "fixture";
  boot?: Boot;
  period: string;
  orgId: string;
  maintainerId: string;
  setMaintainerId: (id: string) => void;
  demoOverrides?: Record<string, unknown>;
  bootError?: string;
};
const DataContext = createContext<Ctx | null>(null);
const FIXTURE_PERIOD = (payerFixture as { period: string }).period;

function wantsFixture() {
  try {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("data") ?? (q.get("replay") === "fixture" ? "fixture" : null);
    if (d === "fixture" || d === "live") sessionStorage.setItem("nebraska.data", d);
    return (d ?? sessionStorage.getItem("nebraska.data")) === "fixture";
  } catch {
    return false;
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Ctx, "setMaintainerId">>({
    ready: false,
    source: "live",
    mode: "demo",
    period: FIXTURE_PERIOD,
    orgId: "org_acme",
    maintainerId: "m3",
  });
  useEffect(() => {
    if (wantsFixture()) {
      setState((s) => ({ ...s, ready: true, source: "fixture", mode: "fixture" }));
      return;
    }
    (async () => {
      try {
        const [health, boot] = await Promise.all([
          api<{ mode: "demo" | "sandbox"; demoOverrides?: Record<string, unknown> }>("health"),
          api<Boot>("bootstrap"),
        ]);
        const maintainer =
          boot.actor.role === "maintainer"
            ? boot.actor.id
            : (boot.maintainers.find((m) => m.id === "m3")?.id ?? boot.maintainers[0]?.id ?? "");
        setState({
          ready: true,
          source: "live",
          mode: health.mode,
          boot,
          period: [...boot.periods].sort().at(-1) ?? FIXTURE_PERIOD,
          orgId: boot.orgs[0]?.id ?? "",
          maintainerId: maintainer,
          demoOverrides: health.demoOverrides ?? boot.demoOverrides,
        });
      } catch (e) {
        setState((s) => ({
          ...s,
          ready: true,
          source: "fixture",
          mode: "fixture",
          bootError: e instanceof Error ? e.message : "API unavailable",
        }));
      }
    })();
  }, []);
  const setMaintainerId = useCallback(
    (maintainerId: string) => setState((s) => ({ ...s, maintainerId })),
    [],
  );
  return (
    <DataContext.Provider value={{ ...state, setMaintainerId }}>{children}</DataContext.Provider>
  );
}
export function useData() {
  const c = useContext(DataContext);
  if (!c) throw new Error("DataProvider missing");
  return c;
}

export type Resource<T> = {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => Promise<void>;
};
/** Loads live data, or the matching fixture when the app is in fixture mode. */
export function useResource<T>(
  key: string | null,
  live: () => Promise<T>,
  fixture: () => T | undefined,
  pollMs = 0,
): Resource<T> {
  const { ready, source } = useData();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const liveRef = useRef(live);
  const fixtureRef = useRef(fixture);
  liveRef.current = live;
  fixtureRef.current = fixture;
  const reload = useCallback(async () => {
    if (!ready || key === null) return;
    if (source === "fixture") {
      setData(fixtureRef.current());
      setLoading(false);
      return;
    }
    try {
      setData(await liveRef.current());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [ready, source, key]);
  useEffect(() => {
    void reload();
    if (!pollMs || source === "fixture") return;
    const t = setInterval(() => void reload(), pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs, source]);
  return { data, error, loading: loading || !ready, reload };
}

export function usePayer(pollMs = 0) {
  const { orgId, period } = useData();
  return useResource<Payer>(
    orgId ? `payer:${orgId}:${period}` : null,
    () => api<Payer>(`payer?org=${encodeURIComponent(orgId)}&period=${period}`),
    () => payerFixture as unknown as Payer,
    pollMs,
  );
}
export function useMaintainer(id?: string) {
  const { maintainerId, period } = useData();
  const mid = id ?? maintainerId;
  return useResource<Maintainer>(
    mid ? `maintainer:${mid}:${period}` : null,
    () => api<Maintainer>(`maintainer?id=${encodeURIComponent(mid)}&period=${period}`),
    () => (mid === "m3" ? (maintainerFixture as unknown as Maintainer) : undefined),
  );
}
export function useLedger() {
  const { period, boot } = useData();
  return useResource<Ledger>(
    boot?.actor.role === "admin" ? `ledger:${period}` : null,
    () => api<Ledger>(`ledger?period=${period}`),
    () => undefined,
  );
}
