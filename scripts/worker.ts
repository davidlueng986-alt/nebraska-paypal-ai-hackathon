import { getService } from "../src/core/runtime";
import { Treasurer } from "../src/core/treasurer";
import { addMonths, periodOf, now } from "../src/core/util";
import { queryOsv } from "../src/integrations/metadata";
import { getPayments } from "../src/integrations/paypal";
import { reconcile } from "../src/integrations/reconcile";
const service = getService();
const today = now();
const period = process.env.SETTLEMENT_PERIOD ?? addMonths(periodOf(today), -1);
try {
  // Render cron runs daily. Settlement executes only on day 1 unless an explicit period is supplied.
  if (new Date(today).getUTCDate() === 1 || process.env.SETTLEMENT_PERIOD) {
    console.log(JSON.stringify(await new Treasurer(service).run(period)));
    await reconcile(
      service,
      getPayments(),
      period,
      process.env.RECONCILE_WITH_TOOLKIT === "true",
    );
  }
  const s = await service.store.read();
  for (const batch of s.batches.filter(
    (b) => b.status === "submitted" && b.providerBatchId,
  ))
    await service.syncBatch(batch.id);
  await service.handleExceptions(periodOf(today));
  for (const pkg of s.packages) {
    const vulnerabilities =
      service.mode === "demo"
        ? pkg.signals.vulnerabilities
        : await queryOsv(pkg.ecosystem, pkg.name, pkg.version);
    await service.store.transact((tx) =>
      tx.put("packages", {
        ...pkg,
        signals: { ...pkg.signals, vulnerabilities },
      }),
    );
    if (vulnerabilities.length)
      for (const org of s.orgs.filter(
        (o) =>
          o.status === "active" &&
          s.usages.some(
            (u) =>
              u.org_id === o.id &&
              `${u.package.ecosystem}:${u.package.name}` === pkg.id,
          ),
      ))
        await service.proposeGrant(periodOf(today), org.id, pkg.id);
  }
  console.log("Daily advisory scan and payment reconciliation complete.");
} finally {
  await service.store.close();
}
