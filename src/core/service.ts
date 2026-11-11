import { z } from "zod";
import { allocate, usageUnits } from "./allocator";
import { decide, type DecisionProvider } from "./decisions";
import { checkPayout, closeHash, itemId, recipient } from "./gate";
import {
  DEFAULT_SIGNALS,
  PARAMS,
  periodSchema,
  usageSchema,
  type Batch,
  type Close,
  type Credit,
  type Currency,
  type Grant,
  type Package,
  type Question,
  type State,
  type Usage,
} from "./model";
import type { Store, Tx } from "./store";
import {
  activeHold,
  addMonths,
  daysSince,
  DomainError,
  hash,
  id,
  money,
  now,
  periodOf,
  requireInt,
  requireRow,
  splitCents,
} from "./util";
import type { Payments } from "../integrations/paypal";
export class Nebraska {
  constructor(
    public store: Store,
    private provider: DecisionProvider,
    private payments: Payments,
  ) {}
  get mode() {
    return this.payments.mode;
  }
  async recordUsage(raw: unknown) {
    const e = usageSchema.parse(raw);
    if (periodOf(e.observed_at) !== e.period)
      throw new DomainError("Observation timestamp and period disagree");
    if (Date.parse(e.observed_at) > Date.now() + 300000)
      throw new DomainError("Observation is in the future");
    return this.store.transact((tx) => {
      requireRow(
        tx.state.orgs.find((o) => o.id === e.org_id),
        "Organization not found",
      );
      const existing = tx.state.usages.find((x) => x.id === e.event_id);
      if (existing) {
        if (
          hash({ ...existing, id: undefined, observed_at: undefined }) !==
          hash({ ...e, observed_at: undefined })
        )
          throw new DomainError("Event ID reused with different data", 409);
        return { deduplicated: true, id: e.event_id };
      }
      if (
        tx.state.closes.some(
          (c) => c.period === e.period && c.orgId === e.org_id,
        )
      )
        throw new DomainError(
          "This period is frozen; late usage cannot alter paid amounts",
          409,
        );
      tx.put("usages", { ...e, id: e.event_id });
      const pid = `${e.package.ecosystem}:${e.package.name}`;
      if (!tx.state.packages.some((p) => p.id === pid))
        tx.put("packages", {
          id: pid,
          ...e.package,
          repoUrl: "",
          signals: { ...DEFAULT_SIGNALS },
          metadataAt: now(),
        });
      return { deduplicated: false, id: e.event_id };
    });
  }
  async decidePackage(period: string, packageId: string, question: Question) {
    periodSchema.parse(period);
    const s = await this.store.read();
    const p = requireRow(s.packages.find((p) => p.id === packageId));
    const d = await decide(this.provider, {
      period,
      subject: packageId,
      question,
      facts: p.signals,
    });
    await this.store.transact((tx) => tx.put("decisions", d));
    return d;
  }
  async analyze(period: string) {
    periodSchema.parse(period);
    const s = await this.store.read();
    const packageIds = [
      ...new Set(
        s.usages
          .filter((u) => u.period === period)
          .map((u) => `${u.package.ecosystem}:${u.package.name}`),
      ),
    ];
    const all = [];
    for (const packageId of packageIds) {
      for (const q of ["criticality", "need"] as const)
        all.push(await this.decidePackage(period, packageId, q));
      const p = requireRow(
        (await this.store.read()).packages.find((p) => p.id === packageId),
      );
      const claims = s.claims.filter((c) => c.packageId === packageId);
      if (
        p.signals.recentChange ||
        claims.some(
          (c) =>
            daysSince(c.claimedAt) < 14 ||
            daysSince(
              s.maintainers.find((m) => m.id === c.maintainerId)
                ?.emailChangedAt ?? now(),
            ) < 14,
        )
      ) {
        const d = await this.decidePackage(period, packageId, "payee_risk");
        all.push(d);
        if (!d.accepted || Number(d.value) >= 0.3)
          for (const c of claims)
            await this.hold(c.maintainerId, d.reason, d.id);
      }
    }
    return all;
  }
  async hold(maintainerId: string, reason: string, decisionId?: string) {
    return this.store.transact((tx) => {
      requireRow(tx.state.maintainers.find((m) => m.id === maintainerId));
      if (activeHold(tx.state, maintainerId))
        return activeHold(tx.state, maintainerId)!;
      const h = tx.put("holds", {
        id: id("hold"),
        maintainerId,
        reason: reason.slice(0, 600),
        decisionId,
        at: now(),
      });
      tx.put("audits", {
        id: id("gate"),
        action: "payee.hold",
        inputsHash: hash(h),
        checks: [
          { id: "I1", passed: true, reason: "Holding is always permitted" },
        ],
        result: "allow",
        at: now(),
      });
      return h;
    });
  }
  async releaseHold(maintainerId: string) {
    return this.store.transact((tx) => {
      for (const h of tx.state.holds.filter(
        (h) => h.maintainerId === maintainerId && !h.releasedAt,
      ))
        tx.put("holds", { ...h, releasedAt: now() });
      tx.put("audits", {
        id: id("audit"),
        action: "human.release_hold",
        inputsHash: hash(maintainerId),
        checks: [],
        result: "info",
        at: now(),
      });
    });
  }
  async closePeriod(period: string, ai = true) {
    periodSchema.parse(period);
    return this.store.transact((tx) => {
      const created: Close[] = [];
      for (const org of tx.state.orgs) {
        const closeId = `close:${org.id}:${period}`;
        const existing = tx.state.closes.find((c) => c.id === closeId);
        if (existing) {
          created.push(existing);
          continue;
        }
        const budgetCents = tx.state.receipts
          .filter(
            (r) =>
              r.orgId === org.id &&
              r.period === period &&
              r.currency === org.currency,
          )
          .reduce((s, r) => s + r.cents, 0);
        if (!budgetCents) continue;
        const usageSnapshot = tx.state.usages.filter(
          (u) => u.org_id === org.id && u.period === period,
        );
        const pids = [...usageUnits(usageSnapshot).keys()];
        const decisions = pids
          .flatMap((pid) =>
            ["criticality", "need"].map((q) =>
              [...tx.state.decisions]
                .reverse()
                .find(
                  (d) =>
                    d.period === period &&
                    d.subject === pid &&
                    d.question === q,
                ),
            ),
          )
          .filter((d): d is State["decisions"][number] => !!d);
        // Risk is independent of the Treasurer's choice of tools: changed recipients require a safe decision.
        for (const pid of pids) {
          const p = tx.state.packages.find((p) => p.id === pid);
          if (p?.signals.recentChange) {
            const risk = [...tx.state.decisions]
              .reverse()
              .find(
                (d) =>
                  d.period === period &&
                  d.subject === pid &&
                  d.question === "payee_risk",
              );
            if (!risk?.accepted || Number(risk.value) >= 0.3)
              for (const c of tx.state.claims.filter(
                (c) => c.packageId === pid,
              ))
                if (!activeHold(tx.state, c.maintainerId))
                  tx.put("holds", {
                    id: id("hold"),
                    maintainerId: c.maintainerId,
                    reason: "Recipient risk requires review",
                    decisionId: risk?.id,
                    at: now(),
                  });
          }
        }
        const base = {
          id: closeId,
          period,
          orgId: org.id,
          currency: org.currency,
          budgetCents,
          usageSnapshot,
          decisions,
          paramsVersion: PARAMS.version,
          at: now(),
          ai,
        };
        const close: Close = {
          ...base,
          allocations: allocate(
            budgetCents,
            usageUnits(usageSnapshot),
            decisions,
            ai,
          ),
          snapshotHash: closeHash(base),
        };
        tx.put("closes", close);
        created.push(close);
        for (const a of close.allocations)
          if (a.cents)
            this.credit(tx, {
              id: id("credit"),
              orgId: org.id,
              packageId: a.packageId,
              period,
              currency: org.currency,
              cents: a.cents,
              source: "allocation",
              sourceId: close.id,
              status: "available",
              at: now(),
            });
        const unused =
          budgetCents - close.allocations.reduce((sum, a) => sum + a.cents, 0);
        if (unused)
          this.recycleReceipt(
            tx,
            org.id,
            addMonths(period, 1),
            org.currency,
            unused,
            `rounding:${closeId}`,
          );
      }
      return created;
    });
  }
  private credit(tx: Tx, credit: Credit) {
    const claims = tx.state.claims.filter(
      (c) => c.packageId === credit.packageId,
    );
    if (!claims.length) {
      tx.put("credits", credit);
      return;
    }
    for (const part of splitCents(
      credit.cents,
      claims.map((c) => ({ id: c.maintainerId, weight: c.share })),
    ))
      if (part.cents)
        tx.put("credits", {
          ...credit,
          id: credit.id + ":" + part.id,
          maintainerId: part.id,
          cents: part.cents,
        });
  }
  private recycleReceipt(
    tx: Tx,
    orgId: string,
    period: string,
    currency: Currency,
    cents: number,
    source: string,
  ) {
    const rid = `recycle:${source}`;
    if (!tx.state.receipts.some((r) => r.id === rid))
      tx.put("receipts", {
        id: rid,
        orgId,
        period,
        currency,
        cents,
        providerId: source,
        kind: "recycle",
        receivedAt: now(),
      });
  }
  async attachUnclaimed(packageId: string) {
    return this.store.transact((tx) => {
      const credits = tx.state.credits.filter(
        (c) =>
          c.packageId === packageId &&
          !c.maintainerId &&
          c.status === "available",
      );
      if (!tx.state.claims.some((c) => c.packageId === packageId)) return;
      for (const c of credits) {
        tx.put("credits", { ...c, status: "split" });
        this.credit(tx, { ...c, id: c.id + ":claimed" });
      }
    });
  }
  async recycleUnclaimed(period: string) {
    periodSchema.parse(period);
    return this.store.transact((tx) => {
      let cents = 0;
      for (const c of tx.state.credits.filter(
        (c) =>
          !c.maintainerId &&
          c.status === "available" &&
          addMonths(c.period, 6) <= period,
      )) {
        tx.put("credits", { ...c, status: "recycled" });
        this.recycleReceipt(
          tx,
          c.orgId,
          addMonths(period, 1),
          c.currency,
          c.cents,
          c.id,
        );
        cents += c.cents;
      }
      return { cents };
    });
  }
  async prepareBatch(period: string) {
    periodSchema.parse(period);
    return this.store
      .transact((tx) => {
        const existing = tx.state.batches.find((b) => b.period === period);
        if (existing) return existing;
        const groups = new Map<string, Credit[]>();
        for (const c of tx.state.credits.filter(
          (c) =>
            c.status === "available" && c.period <= period && c.maintainerId,
        )) {
          const m = tx.state.maintainers.find((m) => m.id === c.maintainerId);
          const claim = tx.state.claims.find(
            (cl) =>
              cl.packageId === c.packageId &&
              cl.maintainerId === c.maintainerId,
          );
          if (
            !m ||
            !recipient(tx.state, m).ready ||
            !claim ||
            daysSince(claim.claimedAt) < 14
          )
            continue;
          const key = `${c.maintainerId}|${c.currency}`;
          groups.set(key, [...(groups.get(key) ?? []), c]);
        }
        const items: Batch["items"] = [];
        for (const [, credits] of [...groups.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const cents = credits.reduce((sum, c) => sum + c.cents, 0);
          if (cents < PARAMS.minimumCents) continue;
          const m = requireRow(
            tx.state.maintainers.find((m) => m.id === credits[0].maintainerId),
          );
          items.push({
            id: itemId(m.id, period, credits[0].currency),
            maintainerId: m.id,
            receiver: recipient(tx.state, m).email,
            currency: credits[0].currency,
            cents,
            creditIds: credits.map((c) => c.id).sort(),
            status: "PENDING",
          });
        }
        if (!items.length)
          throw new DomainError(
            "No eligible balances reach the minimum payout; funds remain in the ledger",
            409,
            "NO_ELIGIBLE_PAYOUTS",
          );
        const payloadHash = hash(
          items.map(
            ({ id, receiver, cents, currency, creditIds, maintainerId }) => ({
              id,
              receiver,
              cents,
              currency,
              creditIds,
              maintainerId,
            }),
          ),
        );
        const batch: Batch = {
          id: `nebraska-${period}`,
          period,
          status: "prepared",
          items,
          payloadHash,
          createdAt: now(),
        };
        const audit = checkPayout(tx.state, batch);
        tx.put("audits", audit);
        if (audit.result === "deny") return { denied: true as const, audit };
        for (const item of items)
          for (const cid of item.creditIds) {
            const c = requireRow(tx.state.credits.find((c) => c.id === cid));
            tx.put("credits", { ...c, status: "reserved", batchId: batch.id });
          }
        tx.put("batches", batch);
        return batch;
      })
      .then((r) => {
        if ("denied" in r)
          throw new DomainError(
            "Rule gate denied: " +
              r.audit.checks
                .filter((c) => !c.passed)
                .map((c) => c.id)
                .join(", "),
            409,
            "GATE_DENIED",
          );
        return r;
      });
  }
  async executePayout(period: string) {
    const batch = await this.prepareBatch(period);
    if (batch.status !== "prepared") return batch;
    const audit = await this.store.transact((tx) => {
      const a = checkPayout(
        tx.state,
        requireRow(tx.state.batches.find((b) => b.id === batch.id)),
      );
      tx.put("audits", a);
      return a;
    });
    if (audit.result === "deny")
      throw new DomainError(
        "Payout gate denied: " +
          audit.checks
            .filter((c) => !c.passed)
            .map((c) => c.id)
            .join(", "),
        409,
        "GATE_DENIED",
      );
    let result;
    try {
      result = await this.payments.payout(batch);
    } catch (error) {
      await this.store.transact((tx) => {
        const current = requireRow(
          tx.state.batches.find((b) => b.id === batch.id),
        );
        tx.put("batches", {
          ...current,
          lastError:
            "Provider outcome uncertain. Retry with this exact batch ID and payload within 29 days. " +
            (error instanceof Error ? error.message : "network error"),
        });
      });
      throw error;
    }
    await this.store.transact((tx) => {
      const current = requireRow(
        tx.state.batches.find((b) => b.id === batch.id),
      );
      if (current.providerBatchId && current.providerBatchId !== result.id)
        throw new DomainError("Provider batch identity changed", 409);
      tx.put("batches", {
        ...current,
        status: "submitted",
        providerBatchId: result.id,
        lastError: undefined,
      });
    });
    if (result.items) await this.applyPayoutItems(batch.id, result.items);
    return requireRow(
      (await this.store.read()).batches.find((b) => b.id === batch.id),
    );
  }
  async applyPayoutItems(batchId: string, results: any[]) {
    return this.store.transact((tx) => {
      let batch = requireRow(tx.state.batches.find((b) => b.id === batchId));
      const items = [...batch.items];
      for (const result of results) {
        const index = items.findIndex(
          (i) => i.id === result.payout_item?.sender_item_id,
        );
        if (index < 0)
          throw new DomainError("Unknown payout item from provider", 409);
        const old = items[index];
        const status = String(result.transaction_status).toUpperCase();
        if (
          ![
            "SUCCESS",
            "UNCLAIMED",
            "RETURNED",
            "FAILED",
            "BLOCKED",
            "HELD",
            "CANCELED",
            "PENDING",
          ].includes(status)
        )
          continue;
        if (
          result.payout_item?.amount &&
          (result.payout_item.amount.currency !== old.currency ||
            Math.round(Number(result.payout_item.amount.value) * 100) !==
              old.cents)
        )
          throw new DomainError(
            "Provider payout amount/currency mismatch",
            409,
          );
        // Final states cannot be regressed by reordered notifications. A successful transfer can only become RETURNED.
        if (
          ["RETURNED", "FAILED", "CANCELED"].includes(old.status) &&
          status !== old.status
        )
          continue;
        if (
          old.status === "SUCCESS" &&
          status !== "RETURNED" &&
          status !== "SUCCESS"
        )
          continue;
        items[index] = {
          ...old,
          status: status as typeof old.status,
          providerItemId: result.payout_item_id ?? old.providerItemId,
        };
        for (const cid of old.creditIds) {
          const credit = requireRow(tx.state.credits.find((c) => c.id === cid));
          const next =
            status === "SUCCESS"
              ? "paid"
              : ["RETURNED", "FAILED", "CANCELED"].includes(status)
                ? "available"
                : "reserved";
          if (credit.batchId === batch.id)
            tx.put("credits", {
              ...credit,
              status: next,
              batchId: next === "available" ? undefined : credit.batchId,
            });
        }
      }
      batch = {
        ...batch,
        items,
        status: items.every((i) =>
          ["SUCCESS", "RETURNED", "FAILED", "CANCELED"].includes(i.status),
        )
          ? "complete"
          : batch.status,
      };
      tx.put("batches", batch);
      return batch;
    });
  }
  async syncBatch(batchId: string) {
    const b = requireRow(
      (await this.store.read()).batches.find((b) => b.id === batchId),
    );
    if (!b.providerBatchId)
      throw new DomainError("Batch has no provider ID", 409);
    const d = await this.payments.getBatch(b.providerBatchId);
    const denied = d.batch_header?.batch_status === "DENIED";
    const items = denied
      ? b.items.map((i) => ({
          payout_item_id: i.providerItemId,
          payout_item: { sender_item_id: i.id },
          transaction_status: "FAILED",
        }))
      : (d.items ?? []);
    await this.applyPayoutItems(batchId, items);
    if (denied)
      await this.store.transact((tx) => {
        const current = requireRow(
          tx.state.batches.find((x) => x.id === batchId),
        );
        tx.put("batches", { ...current, status: "denied" });
      });
    return d;
  }
  async handleExceptions(period: string) {
    const s = await this.store.read();
    const decisions = [];
    for (const b of s.batches.filter((b) => b.period <= period))
      for (const item of b.items.filter(
        (i) =>
          !["SUCCESS", "PENDING"].includes(i.status) && !i.exceptionDecision,
      )) {
        const d = await decide(this.provider, {
          period,
          subject: item.id,
          question: "payout_exception",
          facts: { status: item.status, previousBatch: b.period },
        });
        await this.store.transact((tx) => {
          tx.put("decisions", d);
          const current = requireRow(
            tx.state.batches.find((x) => x.id === b.id),
          );
          tx.put("batches", {
            ...current,
            items: current.items.map((i) =>
              i.id === item.id ? { ...i, exceptionDecision: d.id } : i,
            ),
          });
        });
        if (d.value === "hold_notify")
          await this.hold(
            item.maintainerId,
            `Payout ${item.status}: ${d.reason}`,
            d.id,
          );
        decisions.push(d);
      }
    return decisions;
  }
  async cancelUnclaimed(batchId: string, itemId: string) {
    const b = requireRow(
      (await this.store.read()).batches.find((b) => b.id === batchId),
    );
    const item = requireRow(b.items.find((i) => i.id === itemId));
    if (item.status !== "UNCLAIMED" || !item.providerItemId)
      throw new DomainError(
        "Only provider-confirmed UNCLAIMED items can be cancelled",
        409,
      );
    const result = await this.payments.cancelItem(item.providerItemId);
    await this.applyPayoutItems(batchId, [result]);
    return result;
  }
  async proposeGrant(period: string, orgId: string, packageId: string) {
    periodSchema.parse(period);
    let s = await this.store.read();
    const org = requireRow(s.orgs.find((o) => o.id === orgId));
    const p = requireRow(s.packages.find((p) => p.id === packageId));
    if (
      !s.usages.some(
        (u) =>
          u.org_id === orgId &&
          `${u.package.ecosystem}:${u.package.name}` === packageId,
      )
    )
      throw new DomainError(
        "Grant package is not in this payer supply chain",
        409,
      );
    const d = await this.decidePackage(period, packageId, "grant_case");
    if (!d.accepted || !Number(d.value))
      return { suggested: false, decision: d };
    const grantId = `grant_${hash({ period, orgId, packageId, advisories: p.signals.vulnerabilities.map((v) => v.id).sort() }).slice(0, 24)}`;
    let grant = await this.store.transact((tx) => {
      const existing = tx.state.grants.find((g) => g.id === grantId);
      if (existing) return existing;
      const g: Grant = {
        id: grantId,
        orgId,
        packageId,
        currency: org.currency,
        cents: Number(d.value) * 100,
        decisionId: d.id,
        status: "proposed",
        createdAt: now(),
        period,
        reason: d.reason,
      };
      tx.put("grants", g);
      tx.put("audits", {
        id: id("gate"),
        action: "grant.propose",
        inputsHash: hash(g),
        checks: [
          { id: "I5", passed: true, reason: "Catalog grant amount" },
          {
            id: "I6",
            passed: true,
            reason: "Only requesting approval; no grant credit until capture",
          },
        ],
        result: "allow",
        at: now(),
      });
      return g;
    });
    if (grant.orderId || grant.status === "declined") return grant;
    const order = await this.payments.createOrder(
      grant.id,
      grant.cents,
      grant.currency,
    );
    grant = await this.store.transact((tx) => {
      const current = requireRow(
        tx.state.grants.find((g) => g.id === grant.id),
      );
      return tx.put("grants", {
        ...current,
        orderId: order.id,
        approveUrl: order.approveUrl,
        status: "approval_pending",
      });
    });
    return grant;
  }
  async captureGrant(grantId: string) {
    const g = requireRow(
      (await this.store.read()).grants.find((g) => g.id === grantId),
    );
    if (g.status === "captured") return g;
    if (g.status === "declined")
      throw new DomainError("This grant was declined", 409);
    if (!g.orderId) throw new DomainError("Grant has no PayPal order", 409);
    const order = await this.payments.getOrder(g.orderId);
    if (!["APPROVED", "COMPLETED"].includes(order.status))
      throw new DomainError("Human PayPal approval required", 409, "I6");
    const capture =
      order.status === "COMPLETED"
        ? order
        : await this.payments.captureOrder(g.orderId);
    const c = capture.purchase_units
      ?.flatMap((u: any) => u.payments?.captures ?? [])
      .find((c: any) => c.status === "COMPLETED");
    if (!c) throw new DomainError("Capture is not completed", 409);
    if (
      this.mode === "sandbox" &&
      (c.amount?.currency_code !== g.currency ||
        Math.round(Number(c.amount?.value) * 100) !== g.cents ||
        capture.purchase_units?.[0]?.custom_id !== g.id)
    )
      throw new DomainError("Capture does not match approved grant", 409);
    return this.fundGrant(g.id, c.id);
  }
  async fundGrant(grantId: string, captureId: string) {
    return this.store.transact((tx) => {
      const g = requireRow(tx.state.grants.find((g) => g.id === grantId));
      if (g.status === "captured") return g;
      if (tx.state.grants.some((x) => x.captureId === captureId))
        throw new DomainError("Capture already credited", 409);
      const period = tx.state.batches.some((b) => b.period === g.period)
        ? addMonths(g.period, 1)
        : g.period;
      const funded = tx.put("grants", { ...g, status: "captured", captureId });
      this.credit(tx, {
        id: `credit:${g.id}`,
        orgId: g.orgId,
        packageId: g.packageId,
        period,
        currency: g.currency,
        cents: g.cents,
        source: "grant",
        sourceId: g.id,
        status: "available",
        at: now(),
      });
      return funded;
    });
  }
  async subscribe(orgId: string, quantity: number) {
    requireInt(quantity);
    if (quantity < 1 || quantity > 100000)
      throw new DomainError(
        "Monthly budget must be 1–100000 whole currency units",
      );
    const s = await this.store.read();
    const org = requireRow(s.orgs.find((o) => o.id === orgId));
    const result = org.subscriptionId
      ? await this.payments.revise(org.subscriptionId, quantity)
      : await this.payments.subscription(orgId, quantity, org.currency);
    return this.store.transact((tx) =>
      tx.put("subscriptions", {
        id: id("subreq"),
        orgId,
        quantity,
        currency: org.currency,
        providerId: result.id,
        approveUrl: result.approveUrl,
        status: "pending",
        at: now(),
      }),
    );
  }
  async refreshSubscription(subscriptionId: string) {
    const remote = await this.payments.getSubscription(subscriptionId);
    return this.store.transact((tx) => {
      const request = [...tx.state.subscriptions]
        .reverse()
        .find((r) => r.providerId === subscriptionId);
      const org = requireRow(
        tx.state.orgs.find(
          (o) => o.subscriptionId === subscriptionId || o.id === request?.orgId,
        ),
      );
      if (
        this.mode === "sandbox" &&
        remote.custom_id &&
        remote.custom_id !== org.id
      )
        throw new DomainError("Subscription organization mismatch", 409);
      const quantity = Number(remote.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000)
        throw new DomainError("Invalid provider subscription quantity", 409);
      const status =
        remote.status === "ACTIVE"
          ? "active"
          : remote.status === "CANCELLED"
            ? "cancelled"
            : "pending";
      tx.put("orgs", {
        ...org,
        subscriptionId,
        budgetCents: quantity * 100,
        status,
      });
      if (request && status === "active")
        tx.put("subscriptions", { ...request, status: "activated" });
      return remote;
    });
  }
  async cancelSubscription(orgId: string) {
    const org = requireRow(
      (await this.store.read()).orgs.find((o) => o.id === orgId),
    );
    if (!org.subscriptionId) throw new DomainError("No subscription");
    await this.payments.cancel(org.subscriptionId);
    await this.store.transact((tx) =>
      tx.put("orgs", { ...org, status: "cancelled" }),
    );
  }
  async statements(period: string) {
    return this.store.transact((tx) => {
      const closes = tx.state.closes.filter((c) => c.period === period);
      const at = now();
      for (const org of tx.state.orgs) {
        const cs = closes.filter((c) => c.orgId === org.id);
        if (!cs.length) continue;
        const allocations = cs.flatMap((c) => c.allocations);
        const body =
          `${period}: ${money(
            cs.reduce((n, c) => n + c.budgetCents, 0),
            org.currency,
          )} in confirmed funding supported ${allocations.length} packages. ` +
          allocations
            .map((a) => {
              const p = tx.state.packages.find((p) => p.id === a.packageId);
              return `${p?.name ?? a.packageId}: ${money(a.cents, org.currency)} from usage ${a.u}, criticality ${a.c}, need ${a.n}.`;
            })
            .join(" ") +
          ` Amounts not eligible for payout remain credited. Model judgments and snapshots are included in the downloadable audit bundle. `;
        tx.put("statements", {
          id: `statement:org:${org.id}:${period}`,
          ownerType: "org",
          ownerId: org.id,
          period,
          body,
          recomputeHash: hash(cs.map((c) => c.snapshotHash)),
          closeIds: cs.map((c) => c.id),
          createdAt: at,
        });
      }
      for (const m of tx.state.maintainers) {
        const credits = tx.state.credits.filter(
          (c) =>
            c.maintainerId === m.id &&
            c.period === period &&
            c.status !== "split",
        );
        if (!credits.length) continue;
        const packageIds = [...new Set(credits.map((c) => c.packageId))];
        const orgCount = new Set(credits.map((c) => c.orgId)).size;
        const repoCount = new Set(
          tx.state.usages
            .filter(
              (u) =>
                u.period === period &&
                packageIds.includes(`${u.package.ecosystem}:${u.package.name}`),
            )
            .map((u) => u.repo_hash),
        ).size;
        const body =
          `${period}: your packages were observed in ${repoCount} repositories across ${orgCount} paying organizations. ` +
          credits
            .map(
              (c) =>
                `${c.packageId}: ${money(c.cents, c.currency)} (${c.status}).`,
            )
            .join(" ") +
          (activeHold(tx.state, m.id)
            ? ` Review hold: ${activeHold(tx.state, m.id)!.reason}.`
            : "") +
          " Balances below the payout minimum roll forward. Income funds your maintenance time and tools.";
        const cs = closes.filter((c) =>
          c.allocations.some((a) => packageIds.includes(a.packageId)),
        );
        tx.put("statements", {
          id: `statement:maintainer:${m.id}:${period}`,
          ownerType: "maintainer",
          ownerId: m.id,
          period,
          body,
          recomputeHash: hash(cs.map((c) => c.snapshotHash)),
          closeIds: cs.map((c) => c.id),
          createdAt: at,
        });
      }
      return tx.state.statements.filter((s) => s.period === period);
    });
  }
}
