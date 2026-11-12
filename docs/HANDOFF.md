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
