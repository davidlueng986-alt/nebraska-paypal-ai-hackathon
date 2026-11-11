"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from "ag-grid-community";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Activity,
  BookOpen,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import type { payerView, maintainerView } from "@/src/core/views";
import type { Actor } from "@/src/core/auth";
import type { Audit, Batch, Currency, Grant } from "@/src/core/model";
ModuleRegistry.registerModules([AllCommunityModule]);
type Payer = ReturnType<typeof payerView>;
type Maintainer = ReturnType<typeof maintainerView>;
type Boot = {
  mode: "demo" | "sandbox";
  actor: Pick<Actor, "role" | "id" | "login">;
  orgs: { id: string; name: string; currency: Currency; status: string }[];
  maintainers: { id: string; login: string }[];
  periods: string[];
  packages: { id: string; name: string; ecosystem: string; repoUrl: string }[];
};
type Ledger = {
  batches: Batch[];
  audits: Audit[];
  events: number;
  chainHash: string;
  holds: { id: string; maintainerId: string; reason: string }[];
  webhooks: { id: string; type: string }[];
};
const fmt = (n: number, c: Currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(
    n / 100,
  );
const compact = (n: number) =>
  Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const gridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#252b34",
  headerBackgroundColor: "#f7f8fa",
  headerTextColor: "#747b87",
  borderColor: "#edf0f3",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 11,
  rowHeight: 58,
  headerHeight: 42,
  wrapperBorderRadius: 12,
  cellHorizontalPadding: 18,
  accentColor: "#6a54d9",
});
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const navPayer = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "dependencies", label: "Dependencies", icon: Boxes },
  { id: "treasury", label: "AI treasurer", icon: Sparkles },
  { id: "grants", label: "Emergency grants", icon: Heart },
  { id: "risk", label: "Supply chain", icon: ShieldCheck },
  { id: "statements", label: "Statements", icon: FileText },
];
const navMaintainer = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "claims", label: "Your packages", icon: Boxes },
  { id: "income", label: "Income & payouts", icon: Wallet },
  { id: "statements", label: "Statements", icon: FileText },
];
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Button({
  children,
  onClick,
  kind = "",
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={"button " + kind}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            aria-label="Close dialog"
            className="icon-button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Boxes size={28} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Dashboard() {
  const [boot, setBoot] = useState<Boot>();
  const [payer, setPayer] = useState<Payer>();
  const [maintainer, setMaintainer] = useState<Maintainer>();
  const [ledger, setLedger] = useState<Ledger>();
  const [role, setRole] = useState<"payer" | "maintainer">("payer");
  const [page, setPage] = useState("overview");
  const [orgId, setOrgId] = useState("org_acme");
  const [maintainerId, setMaintainerId] = useState("m3");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<Payer["rows"][number]>();
  const [budget, setBudget] = useState("500");
  const [email, setEmail] = useState("");
  const [packageId, setPackageId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [newCurrency, setNewCurrency] = useState<Currency>("USD");
  const [token, setToken] = useState("");
  const [report, setReport] = useState<unknown>();
  const [hostName, setHostName] = useState("");
  const [hostRepo, setHostRepo] = useState("");
  const [hostEmail, setHostEmail] = useState("");
  const [shareJson, setShareJson] = useState("[]");
  const [sharePkg, setSharePkg] = useState("");
  const refresh = useCallback(async () => {
    const b = await api<Boot>("bootstrap");
    setBoot(b);
    let selectedOrg = b.orgs.some((o) => o.id === orgId)
      ? orgId
      : b.orgs[0]?.id;
    let selectedMaintainer = b.maintainers.some((m) => m.id === maintainerId)
      ? maintainerId
      : (b.maintainers[0]?.id ?? b.actor.id);
    if (selectedOrg) {
      setOrgId(selectedOrg);
      const p = await api<Payer>(
        `payer?org=${encodeURIComponent(selectedOrg)}&period=${period}`,
      );
      setPayer(p);
      setBudget(String(p.org.budgetCents / 100));
    } else setPayer(undefined);
    if (b.maintainers.length) {
      setMaintainerId(selectedMaintainer);
      const m = await api<Maintainer>(
        `maintainer?id=${encodeURIComponent(selectedMaintainer)}&period=${period}`,
      );
      setMaintainer(m);
      setEmail(m.maintainer.email);
    } else setMaintainer(undefined);
    if (b.actor.role === "admin")
      setLedger(await api<Ledger>("ledger?period=" + period));
    if (b.actor.role === "maintainer") setRole("maintainer");
  }, [orgId, maintainerId, period]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("view") === "maintainer"
    )
      setRole("maintainer");
  }, []);
  async function act(fn: () => Promise<unknown>, success = "Changes saved.") {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  async function audit() {
    const b = await api<unknown>(`audit?org=${orgId}&period=${period}`);
    download(`nebraska-audit-${period}.json`, JSON.stringify(b, null, 2));
  }
  const currency = payer?.org.currency ?? "USD";
  const rows = payer?.rows ?? [];
  const nav = role === "payer" ? navPayer : navMaintainer;
  const isAdmin = boot?.actor.role === "admin";
  const title =
    page === "settings"
      ? "Workspace settings"
      : (nav.find((n) => n.id === page)?.label ?? "Overview");
  const periodLabel = new Date(period + "-01T12:00:00Z").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  const batch = ledger?.batches[0];
  const cols = useMemo<ColDef[]>(
    () => [
      {
        field: "name",
        headerName: "DEPENDENCY",
        minWidth: 210,
        flex: 1.25,
        cellRenderer: ({ data }: any) => (
          <div className="package-cell">
            <span
              className={
                "package-icon p" + rows.findIndex((r) => r.id === data.id)
              }
            >
              {data.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{data.name}</strong>
              <small>{data.ecosystem} package</small>
            </span>
          </div>
        ),
      },
      {
        field: "u",
        headerName: "USAGE",
        width: 110,
        valueFormatter: (p) => compact(p.value ?? 0),
      },
      {
        field: "c",
        headerName: "CRITICALITY",
        width: 120,
        cellRenderer: ({ value }: any) => (
          <span className="weight">{Number(value).toFixed(1)}×</span>
        ),
      },
      {
        field: "n",
        headerName: "NEED",
        width: 95,
        cellRenderer: ({ value }: any) => (
          <span className="weight purple">{Number(value).toFixed(1)}×</span>
        ),
      },
      {
        field: "cents",
        headerName: "ALLOCATION",
        width: 125,
        cellRenderer: ({ value }: any) => (
          <strong className="tabular">{fmt(value, currency)}</strong>
        ),
      },
      {
        field: "status",
        headerName: "RECIPIENT",
        width: 120,
        cellRenderer: ({ value }: any) => (
          <Badge
            tone={
              value === "Verified"
                ? "green"
                : value === "Held"
                  ? "amber"
                  : "neutral"
            }
          >
            {value === "Verified" ? (
              <Check size={11} />
            ) : value === "Held" ? (
              <LockKeyhole size={11} />
            ) : null}
            {value}
          </Badge>
        ),
      },
      {
        field: "confidence",
        headerName: "CONFIDENCE",
        width: 120,
        valueFormatter: (p) => Math.round((p.value ?? 0) * 100) + "%",
      },
    ],
    [currency, rows],
  );
  const table = (
    <div className="data-grid">
      <AgGridReact
        theme={gridTheme}
        rowData={rows}
        columnDefs={cols}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        quickFilterText={search}
        onRowClicked={(e) => setSelected(e.data)}
        getRowId={(p) => p.data.id}
        domLayout="normal"
        overlayNoRowsTemplate="No observed dependencies in this period."
      />
    </div>
  );
  const periodControl = (
    <label className="period-picker">
      <Activity size={14} />
      <select
        aria-label="Period"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      >
        {(boot?.periods ?? [period]).map((p) => (
          <option value={p} key={p}>
            {new Date(p + "-01T12:00:00Z").toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
  if (!boot)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          N<span>✳</span>
        </div>
        <h1>Nebraska</h1>
        {error ? (
          <>
            <p>{error}</p>
            <a className="button" href="/api/auth/github">
              <Github size={16} /> Sign in with GitHub
            </a>
            <Button onClick={() => setModal("login")}>Workspace sign in</Button>
          </>
        ) : (
          <p>
            <LoaderCircle className="spin" size={17} /> Connecting your
            open-source economy…
          </p>
        )}
        {modal === "login" && (
          <Modal title="Workspace sign in" onClose={() => setModal("")}>
            <p>
              Use a scoped workspace token or the administrator token configured
              on your server.
            </p>
            <input
              aria-label="Workspace access token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              kind="primary"
              onClick={() =>
                act(async () => {
                  await api("auth/token", { token });
                  setToken("");
                  setModal("");
                }, "Signed in.")
              }
            >
              Sign in
            </Button>
          </Modal>
        )}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <div className="brand-mark">
            N<span>✳</span>
          </div>
          <span>
            nebraska<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">
            {role === "payer" ? (payer?.org.name ?? "N").slice(0, 1) : "M"}
          </span>
          <span>
            <strong>
              {role === "payer"
                ? (payer?.org.name ?? "Your workspace")
                : (maintainer?.maintainer.login ?? "Maintainer")}
            </strong>
            <small>
              {role === "payer" ? "Company workspace" : "Maintainer workspace"}
            </small>
          </span>
          <ChevronDown size={15} />
        </div>
        <div className="role-switch">
          <button
            onClick={() => {
              setRole("payer");
              setPage("overview");
            }}
            className={role === "payer" ? "active" : ""}
          >
            Payer
          </button>
          <button
            onClick={() => {
              setRole("maintainer");
              setPage("overview");
            }}
            className={role === "maintainer" ? "active" : ""}
          >
            Maintainer
          </button>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => {
                setPage(item.id);
                setSearch("");
              }}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "grants" &&
              payer?.grants.some((g) => g.status === "approval_pending") ? (
                <span className="nav-count">
                  {
                    payer.grants.filter((g) => g.status === "approval_pending")
                      .length
                  }
                </span>
              ) : null}
              {item.id === "treasury" ? <span className="live-dot" /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="guard-card">
            <ShieldCheck size={20} />
            <strong>Autonomous. Accountable.</strong>
            <p>
              AI makes the decisions.
              <br />
              Code keeps the boundaries.
            </p>
            <button onClick={() => setModal("safety")}>
              Explore the safeguards <ArrowUpRight size={13} />
            </button>
          </div>
          <button
            className={
              "sidebar-link " + (page === "settings" ? "selected" : "")
            }
            onClick={() => setPage("settings")}
          >
            <Settings2 size={18} /> Settings & connections
          </button>
          <a
            className="sidebar-link"
            href="https://github.com/paypal/Agent-Toolkit"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={18} /> PayPal developer toolkit{" "}
            <ExternalLink size={12} />
          </a>
          <div className="user-chip">
            <span>AL</span>
            <div>
              <strong>
                {boot.mode === "demo"
                  ? "Alex · Demo workspace"
                  : (boot.actor.login ?? boot.actor.id)}
              </strong>
              <small>
                {boot.mode === "demo" ? "Hackathon preview" : boot.actor.role}
              </small>
            </div>
            <button
              aria-label="Sign out"
              onClick={() =>
                act(async () => {
                  await api("auth/logout", {});
                  window.location.reload();
                })
              }
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span />
              {boot.mode === "demo" ? "DEMO · SIMULATED" : "PAYPAL SANDBOX"}
            </span>
            <a href="/api/health" target="_blank" aria-label="Service health">
              <Activity size={17} />
            </a>
            <span className="avatar">AL</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {role === "payer"
                  ? "YOUR OPEN-SOURCE ECONOMY"
                  : "BUILT BY YOU. SUPPORTED BY USAGE."}
              </div>
              <h1>
                {page === "overview"
                  ? role === "payer"
                    ? "Good things, paid forward."
                    : `Your work. Its impact.`
                  : title}
              </h1>
              <p>
                {page === "overview"
                  ? role === "payer"
                    ? "Your agents build on open source. Make sure the people behind it thrive."
                    : "See where your code is used, and the income flowing back to you."
                  : "Every decision has a reason. Every dollar has a record."}
              </p>
            </div>
            <div className="heading-actions">
              {periodControl}
              {role === "payer" && isAdmin ? (
                <Button
                  kind="primary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api("treasurer", { period, execute: true }),
                      "Month-end completed. Statements updated.",
                    )
                  }
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  Run month-end
                </Button>
              ) : (
                <Button onClick={() => act(refresh, "Workspace refreshed.")}>
                  <RefreshCw size={15} />
                  Refresh
                </Button>
              )}
            </div>
          </div>
          {boot.mode === "demo" && (
            <div className="demo-strip">
              <span>
                <span className="demo-dot" />
                Interactive demo. Funding, recipient identities, AI decisions
                and transactions are simulated.
              </span>
              <button onClick={() => setPage("settings")}>
                Connect sandbox <ArrowRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCheck size={17} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {role === "payer" && !payer && page !== "settings" ? (
            <section className="panel">
              <Empty
                title="Start your open-source economy"
                detail="Create a workspace, authorize a monthly budget and connect the meter."
              />
              <Button
                kind="primary"
                onClick={() => {
                  setPage("settings");
                  setModal("org");
                }}
              >
                <Plus size={15} />
                Create workspace
              </Button>
            </section>
          ) : null}
          {role === "payer" && payer && page === "overview" && (
            <>
              <section className="metrics-grid">
                <Metric
                  label="MONTHLY BUDGET"
                  value={fmt(payer.org.budgetCents, currency)}
                  icon={<Wallet size={19} />}
                  detail={
                    <>
                      <span className="green-text">
                        <Check size={12} />{" "}
                        {payer.org.status === "active"
                          ? "Authorized"
                          : "Pending authorization"}
                      </span>
                      <button onClick={() => setModal("budget")}>
                        Manage <ArrowUpRight size={12} />
                      </button>
                    </>
                  }
                />
                <Metric
                  label="CONFIRMED FUNDING"
                  value={fmt(payer.metrics.funded, currency)}
                  icon={<ArrowDownLeft size={19} />}
                  detail={
                    <>
                      <span>Available for this period</span>
                      <span className="mini-dot green-bg" />
                    </>
                  }
                />
                <Metric
                  label="ALLOCATED TO MAINTAINERS"
                  value={fmt(payer.metrics.allocated, currency)}
                  icon={<Heart size={19} />}
                  detail={
                    <>
                      <span>
                        <strong>{payer.metrics.packages}</strong> packages
                        supported
                      </span>
                      <span className="mini-tag">{currency}</span>
                    </>
                  }
                />
                <Metric
                  label="PENDING BALANCE"
                  value={fmt(payer.metrics.carry, currency)}
                  icon={<RefreshCw size={19} />}
                  detail={
                    <>
                      <span>
                        {payer.metrics.paid
                          ? `${fmt(payer.metrics.paid, currency)} settled this period`
                          : "Held, unclaimed or awaiting payout"}
                      </span>
                    </>
                  }
                />
              </section>
              <div className="overview-columns">
                <section className="panel flow-panel">
                  <div className="section-heading">
                    <div>
                      <h2>A fairer share of the stack</h2>
                      <p>
                        Actual usage, adjusted for the people behind the code.
                      </p>
                    </div>
                    <Badge tone="purple">
                      <Sparkles size={11} /> AI weighted
                    </Badge>
                  </div>
                  <AllocationChart
                    rows={rows}
                    budget={payer.metrics.funded}
                    currency={currency}
                  />
                  <div className="chart-legend">
                    <span>
                      <i className="legend-square raw" />
                      Usage only
                    </span>
                    <span>
                      <i className="legend-square neutral" />
                      Formula, AI off
                    </span>
                    <span>
                      <i className="legend-square ai" />
                      Nebraska + AI
                    </span>
                    <button onClick={() => setModal("formula")}>
                      How it works <CircleHelp size={13} />
                    </button>
                  </div>
                  <div className="chart-insight">
                    <Sparkles size={16} />
                    <span>
                      <strong>Small team. Essential work.</strong> AI directs
                      more funding toward critical packages with fewer
                      resources.
                    </span>
                  </div>
                </section>
                <section className="panel treasurer-card">
                  <div className="section-heading">
                    <h2>Your AI treasurer</h2>
                    <span className="status-pill">
                      <span />
                      Ready
                    </span>
                  </div>
                  <div className="treasurer-orb">
                    <Sparkles size={33} />
                    <span className="orbit one" />
                    <span className="orbit two" />
                    <span className="orbit three" />
                  </div>
                  <h3>Decisions with boundaries.</h3>
                  <p>
                    From usage to payout, your treasurer handles the month.
                    Seven safeguards check every payment.
                  </p>
                  <div className="treasurer-steps">
                    <div>
                      <Check size={13} />
                      <span>
                        {payer.metrics.packages} dependency judgments recorded
                      </span>
                    </div>
                    <div>
                      <Check size={13} />
                      <span>
                        {ledger?.holds.length ?? 0} recipient
                        {ledger?.holds.length === 1 ? "" : "s"} held for review
                      </span>
                    </div>
                    <div>
                      <ShieldCheck size={14} />
                      <span>Confirmed funding is the hard limit</span>
                    </div>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => setPage("treasury")}
                  >
                    Open the decision log <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <section className="panel table-panel">
                <div className="section-heading">
                  <div>
                    <h2>Behind every import, a person.</h2>
                    <p>The dependencies your agents actually use.</p>
                  </div>
                  <div className="table-actions">
                    <span className="count-label">{rows.length} packages</span>
                    <button
                      className="icon-button"
                      aria-label="Export CSV"
                      onClick={() =>
                        window.location.assign(
                          `/api/export?org=${orgId}&period=${period}`,
                        )
                      }
                    >
                      <ArrowDownToLine size={17} />
                    </button>
                    <Button onClick={() => setPage("dependencies")}>
                      View all <ArrowUpRight size={13} />
                    </Button>
                  </div>
                </div>
                {table}
              </section>
              <div className="bottom-grid">
                <section className="impact-card">
                  <div className="impact-avatar">
                    MR<span>✳</span>
                  </div>
                  <div>
                    <div className="eyebrow">
                      ON THE OTHER SIDE OF THE PAYMENT
                    </div>
                    <h3>More time for the work that matters.</h3>
                    <p>
                      Maintenance, security fixes, thoughtful reviews. Your
                      budget pays for the people who keep your stack running.
                    </p>
                    <button
                      onClick={() => {
                        setRole("maintainer");
                        setMaintainerId("m3");
                        setPage("overview");
                      }}
                    >
                      See the maintainer view <ArrowRight size={14} />
                    </button>
                  </div>
                  <Heart className="impact-heart" size={85} />
                </section>
                <section className="panel compact-panel">
                  <div className="section-heading">
                    <h2>Needs your approval</h2>
                    <Badge tone="amber">
                      {
                        payer.grants.filter(
                          (g) => g.status === "approval_pending",
                        ).length
                      }{" "}
                      pending
                    </Badge>
                  </div>
                  {payer.grants.find((g) => g.status === "approval_pending") ? (
                    <>
                      <p className="grant-label">
                        <ShieldCheck size={16} />
                        Security response grant
                      </p>
                      <h3>
                        {payer.grants
                          .find((g) => g.status === "approval_pending")!
                          .packageId.split(":")
                          .slice(1)
                          .join(":")}
                      </h3>
                      <div className="section-heading">
                        <strong className="grant-amount">
                          {fmt(
                            payer.grants.find(
                              (g) => g.status === "approval_pending",
                            )!.cents,
                            currency,
                          )}
                        </strong>
                        <Button onClick={() => setPage("grants")}>
                          Review grant <ArrowRight size={13} />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="muted">
                      All caught up. Emergency grants always come back to you
                      for approval.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
          {role === "payer" && payer && page === "dependencies" && (
            <>
              <section className="panel table-panel">
                <div className="section-heading">
                  <div>
                    <h2>Your dependency ledger</h2>
                    <p>
                      Deterministic observations. Minimum depth per repository,
                      per month.
                    </p>
                  </div>
                  <div className="table-actions">
                    <label className="search">
                      <Search size={15} />
                      <input
                        placeholder="Find a dependency…"
                        aria-label="Search dependencies"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <Button
                      onClick={() =>
                        window.location.assign(
                          `/api/export?org=${orgId}&period=${period}`,
                        )
                      }
                    >
                      <ArrowDownToLine size={15} />
                      CSV
                    </Button>
                  </div>
                </div>
                {table}
              </section>
              <div className="info-banner">
                <Code2 size={19} />
                <p>
                  Connect the meter with agent hooks, CI or MCP. Only package
                  coordinates and salted repository hashes leave your machine.
                </p>
                <Button onClick={() => setPage("settings")}>
                  Connect a repository <ArrowRight size={14} />
                </Button>
              </div>
            </>
          )}
          {role === "payer" && page === "treasury" && (
            <>
              <div className="two-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h2>The month-end run</h2>
                    <Badge
                      tone={batch?.status === "complete" ? "green" : "purple"}
                    >
                      {batch?.status ?? "Ready to run"}
                    </Badge>
                  </div>
                  <div className="vertical-flow">
                    {[
                      [
                        "01",
                        "Observe",
                        "Deduplicate repositories and take the shallowest dependency depth.",
                      ],
                      [
                        "02",
                        "Decide",
                        "Typed AI judgments set criticality and need. Uncertain values fall back to 1.",
                      ],
                      [
                        "03",
                        "Guard",
                        "Verify recipients, confirmed funding, caps, approval and reproducibility.",
                      ],
                      [
                        "04",
                        "Settle",
                        "One immutable PayPal Payouts batch. Safe retries use the same ID.",
                      ],
                    ].map(([n, t, d]) => (
                      <div key={n}>
                        <span>{n}</span>
                        <section>
                          <h3>{t}</h3>
                          <p>{d}</p>
                        </section>
                        <Check size={15} />
                      </div>
                    ))}
                  </div>
                  <Button
                    kind="primary"
                    disabled={busy || !isAdmin}
                    onClick={() =>
                      act(
                        () => api("treasurer", { period, execute: true }),
                        "Treasurer completed the month-end run.",
                      )
                    }
                  >
                    <Sparkles size={15} />
                    Run guarded settlement
                  </Button>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>Proof, built in.</h2>
                    <ShieldCheck size={20} />
                  </div>
                  <p className="muted">
                    The journal is append-only and hash chained. Monthly
                    snapshots include usage, model judgments and the parameter
                    version.
                  </p>
                  <div className="proof-stat">
                    <span>Journal events</span>
                    <strong>{ledger?.events.toLocaleString() ?? "—"}</strong>
                  </div>
                  <div className="hash-box">
                    <small>CHAIN HEAD</small>
                    <code>
                      {ledger?.chainHash ?? "Administrator access required"}
                    </code>
                  </div>
                  <div className="hash-box">
                    <small>PAYMENT BATCH</small>
                    <code>{batch?.id ?? `nebraska-${period}`}</code>
                  </div>
                  <Button
                    onClick={() => act(audit, "Audit bundle downloaded.")}
                  >
                    <ArrowDownToLine size={15} />
                    Download recomputable audit
                  </Button>
                </section>
              </div>
              {ledger?.holds.length ? (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Recipient review queue</h2>
                    <Badge tone="amber">{ledger.holds.length} held</Badge>
                  </div>
                  {ledger.holds.map((h) => (
                    <div className="list-row" key={h.id}>
                      <span className="round-icon amber">
                        <LockKeyhole size={17} />
                      </span>
                      <div>
                        <strong>
                          {boot.maintainers.find((m) => m.id === h.maintainerId)
                            ?.login ?? h.maintainerId}
                        </strong>
                        <p>{h.reason}</p>
                      </div>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              api("holds/release", {
                                maintainerId: h.maintainerId,
                              }),
                            "Hold released by human administrator. Other eligibility checks still apply.",
                          )
                        }
                      >
                        Release after review
                      </Button>
                    </div>
                  ))}
                </section>
              ) : null}
              <section className="panel">
                <div className="section-heading">
                  <h2>Activity & rule gate</h2>
                  <span className="count-label">Most recent 100 events</span>
                </div>
                {ledger?.audits.length ? (
                  ledger.audits.slice(0, 30).map((a) => (
                    <div key={a.id} className="audit-row">
                      <span
                        className={
                          "round-icon " +
                          (a.result === "deny" ? "amber" : "purple")
                        }
                      >
                        {a.result === "deny" ? (
                          <TriangleAlert size={16} />
                        ) : (
                          <ShieldCheck size={16} />
                        )}
                      </span>
                      <div>
                        <strong>{a.action.replaceAll("_", " ")}</strong>
                        <p>
                          {a.checks.length
                            ? a.checks
                                .map((c) => `${c.id} ${c.passed ? "✓" : "✕"}`)
                                .join(" · ")
                            : "Trace recorded in the immutable journal"}
                        </p>
                      </div>
                      <span className="audit-time">
                        {new Date(a.at).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge
                        tone={
                          a.result === "deny"
                            ? "amber"
                            : a.result === "allow"
                              ? "green"
                              : "neutral"
                        }
                      >
                        {a.result}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="The next decision starts here"
                    detail="Run month-end to produce a settlement and its gate audit."
                  />
                )}
              </section>
              {batch && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Payout items</h2>
                    <Button
                      disabled={busy || boot.mode === "demo"}
                      onClick={() =>
                        act(
                          () => api("payout/sync", { batchId: batch.id }),
                          "Provider statuses refreshed.",
                        )
                      }
                    >
                      <RefreshCw size={14} />
                      Sync PayPal
                    </Button>
                  </div>
                  {batch.items.map((i) => (
                    <div className="list-row" key={i.id}>
                      <Wallet size={18} />
                      <div>
                        <strong>{i.receiver}</strong>
                        <p>{i.id}</p>
                      </div>
                      <strong>{fmt(i.cents, i.currency)}</strong>
                      <Badge tone={i.status === "SUCCESS" ? "green" : "amber"}>
                        {i.status}
                      </Badge>
                      {i.status === "UNCLAIMED" ? (
                        <Button
                          onClick={() =>
                            act(
                              () =>
                                api("payout/cancel-unclaimed", {
                                  batchId: batch.id,
                                  itemId: i.id,
                                }),
                              "Unclaimed cancellation requested.",
                            )
                          }
                        >
                          Cancel unclaimed
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {batch.lastError && (
                    <p className="alert error">{batch.lastError}</p>
                  )}
                </section>
              )}
            </>
          )}
          {role === "payer" && payer && page === "grants" && (
            <>
              <div className="info-banner">
                <ShieldCheck size={20} />
                <p>
                  Beyond the monthly mandate? You stay in control. Grants
                  require a separate PayPal approval and a completed capture
                  before they become payable.
                </p>
                {isAdmin ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => api("osv/scan", { period }),
                        "Advisories checked; eligible grant proposals updated.",
                      )
                    }
                  >
                    <RefreshCw size={14} />
                    Scan OSV
                  </Button>
                ) : null}
              </div>
              <div className="grant-grid">
                {payer.grants.map((g) => (
                  <section className="panel grant-card" key={g.id}>
                    <div className="section-heading">
                      <span className="round-icon purple">
                        <ShieldCheck size={19} />
                      </span>
                      <Badge
                        tone={
                          g.status === "captured"
                            ? "green"
                            : g.status === "declined"
                              ? "neutral"
                              : "amber"
                        }
                      >
                        {g.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <div className="eyebrow">EMERGENCY MAINTENANCE</div>
                    <h2>{g.packageId.split(":").slice(1).join(":")}</h2>
                    <div className="grant-big">{fmt(g.cents, g.currency)}</div>
                    <p>{g.reason}</p>
                    <div className="grant-meta">
                      <span>Authorization</span>
                      <strong>Separate human approval</strong>
                      <span>Settlement</span>
                      <strong>
                        {batch
                          ? "Next eligible monthly batch"
                          : "Current monthly batch"}
                      </strong>
                    </div>
                    {g.status === "approval_pending" ? (
                      <div className="grant-buttons">
                        <Button
                          kind="primary"
                          disabled={busy}
                          onClick={() =>
                            boot.mode === "demo"
                              ? setModal("grant:" + g.id)
                              : window.location.assign(g.approveUrl!)
                          }
                        >
                          Review on{" "}
                          {boot.mode === "demo" ? "demo approval" : "PayPal"}{" "}
                          <ArrowUpRight size={15} />
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            act(
                              () => api("grants/decline", { grantId: g.id }),
                              "Grant declined.",
                            )
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    ) : g.status === "captured" ? (
                      <div className="green-text">
                        <CheckCheck size={16} />
                        Capture confirmed · credited to the maintainer
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
              {!payer.grants.length && (
                <section className="panel">
                  <Empty
                    title="No emergency grants"
                    detail="OSV monitoring will propose funding when a relevant advisory affects your stack."
                  />
                </section>
              )}
            </>
          )}
          {role === "payer" && payer && page === "risk" && (
            <>
              <div className="info-banner">
                <LockKeyhole size={19} />
                <p>
                  Your supply-chain report is private to your organization. It
                  connects maintainer capacity, downstream reach and relevant
                  security advisories.
                </p>
                <Badge tone="purple">Payer benefit</Badge>
              </div>
              <div className="risk-grid">
                {payer.risk.map((r) => (
                  <section className="panel" key={r.packageId}>
                    <div className="section-heading">
                      <h2>{r.name}</h2>
                      <Badge tone={r.level === "critical" ? "red" : "amber"}>
                        {r.level}
                      </Badge>
                    </div>
                    <p>{r.reason}</p>
                    <div className="risk-stats">
                      <div>
                        <strong>{r.maintainers ?? "Unknown"}</strong>
                        <span>Maintainer{r.maintainers === 1 ? "" : "s"}</span>
                      </div>
                      <div>
                        <strong>{compact(r.dependents)}</strong>
                        <span>Downstream repositories</span>
                      </div>
                      <div>
                        <strong>
                          {r.funding === null
                            ? "Unknown"
                            : fmt(r.funding * 100)}
                        </strong>
                        <span>Known annual funding</span>
                      </div>
                    </div>
                    {r.advisories.map((v) => (
                      <div className="advisory" key={v.id}>
                        <TriangleAlert size={15} />
                        <div>
                          <strong>{v.id}</strong>
                          <p>{v.summary}</p>
                        </div>
                      </div>
                    ))}
                    <Button
                      disabled={busy || !r.advisories.length}
                      onClick={() =>
                        act(
                          () =>
                            api("grants/propose", {
                              orgId,
                              packageId: r.packageId,
                              period,
                            }),
                          "Grant proposal ready for human approval.",
                        )
                      }
                    >
                      Ask AI about an emergency grant <ArrowRight size={14} />
                    </Button>
                  </section>
                ))}
              </div>
              {!payer.risk.length && (
                <Empty
                  title="No elevated signals found"
                  detail="Resolve package metadata and scan OSV to keep this report current."
                />
              )}
            </>
          )}
          {page === "statements" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Your monthly story</h2>
                  <p>{periodLabel} · Recomputable, down to the cent.</p>
                </div>
                {role === "payer" ? (
                  <Button
                    onClick={() => act(audit, "Audit bundle downloaded.")}
                  >
                    <ArrowDownToLine size={15} />
                    Audit bundle
                  </Button>
                ) : null}
              </div>
              {(role === "payer" ? payer?.statements : maintainer?.statements)
                ?.length ? (
                (role === "payer"
                  ? payer!.statements
                  : maintainer!.statements
                ).map((s) => (
                  <article className="statement" key={s.id}>
                    <div className="statement-icon">
                      <FileText size={27} />
                    </div>
                    <Badge tone="green">
                      <Check size={11} />
                      Ledger backed
                    </Badge>
                    <h2>{periodLabel}</h2>
                    <p>{s.body}</p>
                    <div className="hash-box">
                      <small>RECOMPUTE HASH</small>
                      <code>{s.recomputeHash}</code>
                    </div>
                    <Button
                      onClick={() =>
                        download(
                          `nebraska-statement-${period}.txt`,
                          s.body + "\n\nRecompute hash: " + s.recomputeHash,
                          "text/plain",
                        )
                      }
                    >
                      <ArrowDownToLine size={15} />
                      Download statement
                    </Button>
                  </article>
                ))
              ) : (
                <Empty
                  title="A statement is on its way"
                  detail="Month-end produces a statement after allocation and settlement."
                />
              )}
            </section>
          )}
          {role === "maintainer" &&
            page === "overview" &&
            (maintainer ? (
              <>
                <section className="maintainer-hero">
                  <div>
                    <Badge tone="green">
                      <Heart size={12} />
                      Open source, supported.
                    </Badge>
                    <h2>
                      Your code goes places.
                      <br />
                      Now the support comes back.
                    </h2>
                    <p>
                      {maintainer.usage.repoCount} repositories.{" "}
                      {maintainer.usage.orgCount} paying organization
                      {maintainer.usage.orgCount === 1 ? "" : "s"}. Real time
                      for maintenance.
                    </p>
                    <div className="maintainer-total">
                      {Object.entries(maintainer.earned).map(([c, n]) => (
                        <span key={c}>
                          {fmt(n, c as Currency)}
                          <small>{c} earned this month</small>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="support-visual">
                    <div className="support-node center">
                      {maintainer.maintainer.login.slice(0, 1).toUpperCase()}
                      <Heart size={18} />
                    </div>
                    {["{ }", "⌘", "↗", "&", "+"].map((x, i) => (
                      <div key={i} className={"support-node node" + i}>
                        {x}
                      </div>
                    ))}
                    <svg viewBox="0 0 320 260">
                      <path
                        d="M160 130 L50 50 M160 130 L270 45 M160 130 L280 210 M160 130 L45 210 M160 130 L160 20"
                        fill="none"
                        stroke="#b6d2c7"
                        strokeDasharray="4 6"
                      />
                    </svg>
                  </div>
                </section>
                <section className="metrics-grid three">
                  <Metric
                    label="REPOSITORIES REACHED"
                    value={String(maintainer.usage.repoCount)}
                    icon={<Code2 size={19} />}
                    detail={<span>Salted hashes; source stays private</span>}
                  />
                  <Metric
                    label="PAYING ORGANIZATIONS"
                    value={String(maintainer.usage.orgCount)}
                    icon={<Globe size={19} />}
                    detail={
                      <span>{maintainer.usage.organizations.join(", ")}</span>
                    }
                  />
                  <Metric
                    label="RECIPIENT STATUS"
                    value={
                      maintainer.eligibility.ready
                        ? "Ready to receive"
                        : "Pending review"
                    }
                    icon={<ShieldCheck size={19} />}
                    detail={<span>{maintainer.eligibility.reason}</span>}
                  />
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>The work you make possible</h2>
                      <p>
                        Verified package ownership and your share of future
                        allocations.
                      </p>
                    </div>
                    <Button onClick={() => setPage("claims")}>
                      Manage packages <ArrowRight size={14} />
                    </Button>
                  </div>
                  {maintainer.claims.map((c) => (
                    <div className="list-row" key={c.id}>
                      <span className="package-icon p2">
                        {c.package?.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{c.package?.name ?? c.packageId}</strong>
                        <p>
                          {c.permission} verified via GitHub ·{" "}
                          {Math.round(c.share * 100)}% share
                        </p>
                      </div>
                      <Badge tone="green">
                        <Check size={11} />
                        Claimed
                      </Badge>
                    </div>
                  ))}
                </section>
                {maintainer.hold && (
                  <div className="alert warning">
                    <LockKeyhole size={20} />
                    <div>
                      <strong>Your balance is safe in the ledger.</strong>
                      <p>
                        {maintainer.hold.reason} Contact your administrator for
                        human review.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <section className="panel onboarding">
                <Github size={37} />
                <h2>Give your work a way to get paid.</h2>
                <p>
                  Sign in with GitHub, verify repository permissions, and
                  connect your PayPal email. A 14-day cooling period protects
                  every new recipient.
                </p>
                <a className="button primary" href="/api/auth/github">
                  <Github size={16} />
                  Continue with GitHub
                </a>
                <Button onClick={() => setPage("claims")}>
                  Claim a package
                </Button>
              </section>
            ))}
          {role === "maintainer" && page === "claims" && (
            <>
              <div className="two-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Claim your package</h2>
                    <Github size={22} />
                  </div>
                  <p className="muted">
                    Nebraska checks admin or maintain permissions on the
                    package’s canonical GitHub repository.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(
                        () =>
                          api("claims", {
                            packageId,
                            email,
                            ...(boot.mode === "demo" ? { maintainerId } : {}),
                          }),
                        "Ownership recorded. The 14-day cooldown applies to new claims.",
                      );
                    }}
                  >
                    <label>
                      Package
                      <select
                        required
                        value={packageId}
                        onChange={(e) => setPackageId(e.target.value)}
                      >
                        <option value="">Choose a package</option>
                        {boot.packages.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.ecosystem}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      PayPal email
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                    <Button kind="primary" type="submit" disabled={busy}>
                      <ShieldCheck size={15} />
                      Verify and claim
                    </Button>
                  </form>
                  <p className="form-note">
                    {boot.mode === "demo"
                      ? "Demo claims simulate repository verification."
                      : "Need a fresh GitHub session?"}{" "}
                    <a href="/api/auth/github">
                      Sign in with GitHub <ArrowUpRight size={11} />
                    </a>
                  </p>
                </section>
                <section className="panel">
                  <h2>A fair share, together.</h2>
                  <p className="muted">
                    Multiple maintainers split a package allocation equally by
                    default. A repository administrator can configure custom
                    proportions for future allocations.
                  </p>
                  {maintainer?.claims.map((c) => (
                    <div className="list-row" key={c.id}>
                      <Boxes size={19} />
                      <div>
                        <strong>{c.package?.name}</strong>
                        <p>Your share: {Math.round(c.share * 100)}%</p>
                      </div>
                      <Button
                        onClick={() => {
                          setSharePkg(c.packageId);
                          setShareJson(
                            JSON.stringify(
                              [{ maintainerId, share: 1 }],
                              null,
                              2,
                            ),
                          );
                          setModal("shares");
                        }}
                      >
                        Configure
                      </Button>
                    </div>
                  ))}
                  <p className="form-note">
                    Existing earned credits keep their original shares. New
                    claims and email changes enter a 14-day cooldown.
                  </p>
                </section>
              </div>
            </>
          )}
          {role === "maintainer" && page === "income" && (
            <section className="panel">
              <div className="section-heading">
                <h2>Every contribution, accounted for.</h2>
                <Badge>All periods</Badge>
              </div>
              {maintainer?.credits.length ? (
                maintainer.credits.map((c) => (
                  <div className="list-row" key={c.id}>
                    <span className="round-icon green">
                      <ArrowDownLeft size={18} />
                    </span>
                    <div>
                      <strong>
                        {c.packageId.split(":").slice(1).join(":")}
                      </strong>
                      <p>
                        {c.period} ·{" "}
                        {c.source === "grant"
                          ? "Approved emergency grant"
                          : "Usage allocation"}
                      </p>
                    </div>
                    <strong className="tabular">
                      {fmt(c.cents, c.currency)}
                    </strong>
                    <Badge
                      tone={
                        c.status === "paid"
                          ? "green"
                          : c.status === "reserved"
                            ? "purple"
                            : "amber"
                      }
                    >
                      {c.status === "available" ? "Rolling balance" : c.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <Empty
                  title="Your next chapter is funded by usage"
                  detail="Once a payer’s month closes, your package income appears here."
                />
              )}
              <div className="info-banner">
                <Wallet size={18} />
                <p>
                  Balances aggregate across paying organizations and packages.
                  The minimum payout is 10 units of each supported currency.
                  Smaller balances roll forward.
                </p>
              </div>
            </section>
          )}
          {page === "settings" && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Workspace & identity</h2>
                    <p>Keep authorization explicit and recipients verified.</p>
                  </div>
                  <Badge tone={boot.mode === "demo" ? "amber" : "green"}>
                    {boot.mode === "demo" ? "Demo mode" : "Sandbox connected"}
                  </Badge>
                </div>
                <div className="settings-grid">
                  <div>
                    <label>
                      Paying workspace
                      <select
                        aria-label="Organization"
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                      >
                        {boot.orgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} · {o.currency}
                          </option>
                        ))}
                      </select>
                    </label>
                    {isAdmin ? (
                      <Button onClick={() => setModal("org")}>
                        <Plus size={14} />
                        Create workspace
                      </Button>
                    ) : null}
                  </div>
                  <div>
                    <label>
                      Maintainer identity
                      <select
                        aria-label="Maintainer identity"
                        value={maintainerId}
                        onChange={(e) => setMaintainerId(e.target.value)}
                      >
                        {boot.maintainers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.login}
                          </option>
                        ))}
                      </select>
                    </label>
                    <a className="button" href="/api/auth/github">
                      <Github size={15} />
                      Verify with GitHub
                    </a>
                  </div>
                </div>
                {payer && (
                  <div className="privacy-setting">
                    <div>
                      <strong>Public organization name</strong>
                      <p>
                        Let maintainers see your organization’s name. Counts are
                        always visible; names are private by default.
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={payer.org.publicName}
                      aria-label="Public organization name"
                      className={"toggle " + (payer.org.publicName ? "on" : "")}
                      onClick={() =>
                        act(
                          () =>
                            api("org/privacy", {
                              orgId,
                              publicName: !payer.org.publicName,
                            }),
                          "Privacy preference updated.",
                        )
                      }
                    >
                      <span />
                    </button>
                  </div>
                )}
              </section>
              <div className="two-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Monthly mandate</h2>
                    <CreditCard size={21} />
                  </div>
                  <p className="muted">
                    A quantity-based PayPal subscription. One unit equals one{" "}
                    {currency} per month. Changes require renewed PayPal
                    consent.
                  </p>
                  <div className="budget-display">
                    {fmt(payer?.org.budgetCents ?? 0, currency)}
                    <small>/ month</small>
                  </div>
                  <div className="inline-actions">
                    <Button kind="primary" onClick={() => setModal("budget")}>
                      Set budget <ArrowUpRight size={14} />
                    </Button>
                    <Button
                      disabled={busy || !payer?.org.subscriptionId}
                      onClick={() =>
                        act(
                          () => api("subscription/cancel", { orgId }),
                          "Subscription cancelled. Confirmed credits remain accounted for.",
                        )
                      }
                    >
                      Cancel subscription
                    </Button>
                  </div>
                  <p className="form-note">
                    Currencies settle in separate pools. No automatic FX
                    conversion.
                  </p>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>Recipient settings</h2>
                    <ShieldCheck size={21} />
                  </div>
                  {maintainer ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(
                          () => api("recipient", { maintainerId, email }),
                          "Email updated. Review hold and 14-day cooldown applied.",
                        );
                      }}
                    >
                      <label>
                        PayPal email
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={busy || email === maintainer.maintainer.email}
                      >
                        Update recipient
                      </Button>
                      <label>
                        Verified fiscal host
                        <select
                          value={maintainer.maintainer.hostId ?? ""}
                          onChange={(e) =>
                            act(
                              () =>
                                api("recipient/host", {
                                  maintainerId,
                                  hostId: e.target.value || null,
                                }),
                              "Fiscal-host authorization updated. 14-day cooldown applied.",
                            )
                          }
                        >
                          <option value="">Receive directly</option>
                          {maintainer.hosts.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="form-note">
                        Selecting a host authorizes it to receive your future
                        payouts. Host identity is verified by a human
                        administrator.
                      </p>
                    </form>
                  ) : (
                    <p className="muted">
                      Claim a package to set your recipient details.
                    </p>
                  )}
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Connect your coding workflow</h2>
                    <p>
                      Deterministic hooks and CI first. MCP fills in the gaps.
                    </p>
                  </div>
                  <Badge tone="purple">
                    <Code2 size={12} />
                    npm · Python · Rust · Go
                  </Badge>
                </div>
                <div className="connection-grid">
                  <div>
                    <span className="round-icon purple">
                      <Code2 size={22} />
                    </span>
                    <h3>Agent hooks & CLI</h3>
                    <p>
                      Scan imports, lockfile changes and SBOMs after your coding
                      session.
                    </p>
                    <pre>
                      <code>
                        NEBRASKA_ORG_ID={orgId}
                        {"\n"}NEBRASKA_REPO_SALT=your-private-salt{"\n"}npm run
                        meter -- --root /your/repo
                      </code>
                    </pre>
                  </div>
                  <div>
                    <span className="round-icon green">
                      <Github size={22} />
                    </span>
                    <h3>GitHub Action</h3>
                    <p>
                      Run after merge with a scoped organization token. Source
                      code stays in CI.
                    </p>
                    <pre>
                      <code>
                        uses: ./path/to/nebraska{"\n"}with:{"\n"} org-id:{" "}
                        {orgId}
                        {"\n"} endpoint: YOUR_NEBRASKA_URL
                      </code>
                    </pre>
                  </div>
                  <div>
                    <span className="round-icon amber">
                      <Boxes size={22} />
                    </span>
                    <h3>MCP server</h3>
                    <p>
                      Give your agent two tools: record_usage and budget_status.
                    </p>
                    <pre>
                      <code>
                        {"{"}"command": "npm",{"\n"} "args": ["run", "mcp"]{"}"}
                      </code>
                    </pre>
                  </div>
                </div>
                {isAdmin && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        const r = await api<{ token: string }>("tokens", {
                          orgId,
                          days: 30,
                        });
                        setToken(r.token);
                        setModal("token");
                      }, "Scoped token created. Keep it private.")
                    }
                  >
                    <LockKeyhole size={14} />
                    Create scoped meter token
                  </Button>
                )}
              </section>
              {isAdmin && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Operations & reconciliation</h2>
                      <p>
                        PayPal reporting and optional AI Toolkit are read-only.
                        Money moves only through the rule gate.
                      </p>
                    </div>
                  </div>
                  <div className="inline-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          setReport(
                            await api("reconcile", { period, toolkit: false }),
                          );
                          setModal("report");
                        }, "Read-only reconciliation completed.")
                      }
                    >
                      <RefreshCw size={15} />
                      Reconcile PayPal
                    </Button>
                    <Button
                      disabled={busy || boot.mode === "demo"}
                      onClick={() =>
                        act(async () => {
                          setReport(
                            await api("reconcile", { period, toolkit: true }),
                          );
                          setModal("report");
                        }, "Toolkit cross-check completed.")
                      }
                    >
                      AI Toolkit cross-check <ExternalLink size={14} />
                    </Button>
                    <Button onClick={() => setModal("host")}>
                      <Plus size={14} />
                      Verify fiscal host
                    </Button>
                    <Button onClick={() => setModal("resolve")}>
                      <Search size={14} />
                      Resolve package metadata
                    </Button>
                  </div>
                  <p className="form-note">
                    External services require server-side credentials. See
                    .env.example and the sandbox runbook. Live payments are not
                    enabled.
                  </p>
                </section>
              )}
            </>
          )}
          <footer>
            <span className="footer-brand">✳ nebraska</span>
            <span>Open source, paid forward.</span>
            <button onClick={() => setModal("safety")}>
              <ShieldCheck size={13} />
              Bounded by code · Settled through PayPal
            </button>
          </footer>
        </main>
      </div>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(undefined)}>
          <Badge tone="purple">{selected.ecosystem}</Badge>
          <p>{selected.reason || "No AI judgments recorded yet."}</p>
          <div className="detail-metrics">
            <div>
              <small>Usage</small>
              <strong>{selected.u}</strong>
            </div>
            <div>
              <small>Criticality</small>
              <strong>{selected.c}×</strong>
            </div>
            <div>
              <small>Need</small>
              <strong>{selected.n}×</strong>
            </div>
            <div>
              <small>Allocation</small>
              <strong>{fmt(selected.cents, currency)}</strong>
            </div>
          </div>
          <div className="hash-box">
            <small>CONFIDENCE</small>
            <strong>{Math.round(selected.confidence * 100)}%</strong>
            <p>
              Below 80% confidence, weights revert to 1.0. Confidence is a
              routing signal, never the safety boundary.
            </p>
          </div>
          {selected.repoUrl && (
            <a
              className="button"
              href={selected.repoUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Github size={15} />
              Source repository <ExternalLink size={13} />
            </a>
          )}
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal === "formula"
              ? "Fairness, made reproducible."
              : modal === "safety"
                ? "Seven safeguards. Zero shortcuts."
                : modal === "budget"
                  ? "Authorize a monthly budget"
                  : modal === "org"
                    ? "Create a workspace"
                    : modal === "host"
                      ? "Verify a fiscal host"
                      : modal === "shares"
                        ? "Configure maintainer shares"
                        : modal === "token"
                          ? "Your scoped meter token"
                          : modal === "report"
                            ? "Read-only reconciliation"
                            : modal === "resolve"
                              ? "Resolve package metadata"
                              : "Simulated PayPal approval"
          }
          onClose={() => setModal("")}
        >
          {modal === "formula" && (
            <>
              <div className="formula">wᵢ = √uᵢ × cᵢ × nᵢ</div>
              <p>
                Usage is the sum of 0.5ᵈ across repositories, taking each
                package’s shallowest depth once per month. AI sets criticality
                and need between 0.5 and 2.0.
              </p>
              <p>
                Each package is capped at max(25%, 2/K) of the confirmed pool.
                Each allocation rounds down to a cent; remaining cents roll into
                the next month. Unclaimed funds return to their original payer
                after six months.
              </p>
              <Badge>
                Parameters v1.0.0 · initial policy, not empirically calibrated
              </Badge>
            </>
          )}
          {modal === "safety" && (
            <div className="safety-list">
              {[
                [
                  "I1",
                  "Verified recipients",
                  "Repository permissions, 14-day cooldowns and review holds.",
                ],
                [
                  "I2",
                  "Confirmed money only",
                  "Total allocations cannot exceed actual funding receipts.",
                ],
                [
                  "I3",
                  "Per-package cap",
                  "No package exceeds max(25%, 2/K) of the recurring pool.",
                ],
                [
                  "I4",
                  "One immutable batch",
                  "Same period, same IDs, same payload. No duplicate payment.",
                ],
                [
                  "I5",
                  "Typed decisions",
                  "Fixed questions, strict ranges and conservative fallbacks.",
                ],
                [
                  "I6",
                  "Human authorization",
                  "Extra grants require separate PayPal approval and capture.",
                ],
                [
                  "I7",
                  "Recomputable proof",
                  "Hash-chained journal, frozen snapshots and model versions.",
                ],
              ].map(([n, t, d]) => (
                <div key={n}>
                  <Badge tone="green">{n}</Badge>
                  <section>
                    <strong>{t}</strong>
                    <p>{d}</p>
                  </section>
                </div>
              ))}
            </div>
          )}
          {modal === "budget" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  const s = await api<{ id: string; approveUrl: string }>(
                    "subscription",
                    { orgId, quantity: Number(budget) },
                  );
                  if (boot.mode === "demo") setModal("subscription:" + s.id);
                  else window.location.assign(s.approveUrl);
                }, "Approval requested. Budget changes only after consent.");
              }}
            >
              <p>
                Choose a whole-number monthly amount in {currency}. PayPal
                records your consent. Only completed charges become available
                for allocation.
              </p>
              <label>
                Monthly budget ({currency})
                <input
                  type="number"
                  required
                  min="1"
                  max="100000"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </label>
              <Button kind="primary" type="submit" disabled={busy}>
                Continue to {boot.mode === "demo" ? "demo approval" : "PayPal"}{" "}
                <ArrowUpRight size={14} />
              </Button>
            </form>
          )}
          {modal === "org" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  const o = await api<{ id: string }>("orgs", {
                    name: orgName,
                    currency: newCurrency,
                    publicName: false,
                  });
                  setOrgId(o.id);
                  setModal("");
                }, "Workspace created. Authorize a budget to begin.");
              }}
            >
              <label>
                Workspace name
                <input
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </label>
              <label>
                Settlement currency
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value as Currency)}
                >
                  {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <p className="form-note">
                Separate pools per currency. Recipient country and PayPal
                account capabilities must support the selected currency.
              </p>
              <Button kind="primary" type="submit" disabled={busy}>
                Create workspace
              </Button>
            </form>
          )}
          {modal.startsWith("grant:") && (
            <>
              <Badge tone="amber">SIMULATION · NO MONEY MOVES</Badge>
              <p>
                This represents the payer’s separate PayPal approval. In sandbox
                mode, approval occurs exclusively on PayPal’s own page.
              </p>
              <Button
                kind="primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api("demo/approve", {
                      kind: "grant",
                      id: modal.slice(6),
                    });
                    setModal("");
                  }, "Simulated capture completed. Grant credited for the next eligible batch.")
                }
              >
                <Check size={15} />
                Approve simulated grant
              </Button>
            </>
          )}
          {modal.startsWith("subscription:") && (
            <>
              <Badge tone="amber">SIMULATION · NO MONEY MOVES</Badge>
              <p>
                Authorize {budget} {currency} per month. The demo will record a
                simulated completed charge in the next open period.
              </p>
              <Button
                kind="primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api("demo/approve", {
                      kind: "subscription",
                      id: modal.slice(13),
                    });
                    setModal("");
                  }, "Simulated subscription consent recorded.")
                }
              >
                Approve simulated subscription
              </Button>
            </>
          )}
          {modal === "token" && (
            <>
              <p>
                This token can access only the selected organization. Store it
                in your CI secret manager. It expires in 30 days.
              </p>
              <textarea
                readOnly
                value={token}
                aria-label="Scoped API token"
                rows={5}
              />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  setNotice("Token copied.");
                }}
              >
                <Copy size={14} />
                Copy token
              </Button>
            </>
          )}
          {modal === "report" && (
            <pre className="report-json">{JSON.stringify(report, null, 2)}</pre>
          )}
          {modal === "shares" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await api("claims/shares", {
                    packageId: sharePkg,
                    shares: JSON.parse(shareJson),
                  });
                  setModal("");
                }, "Future allocation shares updated.");
              }}
            >
              <p>
                List every verified claimant. Unique shares must sum to 1.
                Repository administrator permission is required.
              </p>
              <textarea
                rows={8}
                value={shareJson}
                aria-label="Maintainer shares JSON"
                onChange={(e) => setShareJson(e.target.value)}
              />
              <Button kind="primary" type="submit" disabled={busy}>
                Save future shares
              </Button>
            </form>
          )}
          {modal === "host" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await api("hosts", {
                    name: hostName,
                    email: hostEmail,
                    repoUrl: hostRepo,
                    attestation:
                      "I verified the fiscal host identity and its authority to receive these funds",
                  });
                  setModal("");
                }, "Fiscal host verified. Maintainers must authorize it separately.");
              }}
            >
              <p>
                Before submitting, verify the fiscal host’s identity and its
                authority to receive funds. This action records your
                administrator attestation.
              </p>
              <label>
                Host name
                <input
                  required
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                />
              </label>
              <label>
                Host PayPal email
                <input
                  required
                  type="email"
                  value={hostEmail}
                  onChange={(e) => setHostEmail(e.target.value)}
                />
              </label>
              <label>
                Public host URL
                <input
                  required
                  type="url"
                  value={hostRepo}
                  onChange={(e) => setHostRepo(e.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" required />I verified the host identity
                and authority to receive these funds.
              </label>
              <Button kind="primary" type="submit" disabled={busy}>
                Record verification
              </Button>
            </form>
          )}
          {modal === "resolve" && (
            <ResolveForm
              busy={busy}
              onSubmit={(b) =>
                act(async () => {
                  await api("packages/resolve", b);
                  setModal("");
                }, "Package metadata resolved from public sources.")
              }
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <article className="metric">
      <div className="metric-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}
function AllocationChart({
  rows,
  budget,
  currency,
}: {
  rows: Payer["rows"];
  budget: number;
  currency: Currency;
}) {
  const total = rows.reduce((n, r) => n + r.u, 0);
  const sqrtTotal = rows.reduce((n, r) => n + Math.sqrt(r.u), 0);
  const cap = Math.max(0.25, 2 / Math.max(1, rows.length));
  let neutral = rows.map((r) => (budget * Math.sqrt(r.u)) / sqrtTotal);
  for (let step = 0; step < rows.length; step++) {
    let extra = 0;
    const uncapped = neutral.map((n) => n < budget * cap);
    neutral = neutral.map((n) => {
      if (n > budget * cap) {
        extra += n - budget * cap;
        return budget * cap;
      }
      return n;
    });
    const weight = rows.reduce(
      (n, r, i) => n + (uncapped[i] ? Math.sqrt(r.u) : 0),
      0,
    );
    if (!extra || !weight) break;
    neutral = neutral.map(
      (n, i) => n + (uncapped[i] ? (extra * Math.sqrt(rows[i].u)) / weight : 0),
    );
  }
  const max = Math.max(...rows.map((r) => (budget * r.u) / total), 1);
  return (
    <div className="allocation-chart">
      <div className="y-axis">
        {[1, 0.75, 0.5, 0.25, 0].map((x) => (
          <span key={x}>
            {fmt(Math.round(max * x), currency).replace(".00", "")}
          </span>
        ))}
      </div>
      <div className="plot">
        <div className="grid-lines">
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} />
          ))}
        </div>
        <div className="bar-groups">
          {rows.map((r, i) => (
            <div className="bar-group" key={r.id}>
              <div className="bars">
                <div
                  className="bar raw"
                  title={`Usage only: ${fmt((budget * r.u) / total, currency)}`}
                  style={{ height: `${(100 * r.u * budget) / total / max}%` }}
                />
                <div
                  className="bar neutral"
                  title={`AI off: ${fmt(Math.floor(neutral[i]), currency)}`}
                  style={{ height: `${(100 * neutral[i]) / max}%` }}
                />
                <div
                  className="bar ai"
                  title={`Nebraska: ${fmt(r.cents, currency)}`}
                  style={{ height: `${(100 * r.cents) / max}%` }}
                >
                  <span>{fmt(r.cents, currency).replace(".00", "")}</span>
                </div>
              </div>
              <strong>{r.name}</strong>
              <small>{compact(r.u)} usage units</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function ResolveForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (b: { ecosystem: string; name: string; version: string }) => void;
}) {
  const [ecosystem, setEcosystem] = useState("npm");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ecosystem, name, version });
      }}
    >
      <label>
        Ecosystem
        <select
          value={ecosystem}
          onChange={(e) => setEcosystem(e.target.value)}
        >
          {["npm", "pypi", "cargo", "go"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Package name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Version
        <input
          required
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
      </label>
      <Button kind="primary" type="submit" disabled={busy}>
        Resolve from public sources
      </Button>
    </form>
  );
}
