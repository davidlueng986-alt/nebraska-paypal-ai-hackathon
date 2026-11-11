import type { Nebraska } from "../core/service";
import type { Payments } from "./paypal";
import { addMonths, hash, id, now } from "../core/util";
import { toolkitReport } from "./toolkit";
export async function reconcile(
  service: Nebraska,
  payments: Payments,
  period: string,
  useToolkit = false,
) {
  const start = period + "-01T00:00:00Z",
    end = new Date(Date.parse(addMonths(period, 1) + "-01T00:00:00Z") - 1000)
      .toISOString()
      .replace(".000", "");
  const s = await service.store.read();
  const transactions = await payments.transactions(start, end);
  const ids = new Set(
    transactions.map((t) => t.transaction_info?.transaction_id),
  );
  const receipts = s.receipts.filter(
    (r) => r.period === period && r.kind === "subscription",
  );
  const grants = s.grants.filter(
    (g) => g.period === period && g.status === "captured",
  );
  const missing = [
    ...receipts.map((r) => r.providerId),
    ...grants.map((g) => g.captureId!),
  ].filter((id) => !ids.has(id));
  const report = {
    period,
    mode: service.mode,
    transactions: transactions.length,
    receiptCount: receipts.length,
    captureCount: grants.length,
    missingProviderIds: missing,
    consistent: service.mode === "demo" ? null : missing.length === 0,
    toolkit: useToolkit
      ? await toolkitReport({ start_date: start, end_date: end })
      : null,
    at: now(),
  };
  await service.store.transact((tx) =>
    tx.put("audits", {
      id: id("reconcile"),
      action: "reconciliation.read_only",
      inputsHash: hash(report),
      checks: [
        {
          id: "reconciliation",
          passed: report.consistent === true,
          reason:
            service.mode === "demo"
              ? "Demo cannot verify PayPal transactions"
              : missing.length
                ? `${missing.length} ledger receipts absent from report`
                : "All receipt IDs matched",
        },
      ],
      result: "info",
      at: now(),
    }),
  );
  return report;
}
