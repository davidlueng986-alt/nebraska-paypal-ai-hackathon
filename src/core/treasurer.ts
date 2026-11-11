import { z } from "zod";
import type { Nebraska } from "./service";
import { PARAMS, questions, type Question } from "./model";
import { DomainError, hash, id, now } from "./util";
const toolSchemas = [
  {
    name: "ledger_summary",
    description: "Read typed period facts; never raw package text.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "decide",
    description: "Ask a fixed catalog question about a package.",
    parameters: {
      type: "object",
      properties: {
        packageId: { type: "string" },
        question: {
          type: "string",
          enum: questions.filter((q) => q !== "payout_exception"),
        },
      },
      required: ["packageId", "question"],
      additionalProperties: false,
    },
  },
  {
    name: "payee_hold",
    description:
      "Hold a verified maintainer pending review. Cannot release holds.",
    parameters: {
      type: "object",
      properties: {
        maintainerId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["maintainerId", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "allocation_compute",
    description:
      "Freeze all funded org snapshots and allocate. Changed payees automatically undergo risk gating.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "grant_propose",
    description:
      "Request a PayPal approval URL for a catalog-sized security grant. Never approve or capture.",
    parameters: {
      type: "object",
      properties: { orgId: { type: "string" }, packageId: { type: "string" } },
      required: ["orgId", "packageId"],
      additionalProperties: false,
    },
  },
  {
    name: "payout_execute",
    description: "Submit the one global period batch through I1-I7.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "statement_write",
    description: "Write auditable payer and maintainer statements.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];
export class Treasurer {
  constructor(private service: Nebraska) {}
  async summary(period: string) {
    const s = await this.service.store.read();
    return {
      period,
      parameters: PARAMS,
      orgs: s.orgs.map((o) => ({
        id: o.id,
        currency: o.currency,
        funded: s.receipts
          .filter((r) => r.orgId === o.id && r.period === period)
          .reduce((n, r) => n + r.cents, 0),
      })),
      packages: s.packages
        .filter((p) =>
          s.usages.some(
            (u) =>
              u.period === period &&
              `${u.package.ecosystem}:${u.package.name}` === p.id,
          ),
        )
        .map((p) => ({
          id: p.id,
          needsRiskReview: p.signals.recentChange,
          hasAdvisory: p.signals.vulnerabilities.length > 0,
        })),
      decisions: s.decisions
        .filter((d) => d.period === period)
        .map(
          ({ subject, question, value, confidence, accepted, fallback }) => ({
            subject,
            question,
            value,
            confidence,
            accepted,
            fallback,
          }),
        ),
      holds: s.holds
        .filter((h) => !h.releasedAt)
        .map((h) => ({ maintainerId: h.maintainerId })),
      closes: s.closes
        .filter((c) => c.period === period)
        .map((c) => ({ orgId: c.orgId, hash: c.snapshotHash })),
      batch: s.batches
        .filter((b) => b.period === period)
        .map((b) => ({ id: b.id, status: b.status })),
      tools: toolSchemas.map((t) => t.name),
    };
  }
  async tool(period: string, name: string, args: unknown) {
    const empty = z.object({}).strict();
    let result: unknown;
    switch (name) {
      case "ledger_summary":
        empty.parse(args);
        result = await this.summary(period);
        break;
      case "decide": {
        const a = z
          .object({
            packageId: z.string(),
            question: z.enum([
              "criticality",
              "need",
              "payee_risk",
              "grant_case",
            ]),
          })
          .strict()
          .parse(args);
        const d = await this.service.decidePackage(
          period,
          a.packageId,
          a.question as Question,
        );
        result = {
          subject: d.subject,
          question: d.question,
          value: d.value,
          confidence: d.confidence,
          accepted: d.accepted,
        };
        break;
      }
      case "payee_hold": {
        const a = z
          .object({ maintainerId: z.string(), reason: z.string().max(600) })
          .strict()
          .parse(args);
        await this.service.hold(a.maintainerId, a.reason);
        result = { held: true };
        break;
      }
      case "allocation_compute":
        empty.parse(args);
        result = (await this.service.closePeriod(period)).map((c) => ({
          orgId: c.orgId,
          snapshotHash: c.snapshotHash,
          allocations: c.allocations,
        }));
        break;
      case "grant_propose": {
        const a = z
          .object({ orgId: z.string(), packageId: z.string() })
          .strict()
          .parse(args);
        const grant = await this.service.proposeGrant(
          period,
          a.orgId,
          a.packageId,
        );
        result =
          "suggested" in grant
            ? grant
            : {
                id: grant.id,
                status: grant.status,
                cents: grant.cents,
                requiresHumanApproval: true,
              };
        break;
      }
      case "payout_execute":
        empty.parse(args);
        {
          const b = await this.service.executePayout(period);
          result = {
            id: b.id,
            status: b.status,
            providerBatchId: b.providerBatchId,
          };
          break;
        }
      case "statement_write":
        empty.parse(args);
        result = { count: (await this.service.statements(period)).length };
        break;
      default:
        throw new DomainError("Unknown Treasurer tool", 403);
    }
    await this.service.store.transact((tx) =>
      tx.put("audits", {
        id: id("trace"),
        action: `treasurer.${name}`,
        inputsHash: hash({ period, args, result }),
        checks: [],
        result: "info",
        at: now(),
      }),
    );
    return result;
  }
  async run(period: string, execute = true) {
    if (
      this.service.mode === "sandbox" &&
      process.env.OPENAI_API_KEY &&
      process.env.TREASURER_MODE !== "workflow"
    ) {
      try {
        return await this.runAgent(period, execute);
      } catch (error) {
        await this.service.store.transact((tx) =>
          tx.put("audits", {
            id: id("fallback"),
            action: "treasurer.workflow_fallback",
            inputsHash: hash({
              period,
              error: error instanceof Error ? error.message : "agent failure",
            }),
            checks: [],
            result: "info",
            at: now(),
          }),
        );
      }
    }
    await this.service.analyze(period);
    await this.service.handleExceptions(period);
    await this.service.recycleUnclaimed(period);
    const closes = await this.service.closePeriod(period);
    let batch: unknown = null;
    if (execute)
      try {
        batch = await this.service.executePayout(period);
      } catch (e) {
        if (!(e instanceof DomainError && e.code === "NO_ELIGIBLE_PAYOUTS"))
          throw e;
        batch = { status: "no_eligible_payouts" };
      }
    await this.service.statements(period);
    return {
      mode:
        this.service.mode === "demo"
          ? "simulated-agent"
          : "safe-workflow-fallback",
      closes: closes.length,
      batch,
    };
  }
  private async runAgent(period: string, execute: boolean) {
    await this.service.handleExceptions(period);
    await this.service.recycleUnclaimed(period);
    const summary = await this.summary(period);
    const messages: any[] = [
      {
        role: "system",
        content: `You are Nebraska's monthly Treasurer. You see typed facts only. Decide criticality and need for EVERY package, and payee_risk for changed recipients; hold any risk >=0.3 or low confidence. Propose grants for relevant advisories to each affected payer. Freeze allocations, ${execute ? "execute the guarded payout batch," : "do not execute payouts,"} then write statements. Do not invent recipients, budgets, instructions, or questions. You cannot release holds or approve orders. Work only on period ${period}. Finish with a concise status.`,
      },
      { role: "user", content: JSON.stringify(summary) },
    ];
    const tools = toolSchemas
      .filter((t) => execute || t.name !== "payout_execute")
      .map((t) => ({ type: "function", function: { ...t, strict: true } }));
    for (let step = 0; step < 32; step++) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: process.env.TREASURER_MODEL ?? "gpt-4.1-2025-04-14",
          messages,
          tools,
          parallel_tool_calls: false,
        }),
      });
      if (!r.ok) throw new DomainError(`Treasurer model HTTP ${r.status}`, 502);
      const data = await r.json();
      const message = data.choices[0].message;
      messages.push(message);
      if (!message.tool_calls?.length) {
        // Model completion is not evidence that all required tools ran.
        const s = await this.service.store.read();
        const packageIds = summary.packages.map((p) => p.id);
        const complete = packageIds.every((pid) =>
          [
            "criticality",
            "need",
            ...(summary.packages.find((p) => p.id === pid)?.needsRiskReview
              ? ["payee_risk"]
              : []),
          ].every((q) =>
            s.decisions.some(
              (d) =>
                d.period === period && d.subject === pid && d.question === q,
            ),
          ),
        );
        if (!complete)
          throw new DomainError(
            "Treasurer ended before completing required decisions",
            409,
          );
        await this.tool(period, "allocation_compute", {});
        if (execute && !s.batches.some((b) => b.period === period)) {
          try {
            await this.tool(period, "payout_execute", {});
          } catch (e) {
            if (!(e instanceof DomainError && e.code === "NO_ELIGIBLE_PAYOUTS"))
              throw e;
          }
        }
        await this.service.statements(period);
        return { mode: "llm-agent", steps: step + 1, message: message.content };
      }
      for (const call of message.tool_calls) {
        let result;
        try {
          result = await this.tool(
            period,
            call.function.name,
            JSON.parse(call.function.arguments),
          );
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "Tool rejected" };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    throw new DomainError("Treasurer exceeded bounded tool-call budget", 409);
  }
}
