# Validation evidence

Performed locally on **2026-11-11**, Node **24.22.1**.

| Check | Observed result |
|---|---|
| `npm run typecheck` | Passed strict TypeScript compilation |
| `npm test` | **44 tests passed** across allocator/gate, full-scope features, webhooks and provider contracts |
| `npm run build` | Passed Next.js production compilation, page generation and route build |
| Standalone meter CLI dry-run | 434 metadata-only observations across 404 project dependencies; salt required |
| `npm run demo` | Completed seeded month; 4 exact example allocations; 1 immutable payout batch; held recipient excluded; captured simulated grant included |
| `npm run recompute -- artifacts/demo-result.json` | Recomputed all 4 package amounts and verified snapshot hash |
| `npm run check:api` | Exercised actual Next route handlers: seed/bootstrap, payer, scoped token, EUR workspace/subscription, simulated grant capture, repeated settlement, maintainer income, CSV, audit, fiscal-host cooldown |
| `npm run check:mcp` | Actual MCP stdio subprocess discovery and calls, process-bound org/token, budget read, usage write |
| Official Toolkit protocol check | Actual `@paypal/agent-toolkit@1.11.0` server advertises only **list_transactions** with `transactions.list` configuration |
| PostgreSQL 17 integration | Actual Docker Postgres instance; 2 independent store connections, 12 concurrent transactions, contiguous sequence/hash replay, rejected UPDATE/DELETE, completed settlement |
| `npm run video` + ffprobe | H.264 + AAC, **1280×720**, approximately **169.04 seconds**, English synthetic narration, generated SRT |

## Financial example

```
next             $ 96.77  verified
zod              $217.74  verified
fast-xml-parser  $161.29  verified
kleur            $ 24.19  held
-----------------------
allocated        $499.99
next-month pool  $  0.01
```

With the separately simulated approved/captured grant, Maya’s batch item is **$411.29** ($161.29 recurring + $250 grant). Only three recipients enter the batch. Repeating the month-end returns the same batch. Returned credits are restored once; UNCLAIMED/HELD remain reserved.

## Specific failure evidence

Tests reject an unverified payee, unavailable receipt pool, package cap breach, a replacement batch ID, invalid AI value, unapproved grant and changed snapshot. They also cover malformed/low-confidence model responses, adversarial README text, ambiguous network failure, duplicate PayPal batch recovery, dedupe expiry, status reordering, frozen-period writes, replay conflicts, anonymous/tampered/expired/cross-org tokens, host consent/cooldowns, six-month unclaimed expiry, cent-preserving shares, separate funded EUR/USD items and private organization names.

The model/PayPal request-contract tests mock external fetches; they are not evidence of external account access. The actual PostgreSQL and MCP tests do not mock their database/protocol transports.

## Verification limits

- No PayPal/GitHub/model secrets were configured, so actual provider accounts, OAuth sign-in, model inference and sandbox money movement were not executed.
- Public source and demo assets were published to [https://github.com/davidlueng986-alt/nebraska-paypal-ai-hackathon](https://github.com/davidlueng986-alt/nebraska-paypal-ai-hackathon). The remote main commit was verified against the local commit.
- No user-owned Render deployment, YouTube upload or Devpost submission was created.
- The managed environment did not expose `cua_repl.js`. Per the Sites workflow, no alternate browser-control path or preview server was improvised. The UI has a passing production build and API checks, but browser visual/interaction QA remains unverified.
- The video is generated from actual local CLI execution and data visualization. It is not browser footage and does not imply real sandbox settlement.

Re-run with `npm run check`, `npm run check:api`, `npm run check:mcp`, and the sandbox/account runbook. PostgreSQL integration must use a separate test database. Review `docs/SUBMISSION.md` before publishing.
