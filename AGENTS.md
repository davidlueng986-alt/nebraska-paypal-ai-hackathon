# Nebraska — persistent working context

User request (Traditional Chinese): complete ALL Nebraska PayPal AI Hackathon functionality, including P0/P1/P2, in a NEW folder. Do not stop at P0. Source specifications are in docs/source. No subagents requested.

## Contract
- No deposits, no distinction between AI/human contributions.
- Deterministic usage: minimum depth per org/repo/package/month, gamma=.5. AI changes only c/n (.5–2); confidence <.8 falls back to 1.
- All money integer minor units. Allocation: sqrt(u)*c*n, iterative max(.25,2/K) cap; deterministic remainder rounding.
- Only actual verified PayPal receipts fund allocations. I1–I7 are enforced by gate before provider calls.
- One immutable global payout batch per period, same payload/ID on uncertain retries. Never regenerate a batch to fix a network failure.
- 14-day claim/email cooldown, risk >=.3 held; <$10 equivalent currency threshold rolls over. Six-month unclaimed credits return to original payer's next-month pool.
- Read untrusted text ONLY in decision provider. Treasurer sees typed facts. Provider credentials never enter model context.
- Demo must be explicitly labelled and isolated from sandbox mode. Live money unsupported.
- P2 currencies are separate receipt pools (USD/EUR/GBP/CAD/AUD); no invented FX. Fiscal hosts must be explicitly verified and authorized.

## Architecture
Next.js 16 / React 19 / AG Grid. Domain TypeScript in src/core. Durable append-only hash-chained event ledger: SQLite locally via node:sqlite, Postgres via DATABASE_URL for Render. Journal projections are rebuildable. HTTP APIs are authenticated and org scoped outside demo mode. PayPal sandbox REST, GitHub OAuth, metadata adapters, structured LLM provider, read-only PayPal toolkit MCP adapter. MCP and meter CLI, scheduler worker.

## Commands
`npm install`; `npm run seed`; `npm run dev`; `npm run check`; `npm run demo`.
Tests cover money safety, injection, retries, webhooks, privacy and meter fixtures. Do not claim external sandbox execution without credentials and observed results.

## Progress
Implementation complete across P0/P1/P2. Read docs/STATUS.md and docs/VALIDATION.md for current checks, external blockers and handoff. 44 tests, production build, direct API integration, actual MCP transport and PostgreSQL concurrent-write/trigger/settlement checks passed. Narrated 169-second demo assets are in artifacts/. Public source is published at https://github.com/davidlueng986-alt/nebraska-paypal-ai-hackathon. Do not claim actual sandbox payment, GitHub OAuth verification, model inference, Render deployment, YouTube upload or Devpost submission without observed evidence.

## Delivery
README English; docs/QUICKSTART.zh-Hant.md; docs/FEATURES.md traceability; sandbox runbook; Devpost text; video assets/script; Render config; MIT license. Final must distinguish implemented/tested local functionality from credentials-dependent external validation and publication.
