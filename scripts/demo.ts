import { SqliteStore } from "../src/core/store";
import { Nebraska } from "../src/core/service";
import { DemoDecisionProvider } from "../src/core/decisions";
import { DemoPayments } from "../src/integrations/paypal";
import { seedDemo } from "../src/core/seed";
import { Treasurer } from "../src/core/treasurer";
import { payerView, maintainerView, auditBundle } from "../src/core/views";
import { mkdir, writeFile } from "node:fs/promises";
const store = new SqliteStore(":memory:");
const service = new Nebraska(
  store,
  new DemoDecisionProvider(),
  new DemoPayments(),
);
const period = "2026-11";
await seedDemo(service, period);
const before = payerView(await store.read(), "org_acme", period, {
  role: "admin",
  id: "demo",
  exp: Infinity,
});
console.log("SIMULATION — no PayPal money moves.");
console.table(
  before.rows.map((r) => ({
    package: r.name,
    usage: r.u,
    c: r.c,
    n: r.n,
    usd: r.cents / 100,
    status: r.status,
  })),
);
const grant = (await store.read()).grants[0];
await service.captureGrant(grant.id);
const result = await new Treasurer(service).run(period);
console.log(JSON.stringify(result, null, 2));
const again = await service.executePayout(period);
if ((await store.read()).batches.length !== 1)
  throw new Error("Duplicate batch");
const s = await store.read();
const bundle = {
  mode: "demo",
  period,
  summary: before,
  treasurer: result,
  maintainer: maintainerView(s, "m3", period, {
    role: "admin",
    id: "demo",
    exp: Infinity,
  }),
  audit: auditBundle(s, "org_acme", period, {
    role: "admin",
    id: "demo",
    exp: Infinity,
  }),
  batch: again,
  gate: s.audits.filter((a) => a.action === "payout.execute"),
  events: (await store.events()).length,
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/demo-result.json", JSON.stringify(bundle, null, 2));
console.log(
  `PASS: ${s.batches.length} immutable batch; all gate invariants passed; replay safe. Audit: artifacts/demo-result.json`,
);
await store.close();
