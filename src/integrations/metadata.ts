import { parse } from "yaml";
import { DEFAULT_SIGNALS, type Ecosystem, type Package } from "../core/model";
import { DomainError, now } from "../core/util";
async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!r.ok)
    throw new DomainError(
      `Metadata HTTP ${r.status} (${new URL(url).hostname})`,
      502,
    );
  return r.json();
}
const systems: Record<Ecosystem, string> = {
  npm: "npm",
  pypi: "pypi",
  cargo: "cargo",
  go: "go",
};
const registries: Record<Ecosystem, string> = {
  npm: "npmjs.org",
  pypi: "pypi.org",
  cargo: "crates.io",
  go: "proxy.golang.org",
};
export function githubRepo(
  url: string,
): { owner: string; repo: string } | null {
  const match = url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}
export async function resolvePackage(
  ecosystem: Ecosystem,
  name: string,
  version: string,
): Promise<Package> {
  const key = encodeURIComponent(name);
  const jobs = [
    json(
      `https://api.deps.dev/v3/systems/${systems[ecosystem]}/packages/${key}/versions/${encodeURIComponent(version)}`,
    ),
    json(
      `https://packages.ecosyste.ms/api/v1/registries/${registries[ecosystem]}/packages/${key}`,
    ),
  ];
  if (ecosystem === "npm")
    jobs.push(
      json(`https://registry.npmjs.org/${key}/${encodeURIComponent(version)}`),
    );
  const results = await Promise.allSettled(jobs);
  const [deps, eco, npm] = results.map((r) =>
    r.status === "fulfilled" ? r.value : {},
  );
  if (results.every((r) => r.status === "rejected"))
    throw new DomainError("All package metadata sources unavailable", 502);
  let repoUrl =
    eco.repository_url ??
    deps.links?.find((l: any) => l.label === "SOURCE_REPO")?.url ??
    (typeof npm.repository === "string"
      ? npm.repository
      : npm.repository?.url) ??
    "";
  repoUrl = repoUrl.replace(/^git\+/, "").replace(/\.git$/, "");
  const repo = githubRepo(repoUrl);
  let scorecard: number | null = null;
  let fundingLinks: string[] = Array.isArray(eco.funding_links)
    ? eco.funding_links.filter((x: unknown) => typeof x === "string")
    : [];
  if (npm.funding) {
    for (const f of Array.isArray(npm.funding) ? npm.funding : [npm.funding]) {
      const url = typeof f === "string" ? f : f.url;
      if (url) fundingLinks.push(url);
    }
  }
  if (repo) {
    const extras = await Promise.allSettled([
      json(
        `https://api.deps.dev/v3/projects/${encodeURIComponent(`github.com/${repo.owner}/${repo.repo}`)}`,
      ),
      fetch(
        `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/.github/FUNDING.yml`,
        { signal: AbortSignal.timeout(10000) },
      ).then(async (r) =>
        r.ok ? parse((await r.text()).slice(0, 10000)) : null,
      ),
    ]);
    if (extras[0].status === "fulfilled")
      scorecard = extras[0].value?.scorecard?.overallScore ?? null;
    if (extras[1].status === "fulfilled" && extras[1].value) {
      const f = extras[1].value;
      for (const url of Array.isArray(f.custom) ? f.custom : [f.custom])
        if (typeof url === "string") fundingLinks.push(url);
      for (const login of Array.isArray(f.github) ? f.github : [f.github])
        if (typeof login === "string")
          fundingLinks.push(`https://github.com/sponsors/${login}`);
    }
  }
  const vulnerabilities = await queryOsv(ecosystem, name, version).catch(
    () => [],
  );
  return {
    id: `${ecosystem}:${name}`,
    ecosystem,
    name,
    version,
    repoUrl,
    signals: {
      ...DEFAULT_SIGNALS,
      dependents: Number(
        eco.dependent_repos_count ?? eco.dependent_packages_count ?? 0,
      ),
      maintainers: Math.max(
        1,
        eco.maintainers?.length ?? npm.maintainers?.length ?? 1,
      ),
      maintainerCountKnown: Boolean(
        eco.maintainers?.length || npm.maintainers?.length,
      ),
      scorecard,
      fundingLinks: [...new Set(fundingLinks)],
      vulnerabilities,
    },
    metadataAt: now(),
  };
}
export async function queryOsv(
  ecosystem: Ecosystem,
  name: string,
  version: string,
) {
  const map: Record<Ecosystem, string> = {
    npm: "npm",
    pypi: "PyPI",
    cargo: "crates.io",
    go: "Go",
  };
  const d = await json("https://api.osv.dev/v1/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      package: { name, ecosystem: map[ecosystem] },
      version,
    }),
  });
  return (d.vulns ?? []).map((v: any) => ({
    id: String(v.id),
    summary: String(v.summary ?? v.details ?? "Security advisory").slice(
      0,
      1200,
    ),
    modified: String(v.modified ?? now()),
  }));
}
