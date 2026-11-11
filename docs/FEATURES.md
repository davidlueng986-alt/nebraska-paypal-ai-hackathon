# Full-scope requirement traceability

“Implemented” means executable code exists and its stated local checks passed. It does not imply external account provisioning, sandbox payment execution, deployment or submission.

| Priority | Requirement | Implementation / entry point | Verification |
|---|---|---|---|
| P0 | npm lockfile changes, imports, hooks | `src/meter/index.ts`, `scripts/meter.ts`, `examples/claude-hooks.json` | Graph/import/privacy fixtures; CLI dry-run |
| P0 | pnpm | `pnpmLock` | Scoped package + transitive v9 fixture |
| P0 | CycloneDX/SPDX baseline | `sbomPackages`, `--sbom` | Both formats parsed in tests |
| P0 | MCP record_usage, budget_status | `scripts/mcp.ts` official SDK | Typecheck; MCP integration check |
| P0 | Deduplicated min-depth monthly usage | `usageSchema`, `usageUnits`, `Nebraska.recordUsage` | Signals/sessions/versions and conflicting replay tests |
| P0 | Durable append-only ledger | `src/core/store.ts` | Hash tamper/rollback tests; actual Postgres concurrent transaction and trigger checks |
| P0 | Package→repository/funding resolution | `src/integrations/metadata.ts` | Fixed official API hosts; ecosyste.ms base verified against OpenAPI |
| P0 | GitHub OAuth claims | `src/integrations/github.ts`, API `claims` | Repository permission checks; typed route; requires real OAuth to externally validate |
| P0 | Cooldowns, holds, unclaimed credits | `recipient`, `attachUnclaimed`, `recycleUnclaimed` | Eligibility, expiry and origin-payer tests |
| P0 | criticality / need / payee_risk / grant_case | `src/core/decisions.ts` | Confidence/range/injection/offline tests; strict model API contract test |
| P0 | Allocator | `src/core/allocator.ts` | Exact sample, varied pool sizes, caps, integer cents, suppression |
| P0 | I1–I7 | `src/core/gate.ts` | One failing case per invariant, plus valid batch |
| P0 | Subscriptions create/revise/cancel | `src/integrations/paypal.ts` | Catalog→plan→subscription request contract; API consent flow |
| P0 | Orders human-approved grant | `proposeGrant`, `captureGrant`, PayPal adapter | No credit before approval; captured grant; late-grant queue |
| P0 | Payouts and safe retry | `prepareBatch`, `executePayout`, `applyPayoutItems` | Ambiguous failure, duplicate request recovery, expiry cutoff and same-batch replay |
| P0 | Verified webhooks | `src/integrations/webhooks.ts` | Signature rejection, repeated event/sale IDs, currency mismatch, immutable close |
| P0 | Treasurer | `src/core/treasurer.ts` | Executed workflow; bounded typed tools; real LLM call contract implemented |
| P0 | Payer UI + AG Grid | `components/dashboard.tsx`, `app/globals.css` | Production build + API integration; browser visual QA unavailable in this environment |
| P0 | Maintainer UI | Same dashboard with role switch | Income, count privacy, claims, settings and statements endpoints exercised |
| P0 | One-command seeded month | `seedDemo`, `scripts/demo.ts` | Actual local execution, example values and final payout audit |
| P0 | English README, license, Devpost, video | `README.md`, `LICENSE`, `docs/DEVPOST.md`, `scripts/video.py`, `artifacts/` | Narrated local-execution video; external publishing remains account-dependent |
| P1 | Private supply-chain risk report | `payerView().risk`, Supply chain page | Cross-org denial and anonymous maintainer views |
| P1 | OSV-triggered grants | `queryOsv`, `osv/scan`, `scripts/worker.ts` | Advisory demo; real network adapter implemented |
| P1 | AI Toolkit read-only reconciliation | `toolkit.ts`, `toolkit-mcp.ts`, `reconcile.ts` | Official SDK installed; allowlist and actual MCP advertisement checks |
| P1 | GitHub Action | Root `action.yml`, `.github/workflows/ci.yml` | Composite inputs through environment/quoted arguments |
| P1 | payout_exception | `handleExceptions`, in-app hold queue | RETURNED → next month; UNCLAIMED/HELD remain reserved and notify |
| P2 | Python | Poetry/uv + pinned requirements and imports | Dependency graph fixture |
| P2 | Rust | Cargo.lock + Cargo.toml + imports | Transitive graph fixture |
| P2 | Go | go.mod direct/indirect + imports; SBOM option | Direct/indirect fixture; documented depth limitation |
| P2 | Custom multi-maintainer shares | `claims/shares`, deterministic credit splitting | Exact 70/30 cent preservation; all claimant shares must sum to one |
| P2 | Multi-currency | Org currency, receipt checks, credit groups, item IDs | Funded cross-org EUR totals stay separate from USD |
| P2 | Fiscal-host receipt routing | `hosts`, `recipient/host`, `recipient()` | Verified host, separate consent, cooldown and authoritative recipient checks |

## External completion boundaries

- PayPal sandbox business app, Payouts entitlement and test accounts must belong to the entrant. No real account credentials were present here.
- GitHub OAuth and an available dated model must be configured to exercise actual identity/model calls.
- Render Blueprint is ready; no user-owned Render deployment has been created.
- Repository source is ready locally, but no public remote URL was supplied or created.
- Video includes actual CLI execution results and data visuals; it does not contain browser or actual PayPal sandbox footage. Capture that footage for the final submission.
- YouTube/Devpost publication is not performed by local code generation.
