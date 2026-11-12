import { describe, it, expect, afterEach } from "vitest";
import { cooldownDays, demoOverrides } from "../src/core/util";
import { SqliteStore } from "../src/core/store";
import { Nebraska } from "../src/core/service";
import { DemoDecisionProvider } from "../src/core/decisions";
import { DemoPayments } from "../src/integrations/paypal";
import { seedDemo } from "../src/core/seed";
import { payerView } from "../src/core/views";

const saved = { mode: process.env.NEBRASKA_MODE, cd: process.env.DEMO_COOLDOWN_MINUTES };
afterEach(() => {
  process.env.NEBRASKA_MODE = saved.mode;
  if (saved.cd === undefined) delete process.env.DEMO_COOLDOWN_MINUTES;
  else process.env.DEMO_COOLDOWN_MINUTES = saved.cd;
});
describe("DEMO_COOLDOWN_MINUTES (sandbox-only override)", () => {
  it("is ignored outside sandbox mode", () => {
    for (const mode of ["demo", "live", "production", ""]) {
      process.env.NEBRASKA_MODE = mode;
      process.env.DEMO_COOLDOWN_MINUTES = "5";
      expect(cooldownDays()).toBe(14);
      expect(demoOverrides()).toEqual({});
    }
  });
  it("shortens the cooldown only in sandbox and is reported for the UI badge", () => {
    process.env.NEBRASKA_MODE = "sandbox";
    process.env.DEMO_COOLDOWN_MINUTES = "5";
    expect(cooldownDays()).toBeCloseTo(5 / 1440);
    expect(demoOverrides()).toEqual({ cooldownMinutes: 5 });
  });
  it("rejects invalid or longer-than-default values", () => {
    process.env.NEBRASKA_MODE = "sandbox";
    for (const v of ["0", "-3", "abc", String(14 * 1440), "1e9"]) {
      process.env.DEMO_COOLDOWN_MINUTES = v;
      expect(cooldownDays()).toBe(14);
    }
  });
});
describe("payer view", () => {
  it("returns AI-off amounts from the same frozen snapshot (C: $69.44 → $161.29)", async () => {
    const store = new SqliteStore(":memory:");
    const service = new Nebraska(store, new DemoDecisionProvider(), new DemoPayments());
    await seedDemo(service, "2026-11");
    const v = payerView(await store.read(), "org_acme", "2026-11", { role: "admin", id: "t", exp: Infinity });
    const c = v.rows.find((r) => r.id === "npm:fast-xml-parser")!;
    expect(c.cents).toBe(16129);
    expect(c.aiOffCents).toBe(6944);
    const d = v.rows.find((r) => r.id === "npm:kleur")!;
    expect(d.n).toBe(1); // injected README answer rejected live, neutral weight kept
    await store.close();
  });
});
