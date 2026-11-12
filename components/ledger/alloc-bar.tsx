"use client";
import { fmt } from "../lib/format";
import type { PayerRow } from "../lib/types";
import { packageColors } from "../charts/colors";

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
  const color = packageColors(rows.map((r) => r.id));
  return (
    <div>
      <div className="alloc-bar" role="img" aria-label={live.map((r) => `${r.name} ${fmt(r.cents, currency)}`).join(", ")}>
        {live.map((r) => (
          <span key={r.id} style={{ width: `${(r.cents / total) * 100}%`, background: color(r.id) }} />
        ))}
      </div>
      <ul className="alloc-legend">
        {live.map((r) => (
          <li key={r.id}>
            <button onClick={() => onPick(r.id)} aria-label={`${r.name}, ${fmt(r.cents, currency)}. Why this amount`}>
              <span className="swatch" style={{ background: color(r.id) }} aria-hidden="true" />
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
