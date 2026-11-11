# Meter integration and boundaries

The meter runs on the payer’s machine or CI. It reads lockfiles and selected source imports locally, then transmits only strict usage events. Monthly accounting ignores event count: it takes each org/repo/package’s smallest depth, then sums `0.5^depth` across repositories.

## Inputs

| Format | Support |
|---|---|
| package-lock.json v1 | Recursive dependency structure |
| package-lock.json v2/v3 | Root direct dependencies, hoisted/nested traversal; reachable transitive nodes |
| pnpm-lock.yaml v9 | Importer dependencies and snapshots; scoped names and peer suffix stripping |
| Python | pyproject.toml + Poetry/uv lock dependency graph; pinned `requirements.txt` |
| Rust | Cargo.toml + Cargo.lock graph |
| Go | go.mod require blocks/lines, direct depth 0 and `// indirect` depth 1 |
| CycloneDX JSON | `components[].purl` |
| SPDX JSON | `packages[].externalRefs` purl |
| Imports | Static JS/TS import/from/require/dynamic import; Python import/from; Rust use/extern crate; Go import path prefixes |

Package-lock comparison reads the selected base revision locally using `git show`. Missing base means every current npm coordinate is treated as new. `--changed-only` restricts import scanning to `git diff --name-only BASE`; the lockfile/SBOM baseline still runs. Empty/missing source files are skipped. Package-manager caches, vendor, target, node_modules, hidden directories and symlinks are not recursively scanned.

## Stable identity

`repo_hash = SHA256(secret_salt + NUL + canonical_repository_identity)`.

By default the identity is normalized git origin, stripping `.git` and normalizing GitHub-style SSH syntax. Use `NEBRASKA_REPO_ID` or `.nebraska.yml` `repository_id` for repositories without a stable origin. With no origin or explicit identity, the local root path is the fallback; that fallback will differ across machines. The salt must be private and stable across hooks/CI. Changing salt or canonical identity creates a different repository for monthly attribution.

An event ID derives from organization, repo hash, period, session, package coordinate, depth and signal. Replaying the same observation with a later observation timestamp is harmless; reusing an ID with different substantive fields is rejected. The server also freezes already-closed periods.

## Hook

Use `examples/claude-hooks.json`, replacing absolute paths. Set `NEBRASKA_URL`, `NEBRASKA_ORG_ID`, scoped `NEBRASKA_API_TOKEN`, `NEBRASKA_REPO_SALT`, and preferably a stable `--session` value. Run at a deterministic session-end hook, not through the model’s memory.

## GitHub Action

After publishing this repository, reference its composite `action.yml` by repository and commit SHA. This example assumes a checked-out local copy:

```yaml
name: Open-source usage
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  meter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      # Check out the Nebraska action into .nebraska-action, or reference a published pinned action.
      - uses: ./.nebraska-action
        with:
          endpoint: ${{ vars.NEBRASKA_URL }}
          org-id: ${{ vars.NEBRASKA_ORG_ID }}
          api-token: ${{ secrets.NEBRASKA_API_TOKEN }}
          repo-salt: ${{ secrets.NEBRASKA_REPO_SALT }}
          base: HEAD~1
```

The Action passes user inputs via environment variables and quoted argument arrays. It does not interpolate untrusted input into executable shell source. Do not expose write-capable tokens to untrusted pull requests.

## MCP

`scripts/mcp.ts` advertises exactly `record_usage` and `budget_status` using the official SDK over stdio. Stdout is reserved for JSON-RPC. Org ID and API token are bound by process environment, not model input. It cannot send payments, change budgets, set weights, or choose another payer.

## Precision limits

Static import scanning is a useful signal, not runtime tracing. It can miss aliased Python import names, namespace packages, generated code and dynamic loading. Python/Rust graph adapters choose a package by name when multiple locked versions exist; a richer purl/version graph should be used for complex workspaces. Go’s lockfile-free indirect marker provides a conservative depth-1 baseline rather than a complete module graph. SBOM entries without a dependency graph use depth 1; directly observed imports promote them to depth 0. pnpm pre-v9 and exotic workspace layouts are not guaranteed. Supply a generated SBOM where those limitations matter.

The system does not claim source-execution attestation. Payer infrastructure is trusted to report its own usage; reports are deterministic and auditable rather than cryptographically proven executions.
