"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type Tip = { x: number; y: number; body: ReactNode } | null;

/** Hover/focus tooltip shared by every chart. Marks call show()/hide(). */
export function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = useCallback((e: { clientX: number; clientY: number } | Element, body: ReactNode) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    let x: number, y: number;
    if (e instanceof Element) {
      const b = e.getBoundingClientRect();
      x = b.left + b.width / 2 - r.left;
      y = b.top - r.top;
    } else {
      x = e.clientX - r.left;
      y = e.clientY - r.top;
    }
    setTip({ x, y, body });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const layer = tip ? (
    <div
      className="chart-tip"
      role="status"
      style={{
        left: Math.min(Math.max(tip.x, 90), (box.current?.clientWidth ?? 400) - 90),
        top: tip.y,
      }}
    >
      {tip.body}
    </div>
  ) : null;
  /** Props for one interactive mark: pointer and keyboard both show the tooltip. */
  const mark = (body: ReactNode, label: string) => ({
    tabIndex: 0,
    role: "img" as const,
    "aria-label": label,
    onMouseMove: (e: React.MouseEvent) => show(e, body),
    onMouseLeave: hide,
    onFocus: (e: React.FocusEvent) => show(e.currentTarget, body),
    onBlur: hide,
  });
  return { box, layer, mark, hide };
}

/** A box with a title and a Chart / Table switch, so nothing depends on color or hover alone. */
export function ChartBox({
  id,
  title,
  note,
  legend,
  chart,
  table,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="box chart-box" aria-labelledby={id}>
      <div className="box-header">
        <h2 className="box-title" id={id}>
          {title}
        </h2>
        <div className="segmented segmented-sm" role="group" aria-label={`${title}: view`}>
          <button aria-pressed={view === "chart"} onClick={() => setView("chart")}>
            Chart
          </button>
          <button aria-pressed={view === "table"} onClick={() => setView("table")}>
            Table
          </button>
        </div>
      </div>
      {note ? <p className="chart-note">{note}</p> : null}
      {view === "chart" ? (
        <div className="box-body">
          {legend}
          {chart}
        </div>
      ) : (
        <div className="table-scroll">{table}</div>
      )}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; hollow?: boolean }[] }) {
  return (
    <ul className="chart-legend" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label}>
          <span
            className="swatch"
            aria-hidden="true"
            style={i.hollow ? { background: "transparent", boxShadow: `inset 0 0 0 2px ${i.color}` } : { background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Clean tick values: 0 and 4–5 round steps up to max. */
export function ticks(max: number, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}
