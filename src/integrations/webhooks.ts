import { z } from "zod";
import type { Nebraska } from "../core/service";
import { currencySchema } from "../core/model";
import {
  addMonths,
  DomainError,
  now,
  periodOf,
  requireRow,
} from "../core/util";
import type { Payments } from "./paypal";
const schema = z.object({
  id: z.string().min(1),
  event_type: z.string(),
  resource: z.record(z.any()),
});
export async function handleWebhook(
  service: Nebraska,
  payments: Payments,
  headers: Headers,
  raw: unknown,
) {
  const event = schema.parse(raw);
  if (!(await payments.verifyWebhook(headers, event)))
    throw new DomainError("PayPal webhook verification failed", 401);
  if ((await service.store.read()).webhooks.some((w) => w.id === event.id))
    return { duplicate: true };
  const r = event.resource,
    type = event.event_type;
  if (type.startsWith("BILLING.SUBSCRIPTION.")) {
    if (type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
      await service.store.transact((tx) => {
        const org = tx.state.orgs.find((o) => o.subscriptionId === r.id);
        if (org) tx.put("orgs", { ...org, status: "payment_failed" });
      });
    } else await service.refreshSubscription(String(r.id));
  } else if (type === "PAYMENT.SALE.COMPLETED") {
    const subscriptionId = String(r.billing_agreement_id ?? "");
    // Verify ownership against provider, including if activation notification arrived late.
    await service.refreshSubscription(subscriptionId);
    await service.store.transact((tx) => {
      const org = requireRow(
        tx.state.orgs.find((o) => o.subscriptionId === subscriptionId),
        "Unknown subscription",
      );
      const currency = currencySchema.parse(
        r.amount?.currency ?? r.amount?.currency_code,
      );
      const cents = Math.round(
        Number(r.amount?.total ?? r.amount?.value) * 100,
      );
      if (
        currency !== org.currency ||
        !Number.isSafeInteger(cents) ||
        cents <= 0
      )
        throw new DomainError("Receipt amount/currency mismatch", 409);
      if (tx.state.receipts.some((x) => x.providerId === r.id)) return;
      let period = periodOf(String(r.create_time ?? now()));
      if (!/^\d{4}-\d{2}$/.test(period))
        throw new DomainError("Invalid receipt date");
      while (
        tx.state.closes.some((c) => c.orgId === org.id && c.period === period)
      )
        period = addMonths(period, 1);
      tx.put("receipts", {
        id: `sale:${r.id}`,
        orgId: org.id,
        period,
        currency,
        cents,
        providerId: r.id,
        kind: "subscription",
        receivedAt: now(),
      });
    });
  } else if (
    type === "CHECKOUT.ORDER.APPROVED" ||
    type === "PAYMENT.CAPTURE.COMPLETED"
  ) {
    const orderId =
      type === "CHECKOUT.ORDER.APPROVED"
        ? r.id
        : r.supplementary_data?.related_ids?.order_id;
    const grant = (await service.store.read()).grants.find(
      (g) => g.orderId === orderId,
    );
    if (!grant) throw new DomainError("Unknown grant order", 409);
    await service.captureGrant(grant.id);
  } else if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    const s = await service.store.read();
    const providerId = r.batch_header?.payout_batch_id ?? r.payout_batch_id;
    const senderId =
      r.batch_header?.sender_batch_header?.sender_batch_id ??
      r.sender_batch_header?.sender_batch_id;
    const batch = requireRow(
      s.batches.find(
        (b) => b.providerBatchId === providerId || b.id === senderId,
      ),
      "Unknown payout batch",
    );
    if (!batch.providerBatchId && providerId)
      await service.store.transact((tx) =>
        tx.put("batches", {
          ...batch,
          providerBatchId: providerId,
          status: "submitted",
        }),
      );
    await service.syncBatch(batch.id);
  } else if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const s = await service.store.read();
    const sender = r.payout_item?.sender_item_id;
    const b = requireRow(
      s.batches.find((b) =>
        b.items.some(
          (i) => i.id === sender || i.providerItemId === r.payout_item_id,
        ),
      ),
      "Unknown payout item",
    );
    // Re-fetch authoritative item state so reordered notifications cannot restore money still in flight.
    const remote = await payments.getItem(String(r.payout_item_id));
    await service.applyPayoutItems(b.id, [remote]);
    await service.handleExceptions(b.period);
  }
  await service.store.transact((tx) => {
    if (!tx.state.webhooks.some((w) => w.id === event.id))
      tx.put("webhooks", {
        id: event.id,
        type,
        resourceId: String(r.id ?? r.payout_item_id ?? ""),
        at: now(),
      });
  });
  return { received: true };
}
