# API surface

All data APIs return JSON except CSV export. `GET /api/health` is public. Sandbox accepts `Authorization: Bearer <admin-or-org-token>` or a signed browser session. Organization routes enforce org scope; maintainer routes enforce identity; global settlement and operations require administrator access. Demo mode is explicitly unauthenticated and simulated.

## Read

| Method/path | Purpose | Scope |
|---|---|---|
| GET health | Mode/version/health | Public |
| GET bootstrap | Available workspaces, own identities and public package coordinates | Authenticated |
| GET payer?org=…&period=YYYY-MM | Budget, allocation grid, private risk report, grants/statements | Owning org/admin |
| GET maintainer?id=…&period=… | Claims, usage counts, private income and recipient eligibility | Owning maintainer/admin |
| GET audit?org=…&period=… | Frozen usage/decision/receipt bundle for recomputation | Owning org/admin |
| GET export?org=…&period=… | CSV; formula-leading strings are escaped | Owning org/admin |
| GET ledger?period=… | Recent gate audit, batches, holds, webhook metadata, chain head | Admin |
| GET auth/github | GitHub OAuth entry, signed state | Public |
| GET auth/github/callback | State validation, permission-capable encrypted session | OAuth callback |
| GET paypal/return | Verify subscription or approved grant with provider | Owning org/admin |

## Write

| POST path | Body | Scope |
|---|---|---|
| auth/token | `{token}` | Valid scoped or admin token |
| auth/admin | `{token}` | Valid admin token |
| auth/logout | `{}` | Browser session |
| orgs | `{name,currency,publicName?}` | Admin |
| org/privacy | `{orgId,publicName}` | Owning org/admin |
| tokens | `{orgId,days?}` | Admin |
| usage | `{events:[strict_usage_event,…]}` (1–100) | Each event’s owning org/admin |
| subscription | `{orgId,quantity}` | Owning org/admin |
| subscription/cancel | `{orgId}` | Owning org/admin |
| packages/resolve | `{ecosystem,name,version}` | Admin |
| claims | `{packageId,email}`; demo may select maintainerId | Verified GitHub maintainer |
| claims/shares | `{packageId,shares:[{maintainerId,share},…]}` | GitHub repo admin |
| recipient | `{maintainerId,email}` | Owning maintainer/admin |
| hosts | `{name,email,repoUrl,attestation}` | Admin; exact verification attestation required |
| recipient/host | `{maintainerId,hostId:string|null}` | Owning maintainer/admin |
| holds/release | `{maintainerId}` | Human administrator |
| grants/propose | `{orgId,packageId,period}` | Owning org/admin |
| grants/decline | `{grantId}` | Owning org/admin |
| treasurer | `{period,execute?}` | Admin |
| analyze | `{period}` | Admin |
| payout/sync | `{batchId}` | Admin |
| payout/cancel-unclaimed | `{batchId,itemId}` | Admin; UNCLAIMED only |
| reconcile | `{period,toolkit?}` | Admin; read-only external operations |
| osv/scan | `{period}` | Admin |
| webhooks/paypal | Signed PayPal event | Signature verification required |
| demo/approve | `{kind:"grant"|"subscription",id}` | Demo mode only; forbidden in sandbox |

Strict usage event example:

```json
{
  "event_id": "observation-stable-id",
  "org_id": "org_YOUR_ORG",
  "repo_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "period": "2026-11",
  "package": {"ecosystem":"npm","name":"zod","version":"3.23.8"},
  "signal": "import_graph",
  "depth": 0,
  "agent": "coding-agent",
  "session_id": "stable-session",
  "observed_at": "2026-11-11T09:30:00.000Z"
}
```

No `units`, arbitrary weight or recipient fields are accepted. Period must match observation month. Future timestamps beyond five minutes and edits to frozen periods are rejected. Money uses integer minor units internally; quantity-based subscriptions use whole major currency units.

Fiscal-host attestation literal: `I verified the fiscal host identity and its authority to receive these funds`.

Errors contain `error` and a stable `code` for domain failures; validation errors include bounded Zod issue metadata. Payment-provider secrets and bearer tokens are not returned in errors. An uncertain payment error is also retained on the immutable batch for reconciliation.
