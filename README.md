# Nebraska

**Open source, paid forward.** AI coding agents fund the maintainers behind their dependencies, by actual usage, through PayPal.

The AI decides where the money goes. Code decides where it can never go.

Nebraska includes the full P0, P1 **and P2** scope from the supplied design: payer and maintainer dashboards, deterministic metering, a typed decision layer, a tool-calling Treasurer, a guarded append-only ledger, PayPal sandbox integration, advisory monitoring, reconciliation, multiple ecosystems, custom shares, multiple currencies and fiscal hosts.

> **Default: an interactive local simulation.** No credentials are needed and no money moves. Demo identities, funding signals, advisories and transactions are fictional. `NEBRASKA_MODE=sandbox` switches to actual sandbox APIs and authenticated access. There is no live-payment mode.

## Run it

Requires **Node.js 24+** and npm. SQLite is included in Node; no database installation is needed for the local demo.

```bash
npm ci
cp .env.example .env
npm run seed
npm run dev
```

Open **http://localhost:3000**. The dashboard also seeds an empty demo database automatically. `npm run build && npm start` runs the production build.

The initial November demonstration has a $500 budget, 534 package/repository observations, a suspicious recipient on hold, and a proposed $250 security grant. To reproduce the complete flow:

1. Open **Emergency grants** and approve the clearly labelled simulated grant.
2. Select **Run month-end**. Three eligible recipients settle; the held recipient stays credited.
3. Switch to **Maintainer**: Maya receives **$161.29 recurring income + $250.00 grant**.
4. Run month-end again. The same immutable batch is returned; no second payment is created.
5. Download **Statements → Audit bundle**, then independently recompute it.

The dashboard uses your current UTC month. The standalone reproducibility script uses `2026-11` and an isolated in-memory ledger:

```bash
npm run demo
npm run recompute -- artifacts/demo-result.json
npm run check
npm run check:api
```

`npm run demo` produces a fresh `artifacts/demo-result.json` and never modifies the web app’s database. Local persisted demo state lives in `data/demo.db`; sandbox uses `data/sandbox.db` when Postgres is not configured. To start another demo safely, set `SQLITE_PATH=data/another-demo.db` before seeding.

繁體中文快速開始：[docs/QUICKSTART.zh-Hant.md](docs/QUICKSTART.zh-Hant.md).

## What is implemented

| Area | Included |
|---|---|
| Meter | npm/package-lock v1–3, pnpm v9, import scanning, before/after npm lockfile comparison, agent hooks, CycloneDX/SPDX, Poetry/uv, pinned requirements, Cargo, Go modules |
| Ingestion | Strict event schema, stable salted repository hashes, retry deduplication, monthly minimum-depth attribution; no source uploads |
| Decision layer | Fixed question catalog; structured-output LLM adapter; explicitly simulated provider; confidence/range checks; model version and input hashes |
| Treasurer | Real LLM function-call loop in sandbox, fixed tool schemas, bounded steps; deterministic demo/workflow orchestration; no raw external text in agent context |
| Allocation | Depth decay, square-root suppression, bounded c/n, iterative package caps, integer-cent outputs, public versioned parameters |
| Ledger | Durable append-only hash chain; transactional projections; SQLite and PostgreSQL; snapshots, grants, receipt IDs, holds, payout items and audits |
| PayPal | Catalog products, quantity plans, subscription create/revise/cancel, Orders capture, Payouts, item queries/cancel, verified idempotent webhooks, reporting |
| Payer UI | Budget/funding/allocation/balances, allocation comparison, AG Grid sorting/filter/search, CSV export, grant approvals, private supply-chain report, audit bundles |
| Maintainer UI | GitHub OAuth permissions, claims, email cooldowns, organization/repository counts, income statuses, custom splits, statements, fiscal-host routing |
| Operations | OSV-triggered proposals, exception decisions and in-app review notifications, daily worker, read-only official PayPal Agent Toolkit MCP cross-check |
| P2 | npm/Python/Rust/Go, custom maintainer shares, USD/EUR/GBP/CAD/AUD pools, verified and explicitly authorized fiscal-host recipients |
| Delivery | Render web/Postgres/cron Blueprint, CI, composite GitHub Action, MIT license, English Devpost draft, video, subtitles, documentation |

