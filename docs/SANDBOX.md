# PayPal / GitHub / model sandbox runbook

This runbook turns the implemented integrations into externally verified evidence. No real service credentials were available during this build, so these steps are intentionally not marked complete.

## 1. Prepare PayPal accounts and app

In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), use **Sandbox**:

1. Create/select a business sandbox account for Nebraska and a sandbox REST app owned by that merchant.
2. Create a personal sandbox payer and at least three personal sandbox recipients. Use addresses controlled by your test accounts; the seeded `example.com` recipients are simulation-only.
3. Check the merchant/app’s Payouts capability and enable/request it where offered. Entitlement and recipient-country restrictions are account-dependent; an API permission error must be resolved in PayPal, not bypassed in code.
4. Copy sandbox client ID and secret into your local `.env` or hosting secret manager. Never paste them into a public issue, public README or chat.
5. Give the business sandbox account adequate test balance in the currencies you plan to send. Capturing funds in the app’s ledger is not proof of Payouts liquidity or account entitlement.

The adapter is fixed to `https://api-m.sandbox.paypal.com`. It cannot switch to a live endpoint.

## 2. Configure the application

Copy `.env.example`, then set:

```
NEBRASKA_MODE=sandbox
APP_URL=https://YOUR-HTTPS-APP
SESSION_SECRET=<independent random 32+ character secret>
ADMIN_API_TOKEN=<independent random administrative token>
PAYPAL_CLIENT_ID=<sandbox app client ID>
PAYPAL_CLIENT_SECRET=<sandbox app client secret>
PAYPAL_WEBHOOK_ID=<registered webhook ID>
GITHUB_CLIENT_ID=<OAuth app client ID>
GITHUB_CLIENT_SECRET=<OAuth app client secret>
MODEL_BASE_URL=<OpenAI-compatible endpoint; default https://api.openai.com/v1>
MODEL_API_KEY=<model key>   # OPENAI_API_KEY also accepted
```

Use Postgres for shared web/worker deployment (`DATABASE_URL`). The Render Blueprint supplies both services with the same database. SQLite can run a single-host local sandbox, but the webhook must reach a public HTTPS route.

Create a GitHub OAuth app with callback `APP_URL/api/auth/github/callback`. The sign-in scope is `read:user public_repo`; only a maintainer with admin/maintain permission on the canonical public repository can claim its package. Repository organization policies may require explicit app approval before GitHub returns usable permissions.

For the model, select an available dated structured-output model on any OpenAI-compatible endpoint (for example OpenCode Zen: `MODEL_BASE_URL=https://opencode.ai/zen/v1`, `DECISION_MODEL=deepseek-v4.1-flash`). The identifier the provider returns is recorded on every decision. Both model defaults are `gpt-4.1-2025-04-14`. `TREASURER_MODE=agent` runs the fixed tool-calling loop. `TREASURER_MODE=workflow` is useful when validating payment plumbing separately while still using structured decision calls.

## 3. Register webhook events

Register `APP_URL/api/webhooks/paypal` for the **same** sandbox app and copy its webhook ID into the server environment:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`
- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.PAYOUTSBATCH.SUCCESS`
- `PAYMENT.PAYOUTSBATCH.DENIED`
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
- `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`
- `PAYMENT.PAYOUTS-ITEM.RETURNED`
- `PAYMENT.PAYOUTS-ITEM.FAILED`
- `PAYMENT.PAYOUTS-ITEM.BLOCKED`
- `PAYMENT.PAYOUTS-ITEM.HELD`

Subscription activation grants a mandate; it does **not** fund an allocation. Only a verified completed sale does. PayPal’s webhook simulator is useful for transport testing, but arbitrary simulated or unsigned payloads are not accepted as real funding receipts.

## 4. Create the payer and actual usage

1. Open the app and select **Workspace sign in**. Use the configured admin token.
2. In Settings, create a workspace and choose a settlement currency. Its budget starts at zero.
3. Select **Set budget**, enter whole currency units, and follow the returned link to PayPal sandbox. Log in as the personal sandbox payer and approve.
4. Return to Nebraska. The server queries PayPal to confirm subscription state and quantity; verified lifecycle events reconcile it again.
5. Wait for `PAYMENT.SALE.COMPLETED`. Check confirmed funding in the payer dashboard. Do not synthesize a receipt directly to make a sandbox demonstration appear funded.
6. Create an org-scoped token and configure the meter on a small repository. Resolve package metadata in Settings and record actual observations.

