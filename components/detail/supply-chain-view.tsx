"use client";
import { usePayer } from "../lib/data";
import { compact } from "../lib/format";
import { ErrorBox, Loading } from "../ui/states";

const LEVEL: Record<string, string> = { critical: "label-danger", high: "label-attention", review: "" };

/** Payer-only risk report: single maintainers, no funding, advisories. */
export function SupplyChainView() {
  const payer = usePayer();
  if (payer.error && !payer.data) return <ErrorBox message={payer.error} retry={() => void payer.reload()} />;
  if (!payer.data) return <Loading label="Loading supply chain" />;
  const risk = payer.data.risk;
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Supply chain</h1>
          <p className="page-sub">Packages your agents depend on that could break: one maintainer, no funding, or an open advisory. Only you see this.</p>
        </div>
      </div>
      <section className="box">
        <div className="box-header">
          <h2 className="box-title">
            Needs attention <span className="counter">{risk.length}</span>
          </h2>
        </div>
        {risk.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Level</th>
                  <th>Why</th>
                  <th className="r">Maintainers</th>
                  <th className="r">Dependents</th>
                  <th className="r">Known funding</th>
                  <th>Advisories</th>
                </tr>
              </thead>
              <tbody>
                {risk.map((r) => (
                  <tr key={r.packageId}>
                    <td className="strong">{r.name}</td>
                    <td>
                      <span className={`label ${LEVEL[r.level] ?? ""}`}>{r.level}</span>
                    </td>
                    <td>{r.reason}</td>
                    <td className="r">{r.maintainers ?? "unknown"}</td>
                    <td className="r">{compact(r.dependents)}</td>
                    <td className="r">{r.funding === null ? "unknown" : `$${compact(r.funding)}`}</td>
                    <td>
                      {r.advisories.length
                        ? r.advisories.map((a) => (
                            <span key={a.id} className="mono" title={a.summary}>
                              {a.id}
                            </span>
                          ))
                        : "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="blankslate">
            <h3 style={{ fontSize: 16 }}>Nothing flagged</h3>
            <p>No single-maintainer packages with broad reach, and no open advisories, this month.</p>
          </div>
        )}
      </section>
    </div>
  );
}