Full requirement-to-file traceability: [docs/FEATURES.md](docs/FEATURES.md).

## The money model

```
u_i = sum over repositories of 0.5 ^ minimum_dependency_depth
w_i = sqrt(u_i) * criticality_i * need_i
```

AI weights stay in `[0.5, 2]`, reverting to `1` below 80% confidence. Each package is capped at `max(25%, 2/K)` of its payer’s confirmed recurring pool; capped weight is redistributed. Package amounts round **down** to a cent. The remainder returns to the payer’s next open pool.

| Example package | Usage | Criticality | Need | Recurring allocation |
|---|---:|---:|---:|---:|
| Framework | 400 | 1.0 | 0.6 | $96.77 |
| Utility | 100 | 1.5 | 1.8 | $217.74 |
| Infrastructure | 25 | 2.0 | 2.0 | $161.29 |
| Helper | 9 | 1.0 | 1.0 | $24.19 |

These required example amounts total **$499.99**; the remaining **$0.01** is explicitly recycled. Policy parameters are starting assumptions, **not empirically calibrated findings**. Multi-maintainer splits use deterministic largest-remainder rounding to preserve each package’s credited cents.

Balances aggregate by **maintainer and currency across payers/packages**. The initial minimum is 10 units of each supported currency. Smaller balances roll forward. Unclaimed amounts expire after six calendar months and return to the original payer’s following-month pool. New claims, email changes and host authorization have a 14-day cooldown.

Extra grants use a separate human-approved mandate and are outside the recurring package cap. Capture must be confirmed before credit. A grant captured after a period’s payout batch was prepared queues for the next month.

## Seven enforced invariants

| Gate | Enforced boundary |
|---|---|
| I1 | Verified recipient, valid claim, cooldowns complete, no active hold; fiscal host verified and authorized |
| I2 | Allocations ≤ actual receipts; payout amounts equal funded ledger credits; integer cents; isolated currencies |
| I3 | Every recurring package respects its payer’s allocation cap |
| I4 | One `nebraska-{period}` global batch; immutable items/payload; no reused credits; retries stop before dedupe expiry |
| I5 | Every normalized decision satisfies the fixed catalog’s types and bounds |
| I6 | Grant credits require provider-confirmed approval/capture evidence |
| I7 | Frozen usage/decisions/parameter version recompute the allocation and every payout has traceable credits |

Payout item IDs use a stable hash of the maintainer plus period and currency, allowing multiple currency items in the **same** period batch while fitting PayPal ID limits. Local reservations persist before the external call. An uncertain transfer keeps its reservations and retries the exact payload; it cannot create a replacement batch. `UNCLAIMED`, `HELD`, and `BLOCKED` stay reserved. Confirmed failure/return/cancellation releases credits for a future monthly batch.

[Architecture and implementation decisions](docs/ARCHITECTURE.md) · [Security and recovery](docs/SECURITY.md).

## Connect actual sandbox services

Follow [docs/SANDBOX.md](docs/SANDBOX.md) for the complete setup and evidence checklist.

Set `NEBRASKA_MODE=sandbox`, `APP_URL`, `SESSION_SECRET`, `ADMIN_API_TOKEN`, PayPal sandbox app credentials/webhook ID, GitHub OAuth credentials and `OPENAI_API_KEY`. The example file documents every variable. Never place populated `.env` files or private keys in a public repository.

