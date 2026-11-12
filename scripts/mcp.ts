import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { usageSchema } from "../src/core/model";
const url = process.env.NEBRASKA_URL ?? "http://localhost:3000",
  org = process.env.NEBRASKA_ORG_ID,
  token = process.env.NEBRASKA_API_TOKEN;
if (!org || !token)
  throw new Error("NEBRASKA_ORG_ID and NEBRASKA_API_TOKEN are required");
const server = new McpServer({ name: "nebraska-meter", version: "1.0.0" });
async function request(path: string, body?: unknown) {
  const r = await fetch(url + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Nebraska HTTP ${r.status}`);
  return r.json();
}
server.registerTool(
  "record_usage",
  {
    description:
      "Record one privacy-preserving package observation for the configured payer. Cannot modify money, weights, recipients or authorization.",
    inputSchema: usageSchema.omit({ org_id: true }).shape,
  },
  async (input) => {
    const result = await request("usage", {
      events: [{ ...input, org_id: org }],
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);
server.registerTool(
  "budget_status",
  {
    description:
      "Read this payer’s authorized budget, confirmed funding and observed package count. Does not move money.",
    inputSchema: { period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) },
  },
  async ({ period }) => {
    const view = await request(
      `payer?org=${encodeURIComponent(org!)}&period=${period}`,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            currency: view.org.currency,
            authorizedCents: view.org.budgetCents,
            fundedCents: view.metrics.funded,
            allocatedCents: view.metrics.allocated,
            packages: view.metrics.packages,
          }),
        },
      ],
    };
  },
);
server.registerTool(
  "explain_allocation",
  {
    description:
      "Read-only: explain one package's allocation (usage u, criticality c, need n, estimated USD, reason, confidence). Cannot move money or change weights.",
    inputSchema: {
      package: z.string().min(1).max(214),
      period: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    },
  },
  async ({ package: name, period }) => {
    const p = period ?? new Date().toISOString().slice(0, 7);
    const view = await request(
      `payer?org=${encodeURIComponent(org!)}&period=${p}`,
    );
    const row = view.rows.find(
      (r: any) => r.name === name || r.id === name,
    );
    if (!row)
      return {
        isError: true,
        content: [{ type: "text", text: `No usage for ${name} in ${p}` }],
      };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            u: row.u,
            c: row.c,
            n: row.n,
            estimate_usd: row.cents / 100,
            reason: row.reason,
            confidence: row.confidence,
          }),
        },
      ],
    };
  },
);
server.registerResource(
  "statements",
  new ResourceTemplate("nebraska://statements/{period}", { list: undefined }),
  {
    title: "Nebraska statements",
    description: "Read-only payer statements for a month (YYYY-MM).",
    mimeType: "application/json",
  },
  async (uri, { period }) => {
    const p = String(period);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new Error("Invalid period");
    const view = await request(
      `payer?org=${encodeURIComponent(org!)}&period=${p}`,
    );
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(view.statements ?? []),
        },
      ],
    };
  },
);
await server.connect(new StdioServerTransport());
