import { scan } from "../src/meter";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
const { values } = parseArgs({
  options: {
    root: { type: "string", default: process.cwd() },
    org: { type: "string" },
    base: { type: "string" },
    sbom: { type: "string" },
    session: { type: "string" },
    agent: { type: "string", default: "ci" },
    "dry-run": { type: "boolean" },
    "changed-only": { type: "boolean" },
  },
});
let config: any = {};
try {
  config = parse(await readFile(values.root + "/.nebraska.yml", "utf8"));
} catch {}
const orgId = values.org ?? process.env.NEBRASKA_ORG_ID ?? config.org_id;
if (!orgId) throw new Error("Pass --org or NEBRASKA_ORG_ID");
const events = await scan({
  root: values.root!,
  orgId,
  salt: process.env.NEBRASKA_REPO_SALT ?? "",
  sessionId: values.session ?? process.env.GITHUB_RUN_ID ?? crypto.randomUUID(),
  agent: values.agent!,
  base: values.base,
  sbom: values.sbom,
  changedOnly: values["changed-only"],
  repoId: process.env.NEBRASKA_REPO_ID ?? config.repository_id,
});
if (values["dry-run"])
  process.stdout.write(
    JSON.stringify(
      events.map(({ id, ...e }) => e),
      null,
      2,
    ) + "\n",
  );
else {
  const url =
    process.env.NEBRASKA_URL ?? config.endpoint ?? "http://localhost:3000";
  const token = process.env.NEBRASKA_API_TOKEN;
  if (!token) throw new Error("NEBRASKA_API_TOKEN required");
  for (let i = 0; i < events.length; i += 100) {
    const response = await fetch(url + "/api/usage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        events: events.slice(i, i + 100).map(({ id, ...e }) => e),
      }),
    });
    if (!response.ok)
      throw new Error(
        `Meter upload HTTP ${response.status}: ${await response.text()}`,
      );
  }
  process.stdout.write(
    `Recorded ${events.length} observations; no source code uploaded.\n`,
  );
}
