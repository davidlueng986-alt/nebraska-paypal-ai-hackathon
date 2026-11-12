import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SqliteStore } from "../src/core/store";
import { Nebraska } from "../src/core/service";
import { DemoDecisionProvider } from "../src/core/decisions";
import { DemoPayments } from "../src/integrations/paypal";
import { seedDemo } from "../src/core/seed";
import { readRun, runMonthEnd, isTerminal } from "../src/core/monthend";

const period = "2026-11";
const steps = ["snapshot", "decide", "allocate", "gate", "payout", "webhook", "statement"];
async function setup() {
  const store = new SqliteStore(":memory:");
  const service = new Nebraska(store, new DemoDecisionProvider(), new DemoPayments());
  await seedDemo(service, period);
  await service.captureGrant((await store.read()).grants[0].id);
  return { store, service };
}
const schema = JSON.parse(readFileSync("contracts/month-end-run.schema.json", "utf8"));
function conforms(e: any) {
  const p = schema.properties;
  expect(Object.keys(e).every((k) => k in p)).toBe(true);
  for (const k of schema.required) expect(e).toHaveProperty(k);
  expect(p.actor.enum).toContain(e.actor);
  expect(p.step.enum).toContain(e.step);
  expect(p.status.enum).toContain(e.status);
  if (e.invariant) expect(p.invariant.enum).toContain(e.invariant);
  expect(typeof e.detail).toBe("object");
}
describe("month-end event stream", () => {
  it("emits ordered, gap-free events and one gate event per invariant", async () => {
    const { store, service } = await setup();
    const events = await runMonthEnd(service, period, "run_a");
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    events.forEach(conforms);
    const rank = events.map((e) => steps.indexOf(e.step));
    expect(rank).toEqual([...rank].sort((a, b) => a - b));
    expect(events.filter((e) => e.step === "gate").map((e) => e.invariant)).toEqual(
      ["I1", "I2", "I3", "I4", "I5", "I6", "I7"],
    );
    expect(isTerminal(events.at(-1)!)).toBe(true);
    expect(events.at(-1)!.title).toBe("Month-end run complete");
    expect(events.some((e) => e.step === "decide" && e.status === "held")).toBe(true);
    expect(events.some((e) => e.step === "webhook")).toBe(true);
    await store.close();
  });
  it("persists events: reading a finished run is idempotent and a rerun reuses the same batch", async () => {
    const { store, service } = await setup();
    const first = await runMonthEnd(service, period, "run_b");
    expect(await readRun(service, "run_b")).toEqual(first);
    expect(await readRun(service, "run_b")).toEqual(first);
    const again = await runMonthEnd(service, period, "run_c");
    const s = await store.read();
    expect(s.batches).toHaveLength(1);
    expect(s.batches[0].id).toBe("nebraska-2026-11");
    expect(again.find((e) => e.step === "payout")?.detail.batch_id).toBe("nebraska-2026-11");
    expect(s.runEvents.filter((e) => e.run_id === "run_b")).toHaveLength(first.length);
    await store.close();
  });
  it("published fixture conforms to the contract and keeps the worked example", () => {
    const f = JSON.parse(readFileSync("fixtures/month-end-run.json", "utf8"));
    f.events.forEach(conforms);
    const alloc = f.events.find((e: any) => e.step === "allocate" && e.detail.allocations);
    expect(Object.fromEntries(alloc.detail.allocations.map((a: any) => [a.packageId, a.cents]))).toEqual({
      "npm:next": 9677,
      "npm:zod": 21774,
      "npm:fast-xml-parser": 16129,
      "npm:kleur": 2419,
    });
    expect(f.events.filter((e: any) => e.step === "gate")).toHaveLength(7);
  });
});
