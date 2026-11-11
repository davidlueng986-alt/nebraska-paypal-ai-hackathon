import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scan,
  npmLock,
  pnpmLock,
  pythonLock,
  cargoLock,
  goMod,
  sbomPackages,
  imports,
} from "../src/meter";
import { SqliteStore } from "../src/core/store";
import { Nebraska } from "../src/core/service";
import { DemoPayments } from "../src/integrations/paypal";
import { DemoDecisionProvider } from "../src/core/decisions";
import { seedDemo } from "../src/core/seed";
import { actor, sign, orgAccess } from "../src/core/auth";
import { maintainerView, payerView } from "../src/core/views";
import { recipient } from "../src/core/gate";
import { hash, now } from "../src/core/util";
import { readOnlyTools } from "../src/integrations/toolkit";
const period = "2026-11";
async function fixture() {
  const store = new SqliteStore(":memory:");
  const service = new Nebraska(
    store,
    new DemoDecisionProvider(),
    new DemoPayments(),
  );
  await seedDemo(service, period);
  return { store, service };
}
afterEach(() => vi.unstubAllEnvs());
describe("P0/P1/P2 meters", () => {
  it("resolves nested npm graph with hoisting and minimum dependency depths", () => {
    const graph = npmLock({
      packages: {
        "": { dependencies: { a: "1" } },
        "node_modules/a": { version: "1", dependencies: { b: "1" } },
        "node_modules/b": { version: "1", dependencies: { c: "1" } },
        "node_modules/c": { version: "1" },
      },
    });
    expect(graph.map((p) => [p.name, p.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });
  it("parses pnpm v9 direct and transitive coordinates", () => {
    expect(
      pnpmLock({
        importers: {
          ".": { dependencies: { "@scope/a": { version: "1.0.0" } } },
        },
        snapshots: {
          "@scope/a@1.0.0": { dependencies: { b: "2.0.0" } },
          "b@2.0.0": {},
        },
      }),
    ).toEqual([
      { ecosystem: "npm", name: "@scope/a", version: "1.0.0", depth: 0 },
      { ecosystem: "npm", name: "b", version: "2.0.0", depth: 1 },
    ]);
  });
  it("parses Poetry/uv graphs and Rust dependency graphs", () => {
    expect(
      pythonLock(
        {
          package: [
            { name: "httpx", version: "1", dependencies: { anyio: "*" } },
            { name: "anyio", version: "2" },
          ],
        },
        { project: { dependencies: ["httpx>=1"] } },
      ).map((p) => [p.name, p.depth]),
    ).toEqual([
      ["httpx", 0],
      ["anyio", 1],
    ]);
    expect(
      cargoLock(
        {
          package: [
            { name: "serde", version: "1", dependencies: ["serde_derive 1.0"] },
            { name: "serde_derive", version: "1" },
          ],
        },
        { dependencies: { serde: "1" } },
      ).map((p) => p.depth),
    ).toEqual([0, 1]);
  });
  it("supports Go direct/indirect markers and two standard SBOM formats", () => {
    expect(
      goMod(
        "module test\nrequire (\n github.com/a/b v1.0.0\n golang.org/x/net v0.1.0 // indirect\n)\n",
      ).map((p) => p.depth),
    ).toEqual([0, 1]);
    expect(
      sbomPackages({ components: [{ purl: "pkg:npm/%40scope/a@1.2.3" }] })[0]
        .name,
    ).toBe("@scope/a");
    expect(
      sbomPackages({
        packages: [
          {
            externalRefs: [
              { referenceType: "purl", referenceLocator: "pkg:pypi/httpx@0.1" },
            ],
          },
        ],
      })[0].ecosystem,
    ).toBe("pypi");
  });
  it("finds imports without counting builtins or relative paths", () => {
    expect(
      imports(
        'import x from "zod"; require("node:fs"); import y from "./a"; import("@scope/b/path")',
        "a.ts",
      ),
    ).toEqual(["zod", "@scope/b"]);
    expect(
      imports("from pydantic import BaseModel\nimport httpx", "a.py"),
    ).toEqual(["pydantic", "httpx"]);
    expect(imports("use serde::Deserialize;", "a.rs")).toEqual(["serde"]);
  });
  it("emits only the strict event schema, never source text or repository paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "nebraska-meter-"));
    try {
      await writeFile(
        join(root, "package-lock.json"),
        JSON.stringify({
          packages: {
            "": { dependencies: { zod: "1" } },
            "node_modules/zod": { version: "1" },
          },
        }),
      );
      await writeFile(
        join(root, "app.ts"),
        '// HIGHLY_SECRET_SOURCE\nimport {z} from "zod";',
      );
      const events = await scan({
        root,
        orgId: "o",
        salt: "private",
        sessionId: "s",
        agent: "test",
        at: "2026-11-01T12:00:00Z",
      });
      expect(events.map((e) => e.signal)).toContain("import_graph");
      const text = JSON.stringify(events);
      expect(text).not.toContain("HIGHLY_SECRET_SOURCE");
      expect(text).not.toContain(root);
      expect(events[0].repo_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      const again = await scan({
        root,
        orgId: "o",
        salt: "private",
        sessionId: "s",
        agent: "test",
        at: "2026-11-01T13:00:00Z",
      });
      expect(events[0].event_id).toBe(again[0].event_id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
describe("full-scope accounting policies", () => {
  it("aggregates real funded credits across payer organizations while isolating currencies", async () => {
    const { store, service } = await fixture();
    const add = async (orgId: string, cents: number) =>
      store.transact((tx) => {
        tx.put("orgs", {
          id: orgId,
          name: orgId,
          currency: "EUR",
          budgetCents: cents,
          status: "active",
          publicName: false,
          owner: "x",
        });
        tx.put("receipts", {
          id: "receipt:" + orgId,
          orgId,
          period,
          currency: "EUR",
          cents,
          providerId: "DEMO-" + orgId,
          kind: "subscription",
          receivedAt: now(),
        });
        const e = tx.state.usages.find((e) => e.package.name === "zod")!;
        tx.put("usages", {
          ...e,
          id: "usage:" + orgId,
          event_id: "usage:" + orgId,
          org_id: orgId,
        });
      });
    await add("eur1", 600);
    await service.closePeriod(period);
    expect(
      (await store.read()).credits.find((c) => c.orgId === "eur1")?.status,
    ).toBe("available");
    await add("eur2", 500);
    await service.closePeriod(period);
    const batch = await service.executePayout(period);
    expect(
      batch.items.find((i) => i.maintainerId === "m2" && i.currency === "EUR")
        ?.cents,
    ).toBe(1100);
    expect(
      batch.items.find((i) => i.maintainerId === "m2" && i.currency === "USD")
        ?.cents,
    ).toBe(21774);
    expect(batch.items.filter((i) => i.maintainerId === "m2")).toHaveLength(2);
    await store.close();
  });
  it("recycles only unclaimed six-month-old credits into the original payer’s next pool", async () => {
    const { store, service } = await fixture();
    await store.transact((tx) =>
      tx.put("credits", {
        id: "unclaimed",
        orgId: "org_acme",
        packageId: "npm:unclaimed",
        period: "2026-05",
        currency: "USD",
        cents: 500,
        source: "allocation",
        sourceId: "older",
        status: "available",
        at: "2026-05-01T00:00:00Z",
      }),
    );
    expect(await service.recycleUnclaimed("2026-10")).toEqual({ cents: 0 });
    expect(await service.recycleUnclaimed("2026-11")).toEqual({ cents: 500 });
    expect(await service.recycleUnclaimed("2026-11")).toEqual({ cents: 0 });
    const r = (await store.read()).receipts.find(
      (r) => r.providerId === "unclaimed",
    );
    expect(r).toMatchObject({
      orgId: "org_acme",
      period: "2026-12",
      cents: 500,
    });
    await store.close();
  });
  it("splits multi-maintainer allocations exactly by custom shares", async () => {
    const { store, service } = await fixture();
    await store.transact((tx) => {
      const claim = tx.state.claims.find((c) => c.packageId === "npm:zod")!;
      tx.put("claims", { ...claim, share: 0.7 });
      tx.put("claims", { ...claim, id: "co", maintainerId: "m3", share: 0.3 });
      tx.put("receipts", {
        id: "dec",
        orgId: "org_acme",
        period: "2026-12",
        currency: "USD",
        cents: 10001,
        providerId: "DEMO-DEC",
        kind: "subscription",
        receivedAt: now(),
      });
      const e = tx.state.usages.find((u) => u.package.name === "zod")!;
      tx.put("usages", {
        ...e,
        id: "dec-use",
        event_id: "dec-use",
        period: "2026-12",
        observed_at: "2026-12-01T00:00:00Z",
      });
    });
    await service.closePeriod("2026-12", false);
    const c = (await store.read()).credits.filter(
      (c) => c.period === "2026-12",
    );
    expect(c.reduce((n, c) => n + c.cents, 0)).toBe(10002); // 1 cent rollover from November plus new 10001 cents.
    expect(c.find((c) => c.maintainerId === "m2")?.cents).toBe(7001);
    expect(c.find((c) => c.maintainerId === "m3")?.cents).toBe(3001);
    await store.close();
  });
  it("gates fiscal hosts on human verification, maintainer consent and cooldown", async () => {
    const { store } = await fixture();
    const s = await store.read();
    const m = s.maintainers[0];
    m.hostId = "host";
    expect(recipient(s, m).ready).toBe(false);
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    s.hosts.push({
      id: "host",
      name: "Fiscal host",
      repoUrl: "https://example.com",
      email: "host@example.com",
      verifiedAt: old,
      changedAt: old,
      verifiedBy: "admin",
    });
    m.hostAuthorizedAt = now();
    expect(recipient(s, m).ready).toBe(false);
    m.hostAuthorizedAt = old;
    expect(recipient(s, m)).toMatchObject({
      ready: true,
      email: "host@example.com",
    });
    await store.close();
  });
  it("rolls completely unused received pools forward once and freezes their period", async () => {
    const { store, service } = await fixture();
    await store.transact((tx) => {
      tx.put("orgs", {
        id: "empty",
        name: "Empty",
        currency: "GBP",
        budgetCents: 10000,
        status: "active",
        publicName: false,
        owner: "x",
      });
      tx.put("receipts", {
        id: "empty-receipt",
        orgId: "empty",
        period,
        currency: "GBP",
        cents: 10000,
        providerId: "demo-empty",
        kind: "subscription",
        receivedAt: now(),
      });
    });
    await service.closePeriod(period);
    await service.closePeriod(period);
    const s = await store.read();
    expect(s.closes.find((c) => c.orgId === "empty")?.allocations).toEqual([]);
    expect(
      s.receipts
        .filter((r) => r.orgId === "empty" && r.period === "2026-12")
        .reduce((n, r) => n + r.cents, 0),
    ).toBe(10000);
    await store.close();
  });
});
describe("identity, privacy and tool isolation", () => {
  it("rejects anonymous, expired, tampered and cross-org credentials", () => {
    vi.stubEnv("NEBRASKA_MODE", "sandbox");
    vi.stubEnv("SESSION_SECRET", "test-secret-at-least-32-characters-long");
    const token = sign({ role: "org", id: "o", exp: Date.now() + 10000 });
    const a = actor(
      new Request("http://local/api", {
        headers: { Authorization: "Bearer " + token },
      }),
    );
    expect(a.id).toBe("o");
    expect(() => orgAccess(a, "other")).toThrow("denied");
    expect(() => actor(new Request("http://local/api"))).toThrow("Sign in");
    expect(() =>
      actor(
        new Request("http://local/api", {
          headers: { Authorization: "Bearer " + token + "x" },
        }),
      ),
    ).toThrow();
    const expired = sign({ role: "org", id: "o", exp: 1 });
    expect(() =>
      actor(
        new Request("http://local/api", {
          headers: { Authorization: "Bearer " + expired },
        }),
      ),
    ).toThrow();
  });
  it("maintainers see aggregate counts and only opted-in organization names", async () => {
    const { store } = await fixture();
    const s = await store.read();
    const a = { role: "maintainer" as const, id: "m3", exp: Infinity };
    const view = maintainerView(s, "m3", period, a);
    expect(view.usage.orgCount).toBe(1);
    expect(view.usage.repoCount).toBe(25);
    expect(view.usage.organizations).toEqual(["Private organization"]);
    s.orgs[0].publicName = true;
    expect(maintainerView(s, "m3", period, a).usage.organizations).toEqual([
      "Acme AI",
    ]);
    expect(() => payerView(s, "org_acme", period, a)).toThrow("denied");
    expect(() => maintainerView(s, "m2", period, a)).toThrow("denied");
    await store.close();
  });
  it("never exposes money-moving toolkit tools to reconciliation", () => {
    expect(
      readOnlyTools([
        { name: "create_order" },
        { name: "pay_order" },
        { name: "list_transactions" },
        { name: "cancel_subscription" },
        { name: "get_merchant_insights" },
      ]).map((t) => t.name),
    ).toEqual(["list_transactions", "get_merchant_insights"]);
  });
});
