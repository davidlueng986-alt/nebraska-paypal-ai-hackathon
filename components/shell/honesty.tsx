"use client";
import { FlaskConical } from "lucide-react";
import { useData } from "../lib/data";

/** Always-visible honest labels. Never hidden in captures. */
export function Honesty() {
  const { mode, demoOverrides, ready } = useData();
  if (!ready) return null;
  const cooldown = demoOverrides && Object.keys(demoOverrides).some((k) => /cooldown/i.test(k));
  return (
    <div className="banner" role="note" aria-label="About this data">
      <div className="container banner-row">
        <FlaskConical size={16} aria-hidden="true" />
        {mode === "sandbox" ? (
          <span>
            <b>PayPal sandbox.</b> Test money only.
          </span>
        ) : (
          <span>
            <b>{mode === "fixture" ? "Recorded simulation." : "Simulation."}</b> Simulated data, fictional people, no
            real money.
          </span>
        )}
        {cooldown ? <span className="label label-attention">Demo: cooldown shortened</span> : null}
      </div>
    </div>
  );
}
