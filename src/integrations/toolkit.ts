import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DomainError } from "../core/util";
export type ReadOnlyTool = { name: string; description?: string };
// Explicit allowlist, never auto-grant tools based on their natural-language description.
export const READ_ONLY_TOOL_NAMES = [
  "list_transactions",
  "get_merchant_insights",
] as const;
export function readOnlyTools(tools: ReadOnlyTool[]) {
  return tools.filter((t) =>
    (READ_ONLY_TOOL_NAMES as readonly string[]).includes(t.name),
  );
}
export async function toolkitReport(args: Record<string, unknown>) {
  const selected =
    process.env.PAYPAL_TOOLKIT_REPORT_TOOL ?? "list_transactions";
  if (
    !selected ||
    !(READ_ONLY_TOOL_NAMES as readonly string[]).includes(selected)
  )
    throw new DomainError(
      "Configure a supported read-only PayPal Toolkit report tool",
      503,
    );
  const client = new Client(
    { name: "nebraska-reconciliation", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = process.env.PAYPAL_TOOLKIT_URL
    ? new StreamableHTTPClientTransport(
        new URL(process.env.PAYPAL_TOOLKIT_URL),
        {
          requestInit: {
            headers: process.env.PAYPAL_TOOLKIT_TOKEN
              ? { Authorization: `Bearer ${process.env.PAYPAL_TOOLKIT_TOKEN}` }
              : {},
          },
        },
      )
    : new StdioClientTransport({
        command: process.env.PAYPAL_TOOLKIT_COMMAND ?? process.execPath,
        args: process.env.PAYPAL_TOOLKIT_ARGS
          ? JSON.parse(process.env.PAYPAL_TOOLKIT_ARGS)
          : ["--import", "tsx", "scripts/toolkit-mcp.ts"],
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([k, v]) =>
              v !== undefined &&
              ([
                "PATH",
                "NODE_EXTRA_CA_CERTS",
                "NODE_USE_ENV_PROXY",
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "NO_PROXY",
                "http_proxy",
                "https_proxy",
                "no_proxy",
              ].includes(k) ||
                k.startsWith("PAYPAL_")),
          ),
        ) as Record<string, string>,
      });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (!readOnlyTools(tools.tools).some((t) => t.name === selected))
      throw new DomainError(
        "Configured read-only reporting tool not advertised by MCP server",
        503,
      );
    return await client.callTool({ name: selected, arguments: args });
  } finally {
    await client.close();
  }
}
