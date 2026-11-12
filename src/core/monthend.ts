import { PARAMS, type RunEvent, type RunEventRow } from "./model";
import type { Nebraska } from "./service";
import { DomainError, hash, id, money, now } from "./util";

export const RUN_COMPLETE = "Month-end run complete";
export const RUN_FAILED = "Month-end run failed";
export const isTerminal = (e: Pick<RunEvent, "actor" | "title">) =>
  e.actor === "system" &&
  (e.title === RUN_COMPLETE || e.title === RUN_FAILED);

type Sink = (e: RunEvent) => void | Promise<void>;
type Partial_ = Pick<RunEvent, "actor" | "step" | "status" | "title"> &
  Partial<Pick<RunEvent, "invariant" | "detail" | "at">>;

/** Persisted, ordered month-end event stream. Rows are part of the append-only journal. */
class Recorder {
  seq = 0;
  constructor(
    private service: Nebraska,
    readonly runId: string,
    private sink?: Sink,
  ) {}
  async emit(p: Partial_): Promise<RunEvent> {
    const event: RunEvent = {
      run_id: this.runId,
      seq: ++this.seq,
      at: p.at ?? now(),
      actor: p.actor,
      step: p.step,
      status: p.status,
      ...(p.invariant ? { invariant: p.invariant } : {}),
      title: p.title,
      detail: p.detail ?? {},
    };
    await this.service.store.transact((tx) =>
      tx.put("runEvents", { ...event, id: `${event.run_id}:${event.seq}` }),
    );
    await this.sink?.(event);
    return event;
  }
}

export const toEvent = ({ id: _id, ...e }: RunEventRow): RunEvent => e;
export async function readRun(service: Nebraska, runId: string) {
  return (await service.store.read()).runEvents
    .filter((e) => e.run_id === runId)
    .sort((a, b) => a.seq - b.seq)
    .map(toEvent);
}
export const newRunId = (period: string) => `run_${period}_${id("r").slice(2, 10)}`;

const RISKY_TEXT = /ignore (all )?previous|instruction|set need|maximum|attacker/i;

