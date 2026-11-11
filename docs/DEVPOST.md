# Nebraska

## Tagline

AI agents fund the open-source maintainers they depend on. Actual usage. Bounded decisions. PayPal settlement.

## Inspiration

AI coding agents assemble software from open source, but the people maintaining that foundation often lose the very interactions that once brought attention and support to their work. Usage grows while the return to maintainers disappears.

An agent also has something previous users rarely had: a precise record of what it depends on. Nebraska connects that knowledge to a payment. It makes maintenance time, security work and careful review part of the value flowing back from AI-assisted development.

We do not claim to force companies to pay. We remove two excuses: not knowing whom to support, and making the payment process too difficult.

## What it does

A company authorizes a monthly budget through PayPal. Hooks and CI observe the packages its coding agents use, without uploading source code. Nebraska deduplicates usage across repositories, asks AI about each dependency’s criticality and resource needs, and allocates confirmed funding to verified maintainers.

The AI Treasurer initiates the monthly payout, holds suspicious recipients and proposes emergency grants for relevant security advisories. Seven code-enforced rules constrain every transfer. Extra grants require a separate human approval on PayPal. Payers see exactly where their budget goes; maintainers see usage, income and the reason behind each amount.

## How we built it

Nebraska uses TypeScript, Next.js, React and AG Grid. A durable append-only event ledger runs on SQLite locally or PostgreSQL in deployment. Deterministic attribution records the shallowest dependency depth per repository each month. The allocation formula applies square-root usage suppression and bounded AI weights, with iterative package caps.

A structured-output model answers only a fixed question catalog. A separate tool-calling Treasurer sees typed facts and has a bounded toolset. It cannot read payment credentials, introduce recipients, enlarge a mandate or approve an order. Unknown decisions fall back conservatively.

PayPal is central to all four money operations:

- **Subscriptions:** a quantity-based monthly human mandate, with renewed consent for changes.
- **Orders v2:** separate approval and capture for emergency grants.
- **Payouts:** one immutable monthly batch for verified recipients.
- **Verified webhooks and reporting:** confirmed funding receipts and per-item reconciliation.

The official PayPal Agent Toolkit is integrated for a strictly read-only transaction-report cross-check. It exposes no money-moving tools to the Treasurer.

We also implemented Python, Rust and Go metering, custom multi-maintainer splits, independent currency pools, fiscal-host routing and a Render web/Postgres/cron Blueprint.

## Challenges

The hardest problem was treating a model as an active financial decision-maker while assuming it can be manipulated. Package authors control many inputs the model reads, and they have a direct incentive to influence it. We separated facts, judgment and enforcement so that even an adversarial decision remains bounded.

Payment retries were another important edge. A timeout cannot justify another transfer. Nebraska reserves credits before sending, freezes the payload, keeps the same batch identity and reconciles uncertain results. Unclaimed or held payments remain reserved until the provider confirms their return.

The original example also hid a one-cent rounding difference. We made it explicit: package amounts round down and residual cents return to the payer’s next pool.

## Accomplishments

The reproducible local run produces the specified allocations: $96.77, $217.74, $161.29 and $24.19 from a $500 pool, with one cent recycled. The infrastructure maintainer’s allocation rises from about $69 with neutral AI weights to $161.29 with bounded judgments. A suspicious recipient is held, a separately approved simulated $250 grant is credited, and rerunning settlement preserves a single batch.

Automated checks cover all seven invariants, invalid model responses, injected package text, ambiguous provider failures, reordered status messages, currency isolation, privacy and ledger integrity. PostgreSQL was exercised with concurrent writers and append-only triggers. The local API and actual MCP transports were also exercised.

## What we learned

Autonomy and accountability can reinforce each other. Let the agent make the decisions that add value, then put irreversible boundaries in code and retain enough evidence for someone else to reproduce the outcome. Confidence helps route decisions; it does not make a transfer safe.

## What's next

Complete external sandbox validation with the entrant’s PayPal/GitHub/model accounts, gather real maintainer feedback, calibrate the public policy parameters and pursue the regulated arrangement needed before any real-money rollout. Larger deployments will add verified ledger checkpoints and indexed read projections.

Our long-term vision is for supporting open-source maintainers to become a shared responsibility across the technology industry, rather than relying on a few people’s goodwill.

## Built with

TypeScript · Next.js · React · AG Grid Community · PostgreSQL · SQLite · PayPal Subscriptions · PayPal Orders v2 · PayPal Payouts · PayPal Agent Toolkit · MCP SDK · structured-output LLMs · GitHub OAuth · deps.dev · ecosyste.ms · OSV · Render deployment Blueprint.

## AI disclosure

The configured runtime decision and Treasurer model defaults to `gpt-4.1-2025-04-14`; the returned identifier is recorded per decision. Local demo decisions are deterministic simulations, not model calls. Codex assisted implementation. Video narration is synthetic eSpeak-NG speech. No stock imagery or music is used.

## Testing instructions and submission links

Follow the repository README for the no-credential interactive demo, `npm run demo`, `npm run check`, `npm run check:api` and `npm run check:mcp`. Follow `docs/SANDBOX.md` for actual external integration.

Before submitting, fill in the entrant-owned public repository URL, optional hosted demo URL and public YouTube video URL. Do not describe the prepared Render configuration as an existing deployment. Do not describe simulated payments as actual sandbox execution. Update this draft’s accomplishments only after retaining the corresponding external evidence.
