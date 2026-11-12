# Handoff between agents

## From Agent A (Core) to Agent B (UI) and Agent C (Video)

Published contracts (all fixtures are **simulated, fictional** demo-mode output unless a file says otherwise):

| File | What it is |
|---|---|
| `contracts/month-end-run.schema.json` | One month-end event: `run_id, seq, at, actor, step, status, invariant?, title, detail`. |
| `fixtures/month-end-run.json` | Full 26-event run: usage snapshot, 4 package decisions (the injected-README `need` is rejected to neutral 1.0), `payee_risk` hold for a recipient whose email changed yesterday, $250 grant, allocation `$96.77 / $217.74 / $161.29 / $24.19` (1¢ recycled), I1–I7 as seven gate events, batch `nebraska-2026-11`, item results, statements. |
| `fixtures/payer-month.json` | Exact `GET /api/payer?org=org_acme&period=2026-11` shape. |
| `fixtures/maintainer-income.json` | Exact `GET /api/maintainer?id=m3&period=2026-11` shape (Maya). |
| `fixtures/dependency-graph.json` | `npm run graph -- --root . --out fixtures/dependency-graph.json`: nodes `{id,name,depth,dependents}` and edges `{from,to}`, from this repo's lockfile. |

Regenerate fixtures: `npm run fixtures`.

Live stream (admin/session auth outside demo mode):

- `POST /api/month-end/runs` `{period, execute?}` → `202 {run_id, events}`.
- `GET /api/month-end/runs/{id}/events` → Server-Sent Events, `event: month-end`, `id: seq`, `data:` one event. Closes after the final system event (`Month-end run complete` / `Month-end run failed`).
- `?replay=1&delay_ms=600` replays the persisted events with pacing (no re-execution). Use this for screen recording.

Swap fixture for live data without code changes: the payload shapes above are identical.

### For Agent B (UI)
- Drive the month-end screen from the SSE stream; fall back to `fixtures/month-end-run.json` when offline.
- Show a permanent "Simulation" badge in demo mode and the `demoOverrides` badge when the API reports it (see `/api/health`, once the sandbox override ships).
- Gate events carry `invariant`; render exactly seven.

### For Agent C (Video)
- Use `GET .../events?replay=1` or the fixture; do not claim the fixture is a real sandbox run. A real sandbox event stream will be added at `artifacts/sandbox-run/` only once a real sandbox month has actually been run.

## From Agent B (UI) to Agent A (Core)

- Optional API additions the UI already handles if present: `rows[].aiOffCents` in `GET payer` (else a client mirror of the allocator is used); `demoOverrides` on `GET health` or `GET bootstrap` (any key matching /cooldown/ shows "Demo: cooldown shortened").
- Live demo seed: kleur's injected README is not rejected in a live run (it is in the fixture). If you want the injection to show in the live video segment, make the demo decision provider reject it live as well.
- Small shared-file changes made by Agent B: `vitest.config.ts` (excludes `e2e/**` from unit tests), `package.json` (`capture` script, `@playwright/test@1.63.0` dev dependency; removed nothing else), `.gitignore` (`!artifacts/ui/`).
- README screenshots: `artifacts/ui/desktop/*.png` (1440×900) and `artifacts/ui/mobile/*.png` (390×844). All show demo mode.

## From Agent B (UI) to Agent C (Video)

- Design changed to a plain tool-like UI at the user's request; use `design/tokens.json` v2 (white, #F6F8FA, #D1D9E0 borders, green #1F883D for paid/primary, amber #9A6700 for held/simulated, red #D1242F for rejections, system fonts).
- Routes: `/start`, `/` (this month), `/approvals`, `/demo/approval` (simulated PayPal stand-in, demo only), `/month-end`, `/maintainer`, `/maintainer/claim`, `/statements/YYYY-MM`, `/ledger`, `/supply-chain`, `/settings`.
- Deterministic month-end: `/month-end?replay=fixture&speed=1` autoplays the fixture (~30 s at speed 1). `?data=live` forces the live API.
- Footage: `rm -f data/demo.db* && npm run build && npm start`, then `npm run capture`. It walks the main flow and writes one `.webm` and `.png` per screen to `artifacts/video/captures/`. The run mutates the demo database, so reset before re-recording.