export async function runMonthEnd(
  service: Nebraska,
  period: string,
  runId: string,
  opts: { execute?: boolean; sink?: Sink } = {},
) {
  const rec = new Recorder(service, runId, opts.sink);
  const execute = opts.execute ?? true;
  try {
    // 1. snapshot of observed usage (never contains repo names, only hashes)
    const s0 = await service.store.read();
    const usages = s0.usages.filter((u) => u.period === period);
    const byPackage: Record<string, number> = {};
    for (const u of usages) {
      const k = `${u.package.ecosystem}:${u.package.name}`;
      byPackage[k] = (byPackage[k] ?? 0) + 1;
    }
    await rec.emit({
      actor: "treasurer",
      step: "snapshot",
      status: "ok",
      title: `Usage snapshot read: ${usages.length} observations across ${Object.keys(byPackage).length} packages`,
      detail: {
        period,
        observations: usages.length,
        packages: byPackage,
        usage_hash: hash(usages.map((u) => u.id).sort()),
      },
    });

    // 2. decisions: typed questions only; untrusted text stays in the provider.
    await service.handleExceptions(period);
    await service.recycleUnclaimed(period);
    const before = new Set((await service.store.read()).holds.map((h) => h.id));
    const decisions = await service.analyze(period);
    const s1 = await service.store.read();
    for (const d of decisions) {
      const pkg = s1.packages.find((p) => p.id === d.subject);
      const injected = !!pkg && RISKY_TEXT.test(pkg.signals.readme ?? "");
      await rec.emit({
        actor: "decision",
        step: "decide",
        status: d.accepted ? "ok" : "rejected",
        title: d.accepted
          ? `${d.question} · ${pkg?.name ?? d.subject} = ${d.value}`
          : `${d.question} · ${pkg?.name ?? d.subject}: model answer rejected, neutral ${d.value} used`,
        detail: {
          package: d.subject,
          question: d.question,
          value: d.value,
          confidence: d.confidence,
          accepted: d.accepted,
          fallback: d.fallback,
          reason: d.reason,
          model: d.modelVersion,
          bounds: ["criticality", "need"].includes(d.question)
            ? [PARAMS.minWeight, PARAMS.maxWeight]
            : d.question === "payee_risk"
              ? [0, 1]
              : undefined,
          untrusted_text_present: injected,
        },
      });
    }
    for (const h of s1.holds.filter((h) => !h.releasedAt)) {
      const m = s1.maintainers.find((m) => m.id === h.maintainerId);
      await rec.emit({
        actor: "treasurer",
        step: "decide",
        status: "held",
        title: `payee_risk hold: ${m?.login ?? h.maintainerId}`,
        detail: {
          maintainer: h.maintainerId,
          reason: h.reason,
          decision_id: h.decisionId,
          email_changed_at: m?.emailChangedAt,
          created_in_this_run: !before.has(h.id),
          release: "human administrator only",
        },
      });
    }

    // 3. allocation (deterministic) + approved grants
    const closes = await service.closePeriod(period);
    const s2 = await service.store.read();
    for (const g of s2.grants.filter(
      (g) => g.period === period && g.status === "captured",
    ))
      await rec.emit({
        actor: "paypal",
        step: "allocate",
        status: "ok",
        title: `Grant approved on PayPal: ${money(g.cents, g.currency)} for ${g.packageId}`,
        detail: {
          grant_id: g.id,
          package: g.packageId,
          cents: g.cents,
          currency: g.currency,
          capture_id: g.captureId,
          approved_by: "human, on PayPal",
        },
      });
    for (const c of closes)
      await rec.emit({
        actor: "treasurer",
        step: "allocate",
        status: "ok",
        title: `Allocation frozen for ${c.orgId}: ${money(
          c.allocations.reduce((n, a) => n + a.cents, 0),
          c.currency,
        )} of ${money(c.budgetCents, c.currency)}`,
        detail: {
          org: c.orgId,
          budget_cents: c.budgetCents,
          snapshot_hash: c.snapshotHash,
          params_version: c.paramsVersion,
          allocations: c.allocations,
          recycled_cents:
            c.budgetCents - c.allocations.reduce((n, a) => n + a.cents, 0),
        },
      });

    // 4. gate + payout
    let batch: Awaited<ReturnType<Nebraska["executePayout"]>> | undefined;
    let failure: unknown;
    if (execute)
      try {
        batch = await service.executePayout(period);
      } catch (e) {
        if (e instanceof DomainError && e.code === "NO_ELIGIBLE_PAYOUTS")
          await rec.emit({
            actor: "treasurer",
            step: "payout",
            status: "held",
            title: "No eligible payouts this period",
            detail: { code: e.code },
          });
        else failure = e;
      }
    const audit = (await service.store.read()).audits
      .filter((a) => a.action === "payout.execute")
      .at(-1);
    if (audit && execute)
      for (const c of audit.checks)
        await rec.emit({
          at: audit.at,
          actor: "gate",
          step: "gate",
          status: c.passed ? "ok" : "rejected",
          invariant: c.id as RunEvent["invariant"],
          title: `${c.id} ${c.passed ? "passed" : "FAILED"}`,
          detail: { reason: c.reason, audit_id: audit.id, inputs_hash: audit.inputsHash },
        });
    if (failure) throw failure;
    if (batch && batch.status !== "prepared") {
      await rec.emit({
        actor: "paypal",
        step: "payout",
        status: "ok",
        title: `Payout batch ${batch.id} submitted`,
        detail: {
          batch_id: batch.id,
          provider_batch_id: batch.providerBatchId,
          payload_hash: batch.payloadHash,
          items: batch.items.length,
          status: batch.status,
          rule: "one immutable batch per period; retries reuse this id and payload",
        },
      });
      for (const i of batch.items)
        await rec.emit({
          actor: "paypal",
          step: "webhook",
          status:
            i.status === "SUCCESS"
              ? "ok"
              : ["UNCLAIMED", "HELD", "BLOCKED"].includes(i.status)
                ? "held"
                : ["FAILED", "RETURNED"].includes(i.status)
                  ? "rejected"
                  : "running",
          title: `Payout item ${i.status}: ${money(i.cents, i.currency)} → ${i.maintainerId}`,
          detail: {
            item_id: i.id,
            provider_item_id: i.providerItemId,
            maintainer: i.maintainerId,
            cents: i.cents,
            currency: i.currency,
            status: i.status,
          },
        });
    }

    // 5. statements
    const statements = await service.statements(period);
    await rec.emit({
      actor: "treasurer",
      step: "statement",
      status: "ok",
      title: `${statements.length} statements written`,
      detail: {
        statements: statements.map((st) => ({
          owner_type: st.ownerType,
          owner: st.ownerId,
          recompute_hash: st.recomputeHash,
        })),
      },
    });
    await rec.emit({
      actor: "system",
      step: "statement",
      status: "ok",
      title: RUN_COMPLETE,
      detail: { events: rec.seq + 1 },
    });
  } catch (error) {
    await rec.emit({
      actor: "system",
      step: "payout",
      status: "rejected",
      title: RUN_FAILED,
      detail: {
        code: error instanceof DomainError ? error.code : "UNEXPECTED",
        message: error instanceof Error ? error.message.slice(0, 300) : "error",
      },
    });
  }
  return readRun(service, runId);
}