The application creates the catalog product **before** the quantity-supported monthly plan. Each currency’s fixed unit price is 1.00; subscription quantity is the budget in whole units. The app limits quantity to 1–100,000; this is an application policy, not a claimed PayPal-wide maximum. Confirm actual acceptance for your account/currency.

## 5. Claim and prepare recipient eligibility

1. Sign out, then sign in with GitHub as a real repository administrator/maintainer.
2. Claim a resolved package and bind a personal sandbox recipient email.
3. A new claim waits 14 days. This protects real integration data; there is no sandbox API for bypassing the cooldown.
4. For a judging demonstration before the cooldown expires, show the verified/cooling recipient and use the isolated local demo for successful payouts. To obtain an actual eligible payout, prepare verified claims at least 14 days in advance or use a separately reviewed sandbox-only historical fixture with authentic verification evidence. Never label a fake verification as real.
5. If using a fiscal host, a human admin verifies its identity/authority, then the maintainer explicitly authorizes it. The host and authorization also cool down.

## 6. Run the actual month-end

After real claims become eligible and the period has verified receipts and usage:

1. Press **Run month-end** as admin, or set `SETTLEMENT_PERIOD` for an intentional worker run.
2. Inspect model decisions and the I1–I7 audit. Missing/uncertain recipient risk creates a hold; review/release it as a human where appropriate.
3. Inspect the stored fixed batch ID, provider batch ID and item IDs. Confirm payouts in the PayPal sandbox merchant and recipient accounts.
4. Sync the batch to query individual item states. Read the payer and maintainer statements.
5. Run month-end again. Confirm the same period has one batch and no additional payout.
6. Download the audit bundle and run `npm run recompute -- audit.json`.

The same period cannot be reopened by changing a batch ID. Late funding queues forward. Reconciliation uncertainty requires provider evidence, not another transfer attempt with a different ID.

## 7. Exercise grants and exceptions

- Use an actually affected dependency and OSV advisory. A valid `grant_case` can propose only 100, 250 or 500 currency units. The payer approves in PayPal. The server checks APPROVED/COMPLETED order state and completed capture with matching custom ID, currency and amount before crediting it.
- Approve before batch preparation for inclusion in that batch; otherwise the grant queues to the following period.
- For UNCLAIMED, demonstrate query and optional cancellation; funds stay reserved until confirmed return/cancellation. FAILED/RETURNED balances return once and can be retried only in a later period.
- Never retry an uncertain batch more than 29 days after preparation; preserve the original batch and investigate provider history.

## 8. Read-only reporting and AI Toolkit

`Reconcile PayPal` matches stored sale/capture IDs to PayPal’s transaction report. Reports can lag, so a missing ID is a discrepancy to investigate, not proof of lost money.

The optional AI Toolkit path launches the official `@paypal/agent-toolkit` MCP server through the included script with only `transactions.list` enabled. An actual protocol check verifies it advertises exactly `list_transactions`. Configure its access credentials through the same server-side PayPal environment. A custom `PAYPAL_TOOLKIT_URL` is optional; the client still rejects tools outside its fixed read-only allowlist.

## Evidence to retain

Keep redacted screenshots/video plus provider IDs, period batch identity, signed-webhook success log, item results, model identifiers, audit bundle and recomputation output. Share only dedicated test-account login details needed by judges, using the judging-access mechanism. Never expose server client secrets or GitHub/model keys in a public repository.

## Verified documentation and open checks

Checked 2026-11-11:

- [Official hackathon rules](https://paypalaihackathon.devpost.com/rules): sandbox + AI, working setup or hosted build, public open-source repo and YouTube demo under three minutes.
- [ecosyste.ms OpenAPI](https://packages.ecosyste.ms/docs/api/v1/openapi.yaml): server base `https://packages.ecosyste.ms/api/v1`.
- [Official PayPal Agent Toolkit source](https://github.com/paypal/Agent-Toolkit): `list_transactions`, `transactions.list` configuration, MCP SDK export. Installed version 1.11.0 was protocol-tested with a read-only configuration.
- Catalog product before billing plan and quantity-supported plan are covered by provider request-contract tests; approval rel `approve` and `payer-action` are supported and restricted to sandbox PayPal HTTPS URLs.
- Actual account Payouts entitlement, accepted quantities/currencies, real OAuth permission response, service availability and successful external sandbox transfers **still require the entrant’s accounts**.
