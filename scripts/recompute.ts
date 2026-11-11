import { readFile } from "node:fs/promises";
import { allocate, usageUnits } from "../src/core/allocator";
import { closeHash } from "../src/core/gate";
import { hash } from "../src/core/util";
import { PARAMS, type Close } from "../src/core/model";
const path = process.argv[2];
if (!path) throw new Error("Usage: npm run recompute -- path/to/audit.json");
const raw = JSON.parse(await readFile(path, "utf8"));
const bundle = raw.audit ?? raw;
const closes: Close[] = bundle.closes;
if (!Array.isArray(closes) || !closes.length)
  throw new Error("No closed snapshots in audit bundle");
for (const close of closes) {
  if (close.paramsVersion !== PARAMS.version)
    throw new Error("Unknown parameter version");
  if (closeHash(close) !== close.snapshotHash)
    throw new Error("Snapshot hash mismatch");
  const recomputed = allocate(
    close.budgetCents,
    usageUnits(close.usageSnapshot),
    close.decisions,
    close.ai,
  );
  if (hash(recomputed) !== hash(close.allocations))
    throw new Error("Allocation mismatch");
  console.log(
    `VERIFIED ${close.id}: ${recomputed.length} package amounts, ${close.snapshotHash}`,
  );
}