Sandbox browser access accepts an admin token or a signed organization token; maintainers use GitHub OAuth. An administrator creates organizations and scoped meter tokens in Settings. Organization tokens cannot access other organizations or payment operations. The only public APIs are health, OAuth entry/callback and signature-verified PayPal webhooks. The demo has no authentication and is intended for local judging.

Default models are pinned to `gpt-4.1-2025-04-14`. The API-returned model identifier is recorded per decision. Change to an available dated model if your account lacks access. `TREASURER_MODE=workflow` uses deterministic orchestration while retaining real structured decisions; unavailable decisions use conservative defaults. The decision-provider boundary can accommodate Jev; the included real implementation uses structured LLM output rather than guessing an unverified Jev API.

**No external PayPal/GitHub/LLM execution is claimed for this handoff:** those credentials were not supplied. Provider request contracts are tested with mocks; actual external confirmation requires the sandbox runbook.

## Meter, MCP and CI

```bash
export NEBRASKA_ORG_ID=org_YOUR_ORG
export NEBRASKA_URL=http://localhost:3000
# Set NEBRASKA_API_TOKEN and NEBRASKA_REPO_SALT through your secret manager.
npm run meter -- --root /path/to/repo --base HEAD~1 --dry-run
npm run meter -- --root /path/to/repo --base HEAD~1
npm run mcp
```

Use the **same secret salt and canonical repository identity** in hooks and CI. Normalized `git remote.origin.url` is the default identity; use `NEBRASKA_REPO_ID` when no origin exists. Absolute path is only a local fallback. Hooks and CI should share a stable session ID for exact replay deduplication; monthly attribution also deduplicates across sessions and versions.

[Agent hook example](examples/claude-hooks.json) · [MCP config](examples/mcp.json) · [Composite Action](action.yml) · [Meter limitations](docs/METER.md).

## Deploy and operate

Use [render.yaml](render.yaml) to provision Next.js, Postgres and a daily cron. Enter sandbox secrets in Render. Set `APP_URL` to the web service’s HTTPS URL and register the webhook/OAuth callbacks before testing. The daily worker syncs pending payouts, handles exceptions and scans OSV; on UTC day 1 it settles the preceding month.

```bash
npm run worker
# Intentional manual close; never change IDs to retry a transfer:
SETTLEMENT_PERIOD=2026-11 npm run worker
```

Optional AI Toolkit cross-check uses the **official `@paypal/agent-toolkit`**, through `scripts/toolkit-mcp.ts`, with **only `transactions.list` enabled**. The client also enforces an explicit read-only allowlist. It never gives the Treasurer arbitrary Toolkit tools. `PAYPAL_TOOLKIT_URL` can select a separately hosted compatible MCP server.

For Postgres integration verification, point `TEST_DATABASE_URL` at an **isolated test database** and run `npm run check:postgres`. It tests concurrent transactions, hash-chain replay, append-only triggers and settlement. Do not point that script at an operational ledger.

## Submission materials

- [Devpost English draft](docs/DEVPOST.md)
- [Demo video and publishing notes](docs/VIDEO.md)
- [Final account-dependent checklist](docs/SUBMISSION.md)
- [Test evidence](docs/VALIDATION.md)
- [Original design and decision records](docs/source/)

`npm run video` regenerates a narrated MP4, poster, English SRT captions and the underlying command transcript from a **fresh local demo execution**. Requires Python/Pillow and ffmpeg. It combines real command results with data visualizations; it is **not a browser screen recording** and does not claim actual sandbox payments. For submission, add browser/PayPal sandbox footage after completing the account-dependent runbook.

The project does not force anyone to fund open source, automatically authenticate legal fiscal-host identity, provide FX conversion, or operate a licensed money-transfer service. Sandbox is the supported integration target; real-money operation requires an appropriate regulated arrangement. See [docs/SECURITY.md](docs/SECURITY.md).

Licensed under [MIT](LICENSE). Third-party dependencies retain their own licenses; the original supplied planning documents remain reference material.
