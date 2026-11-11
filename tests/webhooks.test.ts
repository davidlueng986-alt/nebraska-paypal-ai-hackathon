import { describe, it, expect } from "vitest";
import { Nebraska } from "../src/core/service";
import { SqliteStore } from "../src/core/store";
import { DemoPayments } from "../src/integrations/paypal";
import { DemoDecisionProvider } from "../src/core/decisions";
import { seedDemo } from "../src/core/seed";
import { handleWebhook } from "../src/integrations/webhooks";
class SignedPayments extends DemoPayments {
  override async verifyWebhook() {
    return true;
  }
  override async getSubscription(id: string) {
    return { id, status: "ACTIVE", quantity: "500", custom_id: "org_acme" };
  }
}
async function fixture(p = new SignedPayments()) {
  const store = new SqliteStore(":memory:");
  const service = new Nebraska(store, new DemoDecisionProvider(), p);
  await seedDemo(service, "2026-11");
  return { store, service, p };
}
function sale(id: string, currency = "USD") {
  return {
    id: "hook-" + id,
    event_type: "PAYMENT.SALE.COMPLETED",
    resource: {
      id,
      billing_agreement_id: "DEMO-SUB-ACME",
      amount: { currency, total: "500.00" },
      create_time: "2026-11-01T00:00:00Z",
    },
  };
}
describe("verified, idempotent webhook accounting", () => {
  it("rejects an unverified webhook before recording any event", async () => {
    const { store, service } = await fixture();
    const p = new DemoPayments();
    await expect(
      handleWebhook(service, p, new Headers(), sale("evil")),
    ).rejects.toThrow("verification");
    expect((await store.read()).webhooks).toHaveLength(0);
    await store.close();
  });
  it("credits a sale once and queues late receipts to the next open period", async () => {
    const { store, service, p } = await fixture();
    await handleWebhook(service, p, new Headers(), sale("SALE-2"));
    expect(
      await handleWebhook(service, p, new Headers(), sale("SALE-2")),
    ).toEqual({ duplicate: true });
    const s = await store.read();
    expect(s.receipts.filter((r) => r.providerId === "SALE-2")).toHaveLength(1);
    expect(s.receipts.find((r) => r.providerId === "SALE-2")?.period).toBe(
      "2026-12",
    );
    expect(s.closes[0].budgetCents).toBe(50000);
    await store.close();
  });
  it("deduplicates the same sale under different webhook event IDs", async () => {
    const { store, service, p } = await fixture();
    const event = sale("SALE-3");
    await handleWebhook(service, p, new Headers(), event);
    await handleWebhook(service, p, new Headers(), {
      ...event,
      id: "another-event",
    });
    expect(
      (await store.read()).receipts.filter((r) => r.providerId === "SALE-3"),
    ).toHaveLength(1);
    await store.close();
  });
  it("rejects a currency mismatch and leaves funds unchanged", async () => {
    const { store, service, p } = await fixture();
    await expect(
      handleWebhook(service, p, new Headers(), sale("SALE-4", "EUR")),
    ).rejects.toThrow("mismatch");
    expect(
      (await store.read()).receipts.some((r) => r.providerId === "SALE-4"),
    ).toBe(false);
    await store.close();
  });
});
