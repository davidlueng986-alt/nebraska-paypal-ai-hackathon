import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/mcp";
const requests: any[] = [];
const http = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  requests.push({
    url: req.url,
    authorization: req.headers.authorization,
    body: body ? JSON.parse(body) : null,
  });
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify(
      req.method === "POST"
        ? { results: [{ deduplicated: false }] }
        : {
            org: { currency: "USD", budgetCents: 50000 },
            rows: [
              { id: "npm:zod", name: "zod", u: 100, c: 1.5, n: 1.8, cents: 21774, reason: "test reason", confidence: 0.96 },
            ],
            statements: [{ id: "statement:org:org_bound:2026-11", body: "test" }],
            metrics: { funded: 50000, allocated: 40000, packages: 4 },
          },
    ),
  );
});
await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
const addr = http.address();
if (!addr || typeof addr === "string") throw new Error("Mock server failed");
const client = new Client(
  { name: "nebraska-protocol-test", version: "1" },
  { capabilities: {} },
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", "scripts/mcp.ts"],
  env: {
    ...(Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
    NEBRASKA_URL: `http://127.0.0.1:${addr.port}`,
    NEBRASKA_ORG_ID: "org_bound",
    NEBRASKA_API_TOKEN: "test-scoped-token",
  },
});
try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (
    tools.tools
      .map((t) => t.name)
      .sort()
      .join(",") !== "budget_status,explain_allocation,record_usage"
  )
    throw new Error("Unexpected meter MCP tools");
  await client.callTool({
    name: "budget_status",
    arguments: { period: "2026-11" },
  });
  await client.callTool({
    name: "record_usage",
    arguments: {
      event_id: "mcp-test",
      repo_hash: "sha256:" + "a".repeat(64),
      period: "2026-11",
      package: { ecosystem: "npm", name: "zod", version: "3.23.8" },
      signal: "mcp",
      depth: 0,
      agent: "test",
      session_id: "test-session",
      observed_at: "2026-11-01T00:00:00Z",
    },
  });
  const explained = await client.callTool({
    name: "explain_allocation",
    arguments: { package: "zod", period: "2026-11" },
  });
  const ex = JSON.parse((explained.content as any)[0].text);
  if (ex.u !== 100 || ex.c !== 1.5 || ex.n !== 1.8 || ex.estimate_usd !== 217.74 || ex.confidence !== 0.96)
    throw new Error("explain_allocation shape wrong");
  const res = await client.readResource({ uri: "nebraska://statements/2026-11" });
  if (!(res.contents[0] as any).text.includes("statement:org:org_bound"))
    throw new Error("Statements resource failed");
  if (requests.some((r) => r.body && r.url?.includes("explain")))
    throw new Error("explain_allocation must be read-only");
  if (requests.filter((r) => r.body !== null).length !== 1)
    throw new Error("Only record_usage may write");
  if (requests[1].body.events[0].org_id !== "org_bound")
    throw new Error("Org binding failed");
  if (requests.some((r) => r.authorization !== "Bearer test-scoped-token"))
    throw new Error("Token not bound");
  console.log(
    "PASS: actual stdio MCP discovery, budget read, usage write and process-bound organization/token.",
  );
} finally {
  await client.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
}
const official = new PayPalAgentToolkit({
  accessToken: "unused-test-token",
  configuration: {
    actions: { transactions: { list: true } },
    context: { sandbox: true },
  },
});
const reportClient = new Client(
  { name: "read-only-test", version: "1" },
  { capabilities: {} },
);
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
try {
  await official.connect(serverTransport);
  await reportClient.connect(clientTransport);
  const tools = await reportClient.listTools();
  if (tools.tools.length !== 1 || tools.tools[0].name !== "list_transactions")
    throw new Error("Official Toolkit exposed money-moving tools");
  console.log(
    "PASS: official PayPal Agent Toolkit advertises only list_transactions.",
  );
} finally {
  await reportClient.close();
  await official.close();
}
