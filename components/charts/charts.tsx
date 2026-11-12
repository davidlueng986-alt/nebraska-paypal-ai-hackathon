"use client";
import { fmt, num } from "../lib/format";
import { DEEMPHASIS } from "./colors";
import { ChartBox, Legend, ticks, useTooltip, useWidth } from "./frame";

const pct = (v: number) => `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%`;

/* ───────────────────────── 1. Tall segmented bar: one whole ───────────────────────── */

export type Part = { id: string; label: string; cents: number; color: string; ink: string; pattern?: boolean };

export function MoneyStatus({ parts, currency, title }: { parts: Part[]; currency: string; title: string }) {
  const { box, layer, mark } = useTooltip();
  const live = parts.filter((p) => p.cents > 0);
  const total = live.reduce((s, p) => s + p.cents, 0) || 1;
  return (
    <ChartBox
      id="chart-status"
      title={title}
      note={<>{fmt(total, currency)} in total. Hover a block for the amount.</>}
      chart={
        <div className="chart-wrap" ref={box}>
          <div className="tall-bar" role="group" aria-label={title}>
            {live.map((p) => {
              const share = p.cents / total;
              const text = `${p.label}: ${fmt(p.cents, currency)} (${pct(share)})`;
              return (
                <div
                  key={p.id}
                  {...mark(
                    <>
                      <b>{p.label}</b>
                      <div className="tip-row">
                        <span>{fmt(p.cents, currency)}</span>
                        <span>{pct(share)}</span>
                      </div>
                    </>,
                    text,
                  )}
                  style={{
                    flex: `${p.cents} 0 0`,
                    background: p.pattern
                      ? `repeating-linear-gradient(135deg, ${p.color} 0 2px, #fff 2px 6px)`
                      : p.color,
                    color: p.ink,
                  }}
                >
                  {share >= 0.12 ? (
                    <span style={p.pattern ? { background: "#fff", padding: "0 4px", borderRadius: 3 } : undefined}>
                      {fmt(p.cents, currency)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Legend items={live.map((p) => ({ label: p.label, color: p.color }))} />
          {layer}
        </div>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Part</th>
              <th className="r">Amount</th>
              <th className="r">Share</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td className="r">{fmt(p.cents, currency)}</td>
                <td className="r">{pct(p.cents / total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

/* ───────────────────────── 2. Grouped horizontal bars: AI off vs on ───────────────────────── */

export type Compare = { id: string; name: string; off: number; on: number; color: string };

export function AiCompareBars({ rows, currency }: { rows: Compare[]; currency: string }) {
  const stripe = `linear-gradient(90deg, ${rows.map((r, i) => `${r.color} ${(i / rows.length) * 100}% ${((i + 1) / rows.length) * 100}%`).join(", ")})`;
  const [ref, width] = useWidth<HTMLDivElement>();
  const { box, layer, mark } = useTooltip();
  const data = [...rows].sort((a, b) => b.on - a.on);
  const labelW = 120,
    valueW = 72,
    bar = 14,
    gap = 2,
    group = bar * 2 + gap,
    rowGap = 18,
    top = 4,
    axisH = 22;
  const plotW = Math.max(80, width - labelW - valueW);
  const max = Math.max(...data.flatMap((r) => [r.on, r.off]), 1);
  const tk = ticks(max / 100, 4).map((t) => t * 100);
  const xMax = tk[tk.length - 1];
  const x = (v: number) => labelW + (v / xMax) * plotW;
  const height = top + data.length * (group + rowGap) - rowGap + axisH + 8;
  const path = (y: number, w: number) => {
    const r = Math.min(4, w);
    return `M${labelW},${y}h${Math.max(0, w - r)}a${r},${r} 0 0 1 ${r},${r}v${bar - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${Math.max(0, w - r)}z`;
  };
  return (
    <ChartBox
      id="chart-ai"
      title="With and without AI judgment"
      note="Each package's amount if the AI's criticality and need are ignored (c = n = 1), next to the amount it actually gets."
      legend={
        <Legend
          items={[
            { label: "Without AI", color: DEEMPHASIS },
            { label: "With AI, in each package's color", color: stripe },
          ]}
        />
      }
      chart={
        <div className="chart-wrap" ref={(el) => { ref.current = el; box.current = el; }}>
          <svg width={width} height={height} role="group" aria-label="Amount per package with and without AI">
            {tk.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={x(t)} x2={x(t)} y1={0} y2={height - axisH} />
                <text className="axis-text" x={x(t)} y={height - 6} textAnchor="middle">
                  {fmt(t, currency).replace(/\.00$/, "")}
                </text>
              </g>
            ))}
            <line className="base-line" x1={labelW} x2={labelW} y1={0} y2={height - axisH} />
            {data.map((r, i) => {
              const y = top + i * (group + rowGap);
              const delta = r.on - r.off;
              const body = (
                <>
                  <b>{r.name}</b>
                  <div className="tip-row">
                    <span>Without AI</span>
                    <span>{fmt(r.off, currency)}</span>
                  </div>
                  <div className="tip-row">
                    <span>With AI</span>
                    <span>{fmt(r.on, currency)}</span>
                  </div>
                  <div className="tip-row">
                    <span>Change</span>
                    <span>
                      {delta >= 0 ? "+" : "−"}
                      {fmt(Math.abs(delta), currency)}
                    </span>
                  </div>
                </>
              );
              return (
                <g
                  key={r.id}
                  {...mark(body, `${r.name}: ${fmt(r.off, currency)} without AI, ${fmt(r.on, currency)} with AI`)}
                >
                  <rect className="hit" x={0} y={y - 4} width={width} height={group + 8} rx={4} />
                  <text className="mark-text-strong" x={labelW - 10} y={y + group / 2 + 4} textAnchor="end">
                    {r.name}
                  </text>
                  <path d={path(y, x(r.off) - labelW)} fill={DEEMPHASIS} />
                  <text className="axis-text" x={x(r.off) + 6} y={y + bar - 3}>
                    {fmt(r.off, currency)}
                  </text>
                  <path d={path(y + bar + gap, x(r.on) - labelW)} fill={r.color} />
                  <text className="mark-text-strong" x={x(r.on) + 6} y={y + bar * 2 + gap - 3}>
                    {fmt(r.on, currency)}
                  </text>
                </g>
              );
            })}
          </svg>
          {layer}
        </div>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Package</th>
              <th className="r">Without AI</th>
              <th className="r">With AI</th>
              <th className="r">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.name}</td>
                <td className="r">{fmt(r.off, currency)}</td>
                <td className="r">{fmt(r.on, currency)}</td>
                <td className="r">
                  {r.on - r.off >= 0 ? "+" : "−"}
                  {fmt(Math.abs(r.on - r.off), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

/* ───────────────────────── 3. Stacked share bars: usage vs money ───────────────────────── */

export type ShareSeries = { id: string; name: string; color: string; ink: string };
export type ShareRow = { id: string; label: string; sub: string; values: Record<string, number>; format: (v: number) => string };

export function ShareBars({ series, rows }: { series: ShareSeries[]; rows: ShareRow[] }) {
  const { box, layer, mark } = useTooltip();
  return (
    <ChartBox
      id="chart-share"
      title="Share of usage vs share of money"
      note="Heavy use does not take the whole budget: the square root and the cap spread it out, then the AI shifts it toward critical, under-funded packages."
      legend={<Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
      chart={
        <div className="chart-wrap" ref={box}>
          {rows.map((row) => {
            const total = series.reduce((s, x) => s + (row.values[x.id] ?? 0), 0) || 1;
            return (
              <div className="share-row" key={row.id}>
                <div className="share-label">
                  <b>{row.label}</b>
                  <small>{row.sub}</small>
                </div>
                <div className="tall-bar" role="group" aria-label={row.label}>
                  {series.map((s) => {
                    const v = row.values[s.id] ?? 0;
                    if (v <= 0) return null;
                    const share = v / total;
                    return (
                      <div
                        key={s.id}
                        {...mark(
                          <>
                            <b>{s.name}</b>
                            <div className="tip-row">
                              <span>{row.label}</span>
                              <span>{pct(share)}</span>
                            </div>
                            <div className="tip-row">
                              <span>Value</span>
                              <span>{row.format(v)}</span>
                            </div>
                          </>,
                          `${row.label}, ${s.name}: ${pct(share)}`,
                        )}
                        style={{ flex: `${v} 0 0`, background: s.color, color: s.ink }}
                      >
                        {share >= 0.09 ? pct(share) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {layer}
        </div>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Package</th>
              {rows.map((r) => (
                <th className="r" key={r.id}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id}>
                <td className="strong">{s.name}</td>
                {rows.map((r) => {
                  const total = series.reduce((t, x) => t + (r.values[x.id] ?? 0), 0) || 1;
                  return (
                    <td className="r" key={r.id}>
                      {pct((r.values[s.id] ?? 0) / total)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

/* ───────────────────────── 4. Line: weight grows with √usage ───────────────────────── */

export type Point = { id: string; name: string; u: number; color: string };

export function SqrtCurve({ points }: { points: Point[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { box, layer, mark, hide } = useTooltip();
  const left = 40,
    right = 16,
    top = 12,
    bottom = 28,
    height = 260;
  const uMax = Math.max(...points.map((p) => p.u), 1) * 1.08;
  const xt = ticks(uMax, 4);
  const xMax = xt[xt.length - 1];
  const yMax = Math.sqrt(xMax);
  const yt = ticks(yMax, 4);
  const yTop = yt[yt.length - 1];
  const x = (u: number) => left + (u / xMax) * (width - left - right);
  const y = (w: number) => top + (1 - w / yTop) * (height - top - bottom);
  const curve = Array.from({ length: 81 }, (_, i) => {
    const u = (xMax * i) / 80;
    return `${i ? "L" : "M"}${x(u).toFixed(1)},${y(Math.sqrt(u)).toFixed(1)}`;
  }).join("");
  // Raw usage, scaled so both lines meet at the heaviest package: shows what the square root takes away.
  const heavy = Math.max(...points.map((p) => p.u), 1);
  const k = Math.sqrt(heavy) / heavy;
  const linear = `M${x(0)},${y(0)}L${x(xMax)},${y(Math.min(yTop, xMax * k))}`;
  const crossTarget = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = Math.max(0, Math.min(xMax, ((e.clientX - r.left) / r.width) * xMax));
    return u;
  };
  return (
    <ChartBox
      id="chart-sqrt"
      title="Why heavy use does not take everything"
      note="A package's weight grows with the square root of its usage. 4× the usage gives 2× the weight."
      legend={
        <Legend
          items={[
            { label: "Weight = √usage (Nebraska)", color: "#59636E" },
            { label: "If paid by raw usage", color: DEEMPHASIS },
          ]}
        />
      }
      chart={
        <div className="chart-wrap" ref={(el) => { ref.current = el; box.current = el; }}>
          <svg width={width} height={height} role="group" aria-label="Weight against usage, square-root curve">
            {yt.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
                <text className="axis-text" x={left - 8} y={y(t) + 4} textAnchor="end">
                  {num(t)}
                </text>
              </g>
            ))}
            {xt.map((t) => (
              <text key={t} className="axis-text" x={x(t)} y={height - 8} textAnchor="middle">
                {num(t)}
              </text>
            ))}
            <line className="base-line" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
            <text className="axis-text" x={width - right} y={height - 8 - 14} textAnchor="end">
              usage u →
            </text>
            <path d={linear} fill="none" stroke={DEEMPHASIS} strokeWidth={2} strokeLinecap="round" />
            <path d={curve} fill="none" stroke="#59636E" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <rect
              x={left}
              y={top}
              width={Math.max(0, width - left - right)}
              height={height - top - bottom}
              fill="transparent"
              onMouseMove={(e) => {
                const u = crossTarget(e);
                const el = e.currentTarget.ownerSVGElement?.querySelector<SVGLineElement>(".crosshair");
                if (el) {
                  el.setAttribute("x1", String(x(u)));
                  el.setAttribute("x2", String(x(u)));
                  el.style.opacity = "1";
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget.ownerSVGElement?.querySelector<SVGLineElement>(".crosshair");
                if (el) el.style.opacity = "0";
                hide();
              }}
            />
            <line className="crosshair grid-line" y1={top} y2={y(0)} style={{ opacity: 0, stroke: "#8C959F", pointerEvents: "none" }} />
            {[...points].sort((a, b) => a.u - b.u).map((p, i) => {
              const w = Math.sqrt(p.u);
              const cx = x(p.u),
                cy = y(w);
              const anchorEnd = cx > width - 120;
              // Low-usage points crowd near the origin: first label below, second level with the dot, rest above.
              const dy = i === 0 ? 18 : i === 1 ? 4 : -10;
              return (
                <g
                  key={p.id}
                  {...mark(
                    <>
                      <b>{p.name}</b>
                      <div className="tip-row">
                        <span>Usage u</span>
                        <span>{num(p.u)}</span>
                      </div>
                      <div className="tip-row">
                        <span>Weight √u</span>
                        <span>{num(w)}</span>
                      </div>
                    </>,
                    `${p.name}: usage ${num(p.u)}, weight ${num(w)}`,
                  )}
                >
                  <circle className="hit" cx={cx} cy={cy} r={14} />
                  <circle cx={cx} cy={cy} r={6} fill={p.color} stroke="#fff" strokeWidth={2} />
                  <text
                    className="mark-text-strong"
                    x={anchorEnd ? cx - 12 : cx + 10}
                    y={cy + dy}
                    textAnchor={anchorEnd ? "end" : "start"}
                  >
                    {p.name}
                  </text>
                </g>
              );
            })}
          </svg>
          {layer}
        </div>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Package</th>
              <th className="r">Usage u</th>
              <th className="r">Weight √u</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td className="strong">{p.name}</td>
                <td className="r">{num(p.u)}</td>
                <td className="r">{num(Math.sqrt(p.u))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

/* ───────────────────────── 5. Columns: dependencies by depth ───────────────────────── */

export function DepthColumns({ counts, color, source }: { counts: { depth: number; n: number }[]; color: string; source: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { box, layer, mark } = useTooltip();
  const left = 40,
    right = 8,
    top = 20,
    bottom = 44,
    height = 260;
  const max = Math.max(...counts.map((c) => c.n), 1);
  const yt = ticks(max, 4);
  const yTop = yt[yt.length - 1];
  const band = (width - left - right) / counts.length;
  const colW = Math.min(24, band * 0.6);
  const y = (v: number) => top + (1 - v / yTop) * (height - top - bottom);
  const total = counts.reduce((s, c) => s + c.n, 0);
  return (
    <ChartBox
      id="chart-depth"
      title="What the meter sees: dependencies by depth"
      note={
        <>
          {total} packages in {source}. Direct dependencies count fully; each level deeper counts half as much.
        </>
      }
      chart={
        <div className="chart-wrap" ref={(el) => { ref.current = el; box.current = el; }}>
          <svg width={width} height={height} role="group" aria-label="Packages by dependency depth">
            {yt.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
                <text className="axis-text" x={left - 8} y={y(t) + 4} textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            <line className="base-line" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
            {counts.map((c, i) => {
              const cx = left + band * i + band / 2;
              const h = y(0) - y(c.n);
              const r = Math.min(4, h);
              const x0 = cx - colW / 2;
              const d = `M${x0},${y(0)}v-${Math.max(0, h - r)}a${r},${r} 0 0 1 ${r},-${r}h${colW - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${Math.max(0, h - r)}z`;
              const weight = 0.5 ** c.depth;
              return (
                <g
                  key={c.depth}
                  {...mark(
                    <>
                      <b>Depth {c.depth}{c.depth === 0 ? " (direct)" : ""}</b>
                      <div className="tip-row">
                        <span>Packages</span>
                        <span>{c.n}</span>
                      </div>
                      <div className="tip-row">
                        <span>Counts as</span>
                        <span>{weight >= 0.01 ? num(weight, 3) : weight.toExponential(1)} per repo</span>
                      </div>
                    </>,
                    `Depth ${c.depth}: ${c.n} packages, each counts ${weight}`,
                  )}
                >
                  <rect className="hit" x={cx - band / 2} y={top} width={band} height={y(0) - top} />
                  <path d={d} fill={color} />
                  <text className="mark-text" x={cx} y={y(c.n) - 6} textAnchor="middle">
                    {c.n}
                  </text>
                  <text className="axis-text" x={cx} y={height - 26} textAnchor="middle">
                    {c.depth}
                  </text>
                  {band >= 44 ? (
                  <text className="axis-text" x={cx} y={height - 10} textAnchor="middle" style={{ fontSize: 11 }}>
                    ×{weight >= 0.1 ? num(weight, 3) : weight.toFixed(3).replace(/^0/, "")}
                  </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {layer}
        </div>
      }
      table={
        <table className="table">
          <thead>
            <tr>
              <th>Depth</th>
              <th className="r">Packages</th>
              <th className="r">Each counts as</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.depth}>
                <td>{c.depth === 0 ? "0 (direct)" : c.depth}</td>
                <td className="r">{c.n}</td>
                <td className="r">{num(0.5 ** c.depth, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}
