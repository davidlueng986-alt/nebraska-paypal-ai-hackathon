"use client";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/data";
import { fmt, pkgName } from "../lib/format";
import type { Grant, PayerRow } from "../lib/types";
import { Byline } from "../ui/byline";

/** Where the approve button goes. It never approves in-app: it leaves for the PayPal page. */
export function approvalHref(url: string, back: string, id?: string) {
  if (!url.startsWith("/")) return url; // real PayPal sandbox approval page
  const u = new URL(url, "http://local");
  if (id && !u.searchParams.get("id") && !u.searchParams.get("grant")) u.searchParams.set("id", id);
  u.searchParams.set("return", back);
  return u.pathname + u.search;
}

const STATUS: Record<string, { text: string; cls: string }> = {
  approval_pending: { text: "Waiting for you", cls: "label-attention" },
  captured: { text: "Approved on PayPal", cls: "label-success" },
  declined: { text: "Declined", cls: "" },
};

export function GrantAsk({ grant, row, onChange }: { grant: Grant; row?: PayerRow; onChange?: () => void }) {
  const { source } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const advisory = row?.signals?.vulnerabilities?.[0];
  const pending = grant.status === "approval_pending";
  const back = typeof window === "undefined" ? "/approvals" : window.location.pathname;
  const st = STATUS[grant.status] ?? { text: grant.status.replace(/_/g, " "), cls: "" };
  return (
    <div className="box-row">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="row-grow stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="row-title">One-time grant for {pkgName(grant.packageId)}</span>
            <span className={`label ${st.cls}`}>{st.text}</span>
          </div>
          <p>{grant.reason}</p>
          {advisory ? (
            <p className="muted">
              Advisory <span className="mono">{advisory.id}</span>: {advisory.summary}
            </p>
          ) : null}
          <p className="muted row" style={{ gap: 8 }}>
            {pending ? (
              <>
                <Byline who="treasurer">proposed this</Byline>
                <span>·</span>
                <Byline who="gate">I6: needs your approval on PayPal</Byline>
              </>
            ) : grant.status === "captured" ? (
              <>
                <Byline who="you">approved on PayPal</Byline>
                {grant.captureId ? <span className="mono">{grant.captureId}</span> : null}
              </>
            ) : null}
          </p>
        </div>
        <div className="stack" style={{ gap: 8, justifyItems: "end" }}>
          <span className="row-amount">{fmt(grant.cents, grant.currency)}</span>
          {pending ? (
            <div className="row" style={{ gap: 8 }}>
              {source === "live" ? (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("grants/decline", { grantId: grant.id });
                      onChange?.();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not decline");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Decline
                </button>
              ) : null}
              {source === "live" && grant.approveUrl ? (
                <a className="btn btn-primary" href={approvalHref(grant.approveUrl, back)}>
                  Approve on PayPal <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : (
                <span className="btn btn-primary" aria-disabled="true" title="Needs the live API">
                  Approve on PayPal <ExternalLink size={14} aria-hidden="true" />
                </span>
              )}
            </div>
          ) : null}
          {error ? <p className="danger">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
