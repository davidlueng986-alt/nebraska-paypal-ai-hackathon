"use client";
import { useState } from "react";
import { api } from "../lib/api";

/**
 * Sandbox only: the workspace administrator signs in with ADMIN_API_TOKEN.
 * The server sets an httpOnly session cookie (POST /api/auth/admin); the token is never stored in the browser.
 * If no workspace exists yet, one is created so the budget can be approved on PayPal from Setup.
 */
export function SignInView() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("Acme AI");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("auth/admin", { token });
      setToken("");
      const boot = await api<{ orgs: { id: string }[] }>("bootstrap");
      if (!boot.orgs.length) await api("orgs", { name: name.trim() || "Acme AI", currency: "USD" });
      window.location.assign("/start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Workspace sign in</h1>
          <p className="page-sub">For the workspace administrator. Maintainers sign in with GitHub when they claim a package.</p>
        </div>
      </div>
      <form className="box" onSubmit={submit}>
        <div className="box-body stack" style={{ gap: 12 }}>
          <div className="form-group">
            <label htmlFor="admin-token">Admin token</label>
            <input
              id="admin-token"
              className="form-control"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="workspace">Workspace name (used only if none exists yet)</label>
            <input id="workspace" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error ? <p role="alert" style={{ color: "var(--danger, #D1242F)", margin: 0 }}>{error}</p> : null}
          <div>
            <button className="btn btn-primary" type="submit" disabled={busy || !token}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
