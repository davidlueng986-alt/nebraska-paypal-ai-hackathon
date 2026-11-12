// Invoke route handlers directly: exercises real request parsing, auth, view scoping and mutation paths.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "nebraska-api-"));
process.env.NEBRASKA_MODE = "demo";
process.env.SQLITE_PATH = join(root, "test.db");
const { GET, POST } = await import("../app/api/[...path]/route");
const { getService } = await import("../src/core/runtime");
async function call(path: string, body?: unknown) {
  const req = new Request("http://localhost:3000/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await (body === undefined ? GET : POST)(req);
  const data = await res.json();
  if (!res.ok)
    throw new Error(`${path}: HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
try {
  const boot = await call("bootstrap");
  if (boot.orgs.length !== 1) throw new Error("Seed missing");
  const scoped = await call("tokens", { orgId: "org_acme", days: 30 });
  if (!scoped.token) throw new Error("Token generation failed");
  const payer = await call("payer?org=org_acme&period=2026-11");
  if (payer.metrics.allocated !== 49999) throw new Error("Wrong allocation");
  const org = await call("orgs", { name: "Euro lab", currency: "EUR" });
  const sub = await call("subscription", { orgId: org.id, quantity: 100 });
  await call("demo/approve", { kind: "subscription", id: sub.id });
  const grant = payer.grants[0];
  await call("demo/approve", { kind: "grant", id: grant.id });
  await call("treasurer", { period: "2026-11", execute: true });
  await call("treasurer", { period: "2026-11", execute: true });
  const run = await call("month-end/runs", { period: "2026-11" });
  const read = async (q = "") => {
    const r = await GET(
      new Request(`http://localhost:3000/api/month-end/runs/${run.run_id}/events${q}`),
    );
    if (!r.headers.get("content-type")?.includes("text/event-stream"))
      throw new Error("Month-end stream is not SSE");
    return (await r.text())
      .split("\n\n")
      .filter((b) => b.includes("event: month-end"))
      .map((b) => JSON.parse(b.split("data: ")[1]));
  };
  const live = await read();
  if (live.filter((e) => e.step === "gate").length !== 7)
    throw new Error("Expected one gate event per invariant");
  if (live.at(-1).title !== "Month-end run complete") throw new Error("Run did not complete");
  if (JSON.stringify(await read("?replay=1&delay_ms=0")) !== JSON.stringify(live))
    throw new Error("Replay differs from the recorded stream");
  const ledger = await call("ledger?period=2026-11");
  if (ledger.batches.length !== 1) throw new Error("Duplicate batch");
  const m = await call("maintainer?id=m3&period=2026-11");
  if (m.earned.USD !== 41129) throw new Error("Wrong maintainer income");
  const audit = await call("audit?org=org_acme&period=2026-11");
  if (audit.closes.length !== 1) throw new Error("Missing audit");
  const csv = await GET(
    new Request("http://localhost:3000/api/export?org=org_acme&period=2026-11"),
  );
  if (!csv.headers.get("content-type")?.includes("text/csv"))
    throw new Error("CSV export failed");
  const host = await call("hosts", {
    name: "Verified test host",
    email: "host@example.com",
    repoUrl: "https://example.com/host",
    attestation:
      "I verified the fiscal host identity and its authority to receive these funds",
  });
  await call("recipient/host", { maintainerId: "m3", hostId: host.id });
  const updated = await call("maintainer?id=m3&period=2026-11");
  if (updated.eligibility.ready) throw new Error("Host cooldown bypassed");
  console.log(
    "PASS: API bootstrap, payer, EUR subscription, grant capture, settlement replay, maintainer income, CSV, audit, month-end SSE stream and replay, fiscal-host cooldown.",
  );
} finally {
  await getService().store.close();
  await rm(root, { recursive: true, force: true });
}
