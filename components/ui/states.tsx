"use client";
import { AlertTriangle } from "lucide-react";

export function Loading({ label }: { label: string }) {
  return (
    <div className="stack" aria-busy="true" aria-label={label}>
      <div className="skeleton" style={{ height: 32, width: 260 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="skeleton" style={{ height: 240 }} />
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flash flash-danger" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>
        <b>Could not load.</b> {message}
      </span>
      {retry ? (
        <button className="btn btn-sm" onClick={retry} style={{ marginLeft: "auto" }}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
