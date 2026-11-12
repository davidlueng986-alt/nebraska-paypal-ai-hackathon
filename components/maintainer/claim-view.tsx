"use client";
import { CheckCircle2, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useData, useMaintainer } from "../lib/data";
import { pkgName } from "../lib/format";
import { MaintainerPicker } from "./maintainer-picker";

const COOLDOWN_DAYS = 14;

/** How do I get paid? GitHub sign-in → pick package → PayPal email → cooldown. */
export function ClaimView() {
  const { boot, mode, source, maintainerId, demoOverrides } = useData();
  const m = useMaintainer();
  const [pkg, setPkg] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  useEffect(() => {
    if (m.data) setEmail((e) => e || m.data!.maintainer.email);
  }, [m.data]);
  useEffect(() => {
    if (!m.loading && !pkg) setPkg(m.data?.claims[0]?.packageId ?? boot?.packages[0]?.id ?? "");
  }, [boot, m.data, m.loading, pkg]);

  const login = m.data?.maintainer.login ?? boot?.maintainers.find((x) => x.id === maintainerId)?.login;
  const signedIn = mode === "demo" ? !!login : boot?.actor.role === "maintainer";
  const claimed = !!m.data?.claims.length;
  const hasEmail = !!m.data?.maintainer.email;
  const cooldown = m.data?.cooldownDays ?? COOLDOWN_DAYS;
  const shortened = demoOverrides && Object.keys(demoOverrides).some((k) => /cooldown/i.test(k));
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function claim() {
    setBusy(true);
    setError("");
    setDone("");
    try {
      await api("claims", { packageId: pkg, email, ...(mode === "demo" ? { maintainerId } : {}) });
      setDone(`Claimed ${pkgName(pkg)}.`);
      await m.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  const Num = ({ n, ok }: { n: number; ok: boolean }) => (
    <span className="step-num">{ok ? <CheckCircle2 size={16} aria-label="Done" /> : n}</span>
  );

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Claim a package</h1>
          <p className="page-sub">Prove you maintain it on GitHub, add a PayPal email, and Nebraska pays you every month.</p>
        </div>
        <MaintainerPicker />
      </div>
      <section className="box" style={{ maxWidth: 760 }}>
        <ol className="steps">
          <li className={`step ${signedIn ? "step-done" : ""}`}>
            <Num n={1} ok={signedIn} />
            <div>
              <h2 className="step-title">Sign in with GitHub</h2>
              <div className="step-body">
                {mode === "demo" ? (
                  <p>
                    Demo: acting as <b>{login ?? "—"}</b>, a fictional maintainer. In sandbox mode this is a real GitHub
                    sign-in that checks you have admin rights on the repository.
                  </p>
                ) : signedIn ? (
                  <p>
                    Signed in as <b>{boot?.actor.login ?? login}</b>.
                  </p>
                ) : (
                  <a className="btn btn-primary" href="/api/auth/github">
                    <LogIn size={16} aria-hidden="true" /> Sign in with GitHub
                  </a>
                )}
              </div>
            </div>
          </li>
          <li className={`step ${claimed ? "step-done" : ""}`}>
            <Num n={2} ok={claimed} />
            <div style={{ width: "100%" }}>
              <h2 className="step-title">Choose your package and PayPal email</h2>
              <div className="step-body" style={{ justifyItems: "stretch", maxWidth: 420 }}>
                <div className="form-group">
                  <label htmlFor="pkg">Package</label>
                  <select id="pkg" className="form-control" value={pkg} onChange={(e) => setPkg(e.target.value)}>
                    {(boot?.packages ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.ecosystem})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="email">PayPal email</label>
                  <input
                    id="email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!email && !validEmail}
                    autoComplete="email"
                  />
                  <p className="form-hint">Changing this email later restarts the 14-day cooldown.</p>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !signedIn || !validEmail || !pkg || source !== "live"}
                    onClick={() => void claim()}
                  >
                    {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
                    Claim {pkg ? pkgName(pkg) : "package"}
                  </button>
                  {done ? <span className="success">{done}</span> : null}
                </div>
                {error ? <p className="danger">{error}</p> : null}
                {claimed ? (
                  <p className="muted">
                    Your claims: {m.data!.claims.map((c) => `${pkgName(c.packageId)} (${Math.round(c.share * 100)}%)`).join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
          <li className={`step ${hasEmail && cooldown === 0 ? "step-done" : ""}`}>
            <Num n={3} ok={hasEmail && cooldown === 0} />
            <div>
              <h2 className="step-title">Wait for the {COOLDOWN_DAYS}-day cooldown</h2>
              <div className="step-body">
                <p>
                  New or changed payout emails wait {COOLDOWN_DAYS} days before money moves. This protects you if someone
                  takes over your account.
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`label label-large ${cooldown === 0 ? "label-success" : "label-attention"}`}>
                    {cooldown === 0 ? "Cooldown complete, payouts enabled" : `${cooldown} of ${COOLDOWN_DAYS} days left`}
                  </span>
                  {shortened ? <span className="label label-large label-attention">Demo: cooldown shortened</span> : null}
                </div>
                {cooldown === 0 ? (
                  <Link className="btn" href="/maintainer">
                    See your income
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
