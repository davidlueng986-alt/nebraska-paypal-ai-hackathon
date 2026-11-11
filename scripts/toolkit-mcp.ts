import { PayPalAgentToolkit } from "@paypal/agent-toolkit/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const clientId = process.env.PAYPAL_CLIENT_ID,
  secret = process.env.PAYPAL_CLIENT_SECRET;
if (!clientId || !secret)
  throw new Error("PayPal sandbox credentials required for read-only toolkit");
const r = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
  method: "POST",
  headers: {
    Authorization:
      "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
  signal: AbortSignal.timeout(20000),
});
if (!r.ok) throw new Error(`PayPal token HTTP ${r.status}`);
const token = await r.json();
// Official Toolkit server advertises ONLY this read-only action. No order/subscription/payout tools.
const toolkit = new PayPalAgentToolkit({
  accessToken: token.access_token,
  configuration: {
    actions: { transactions: { list: true } },
    context: { sandbox: true },
  },
});
await toolkit.connect(new StdioServerTransport());
