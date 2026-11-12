# Nebraska

## Taglines

- AI is the first user of open source that knows exactly who it owes.
- The AI decides where the money goes. The code decides where it can never go.
- You can still choose not to pay. You just can't say you didn't know.

**One line:** Nebraska is a hosted service that pays the open-source maintainers behind your AI coding agent's dependencies, every month, by actual usage, through PayPal.

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

- A reproducible month: a $500 budget becomes $96.77, $217.74, $161.29 and $24.19, with one cent recycled. The infrastructure package rises from $69.44 with neutral AI weights to $161.29 with bounded AI judgment. Anyone can rerun it (`npm run demo`) and recompute it independently (`npm run recompute`).
- A README prompt injection that asks for an out-of-range weight is rejected to the neutral weight; a recipient whose email changed yesterday is held; rerunning month-end returns the same batch `nebraska-2026-11` instead of paying twice.
- The month-end run is a live Server-Sent Events stream with one event per invariant (I1–I7), persisted so it can be replayed. The same stream drives the UI and the demo film.
- 54 automated tests cover all seven invariants, invalid and injected model output, ambiguous provider failures, reordered webhooks, currency isolation, privacy and ledger integrity; API route handlers and the MCP stdio transport are exercised for real.
- Deployed on Render in PayPal sandbox mode. Against the PayPal sandbox we verified OAuth and that the app's token carries the Payouts, Subscriptions and Webhooks scopes.

## What we learned

Autonomy and accountability can reinforce each other. Let the agent make the decisions that add value, then put irreversible boundaries in code and retain enough evidence for someone else to reproduce the outcome. Confidence helps route decisions; it does not make a transfer safe.

## What's next

Record a complete end-to-end sandbox month with real model decisions, gather real maintainer feedback, calibrate the public policy parameters and pursue the regulated arrangement needed before any real-money rollout. Larger deployments will add verified ledger checkpoints and indexed read projections.

Our long-term vision is for supporting open-source maintainers to become a shared responsibility across the technology industry, rather than relying on a few people’s goodwill.

## Built with

TypeScript · Next.js · React · AG Grid Community · PostgreSQL · SQLite · PayPal Subscriptions · PayPal Orders v2 · PayPal Payouts · PayPal Agent Toolkit · MCP SDK · structured-output LLMs · GitHub OAuth · deps.dev · ecosyste.ms · OSV · Render deployment Blueprint.

## AI disclosure

- **Development:** OpenAI Codex and Anthropic Claude were used for design, planning and implementation.
- **Runtime:** the decision provider and the Treasurer call an OpenAI-compatible chat-completions model with structured output (configured: DeepSeek V4.1 Flash through OpenCode Zen). The model answers only a fixed catalog of typed questions, never sees payment credentials and cannot approve or redirect money. The returned model ID is stored with every decision. No successful runtime inference was observed before the deadline because the model account had no credit; without an answer, decisions fall back to the neutral weight.
- **Local demo decisions are simulated** by a deterministic rules provider and labelled as such. All demo identities are fictional.
- **Video:** synthetic narration (Kokoro-82M, Apache-2.0), synthesized music and sound, no stock footage or third-party logos.

## Testing instructions

- Hosted (PayPal sandbox mode): https://nebraska-paypal-ai-hackathon.onrender.com. Sandbox sign-in and test accounts are listed in the README.
- Local, no credentials: `npm ci && npm run build && npm start`, then follow "Try it in 3 minutes" in the README.
- Source: https://github.com/davidlueng986-alt/nebraska-paypal-ai-hackathon
