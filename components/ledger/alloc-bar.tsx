"use client";
import { fmt } from "../lib/format";
import type { PayerRow } from "../lib/types";

export const SERIES = ["#1A7F37", "#0969DA", "#8250DF", "#BF8700", "#59636E", "#CF222E"];

/** One bar, one segment per package, width = share of the money. */
export function AllocBar({
  rows,
  currency,
  onPick,
}: {
  rows: PayerRow[];
  currency: string;
  onPick: (id: string) => void;
}) {
  const live = [...rows].filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents);
  const total = live.reduce((s, r) => s + r.cents, 0) || 1;
  return (
    <div>
      <div className="alloc-bar" role="img" aria-label={live.map((r) => `${r.name} ${fmt(r.cents, currency)}`).join(", ")}>
        {live.map((r, i) => (
          <span key={r.id} style={{ width: `${(r.cents / total) * 100}%`, background: SERIES[i % SERIES.length] }} />
        ))}
      </div>
      <ul className="alloc-legend">
        {live.map((r, i) => (
          <li key={r.id}>
            <button onClick={() => onPick(r.id)} aria-label={`${r.name}, ${fmt(r.cents, currency)}. Why this amount`}>
              <span className="swatch" style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />
              <span className="strong">{r.name}</span>
              <span className="num">{fmt(r.cents, currency)}</span>
              <span className="muted num">{((r.cents / total) * 100).toFixed(1)}%</span>
              {r.status === "Held" ? <span className="label label-attention">Held</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
