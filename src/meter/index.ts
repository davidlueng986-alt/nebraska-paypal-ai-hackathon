import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import { execFileSync } from "node:child_process";
import { parse as yaml } from "yaml";
import { parse as toml } from "smol-toml";
import { type Ecosystem, type Usage } from "../core/model";
import { DomainError, hash, now, periodOf } from "../core/util";
export type Dependency = {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  depth: number;
};
export function npmLock(lock: any): Dependency[] {
  if (!lock.packages) {
    const out: Dependency[] = [];
    const walk = (deps: any, depth: number) => {
      for (const [name, value] of Object.entries(deps ?? {})) {
        const v = value as any;
        out.push({
          ecosystem: "npm",
          name,
          version: v.version ?? "unknown",
          depth,
        });
        walk(v.dependencies, depth + 1);
      }
    };
    walk(lock.dependencies, 0);
    return out;
  }
  const entries: Record<string, any> = lock.packages;
  const root = entries[""] ?? {};
  const direct = {
    ...root.dependencies,
    ...root.devDependencies,
    ...root.optionalDependencies,
  };
  const depths = new Map<string, number>();
  const queue = Object.keys(direct).map((name) => ({
    path: `node_modules/${name}`,
    depth: 0,
  }));
  while (queue.length) {
    const { path, depth } = queue.shift()!;
    if (depths.has(path) && depths.get(path)! <= depth) continue;
    const pkg = entries[path];
    if (!pkg) continue;
    depths.set(path, depth);
    for (const name of Object.keys({
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
    })) {
      let base = path;
      let found = "";
      while (base) {
        const candidate = `${base}/node_modules/${name}`;
        if (entries[candidate]) {
          found = candidate;
          break;
        }
        const i = base.lastIndexOf("/node_modules/");
        base = i >= 0 ? base.slice(0, i) : "";
      }
      if (!found && entries[`node_modules/${name}`])
        found = `node_modules/${name}`;
      if (found) queue.push({ path: found, depth: depth + 1 });
    }
  }
  return [...depths.entries()].map(([path, depth]) => ({
    ecosystem: "npm",
    name: entries[path].name ?? path.split("node_modules/").at(-1)!,
    version: entries[path].version ?? "unknown",
    depth,
  }));
}
export function pnpmLock(lock: any): Dependency[] {
  const snapshots = lock.snapshots ?? lock.packages ?? {};
  const roots = Object.values(lock.importers ?? { ".": lock });
  const versions = new Map<string, number>();
  const queue: { key: string; depth: number }[] = [];
  const strip = (v: string) => v.replace(/^\//, "").replace(/\(.*/, "");
  for (const root of roots as any[])
    for (const [name, value] of Object.entries({
      ...root.dependencies,
      ...root.devDependencies,
      ...root.optionalDependencies,
    })) {
      const v = value as any;
      const version = typeof v === "string" ? v : v.version;
      if (version && !/^(link|workspace|file):/.test(version))
        queue.push({ key: `${name}@${strip(version)}`, depth: 0 });
    }
  while (queue.length) {
    const { key, depth } = queue.shift()!;
    if (versions.has(key) && versions.get(key)! <= depth) continue;
    versions.set(key, depth);
    const p = snapshots[key] ?? snapshots["/" + key];
    for (const [name, v] of Object.entries({
      ...p?.dependencies,
      ...p?.optionalDependencies,
    }))
      queue.push({ key: `${name}@${strip(String(v))}`, depth: depth + 1 });
  }
  return [...versions].map(([key, depth]) => {
    const at = key.lastIndexOf("@");
    return {
      ecosystem: "npm",
      name: key.slice(0, at),
      version: key.slice(at + 1),
      depth,
    };
  });
}
function lockGraph(
  ecosystem: Ecosystem,
  packages: any[],
  direct: Set<string>,
): Dependency[] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const depths = new Map<string, number>();
  const queue = [...direct]
    .filter((n) => byName.has(n))
    .map((name) => ({ name, depth: 0 }));
  while (queue.length) {
    const { name, depth } = queue.shift()!;
    if (depths.has(name) && depths.get(name)! <= depth) continue;
    depths.set(name, depth);
    const p = byName.get(name);
    const deps = Array.isArray(p?.dependencies)
      ? p.dependencies.map((d: any) =>
          typeof d === "string" ? d.split(" ")[0] : d.name,
        )
      : Object.keys(p?.dependencies ?? {});
    for (const dep of deps)
      if (byName.has(dep)) queue.push({ name: dep, depth: depth + 1 });
  }
  return [...depths].map(([name, depth]) => ({
    ecosystem,
    name,
    version: String(byName.get(name).version),
    depth,
  }));
}
export function pythonLock(lock: any, project: any): Dependency[] {
  const poetry = (project.tool as any)?.poetry?.dependencies ?? {};
  const pep = (project.project as any)?.dependencies ?? [];
  const direct = new Set<string>(
    [
      ...Object.keys(poetry).filter((n) => n !== "python"),
      ...pep.map((s: string) => s.split(/[\s<>=!~;\[]/)[0]),
    ].map((n) => n.toLowerCase().replace(/_/g, "-")),
  );
  return lockGraph(
    "pypi",
    (lock.package ?? []).map((p: any) => ({
      ...p,
      name: p.name.toLowerCase().replace(/_/g, "-"),
    })),
    direct,
  );
}
export function cargoLock(lock: any, manifest: any): Dependency[] {
  const direct = new Set(
    Object.keys({
      ...manifest.dependencies,
      ...manifest["dev-dependencies"],
      ...manifest["build-dependencies"],
    }),
  );
  return lockGraph("cargo", lock.package ?? [], direct);
}
export function goMod(text: string): Dependency[] {
  const out: Dependency[] = [];
  let block = false;
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (line.startsWith("require (")) {
      block = true;
      continue;
    }
    if (line === ")") {
      block = false;
      continue;
    }
    if (line.startsWith("require ")) line = line.slice(8);
    else if (!block) continue;
    const m = line.match(/^(\S+)\s+(v[^\s]+)(.*)$/);
    if (m)
      out.push({
        ecosystem: "go",
        name: m[1],
        version: m[2],
        depth: m[3].includes("// indirect") ? 1 : 0,
      });
  }
  return out;
}
export function sbomPackages(sbom: any): Dependency[] {
  const out: Dependency[] = [];
  for (const c of sbom.components ?? sbom.packages ?? []) {
    const purl =
      c.purl ??
      c.externalRefs?.find((r: any) => r.referenceType === "purl")
        ?.referenceLocator;
    const match = purl?.match(
      /^pkg:(npm|pypi|cargo|golang)\/(.+)@([^?#]+)(?:[?#].*)?$/,
    );
    if (!match) continue;
    out.push({
      ecosystem: match[1] === "golang" ? "go" : match[1],
      name: decodeURIComponent(match[2]),
      version: decodeURIComponent(match[3]),
      depth: 1,
    });
  }
  return out;
}
export function imports(text: string, extension: string): string[] {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(extension)) {
    const found = [
      ...text.matchAll(
        /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g,
      ),
    ].map((m) => m[1]);
    return found
      .filter(
        (n) =>
          !n.startsWith(".") &&
          !n.startsWith("/") &&
          !n.startsWith("node:") &&
          !builtinModules.includes(n),
      )
      .map((n) =>
        n.startsWith("@")
          ? n.split("/").slice(0, 2).join("/")
          : n.split("/")[0],
      );
  }
  if (extension.endsWith(".py"))
    return [
      ...text.matchAll(
        /^\s*(?:from\s+([\w]+)(?:\.\w+)*\s+import|import\s+([\w]+))/gm,
      ),
    ].map((m) => (m[1] ?? m[2]).replace(/_/g, "-"));
  if (extension.endsWith(".rs"))
    return [...text.matchAll(/\b(?:use|extern crate)\s+([\w]+)(?:::|;)/g)].map(
      (m) => m[1].replace(/_/g, "-"),
    );
  if (extension.endsWith(".go"))
    return [...text.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]);
  return [];
}
async function read(root: string, path: string) {
  try {
    return await readFile(join(root, path), "utf8");
  } catch {
    return null;
  }
}
async function sourceFiles(
  root: string,
  dir = "",
  out: string[] = [],
): Promise<string[]> {
  if (out.length > 10000) return out;
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      [
        "node_modules",
        "vendor",
        "target",
        "dist",
        "build",
        "__pycache__",
      ].includes(entry.name) ||
      entry.isSymbolicLink()
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await sourceFiles(root, path, out);
    else if (/\.(tsx?|jsx?|mjs|cjs|py|rs|go)$/.test(entry.name)) out.push(path);
  }
  return out;
}
export type MeterOptions = {
  root: string;
  orgId: string;
  salt: string;
  sessionId: string;
  agent: string;
  base?: string;
  sbom?: string;
  at?: string;
  changedOnly?: boolean;
  repoId?: string;
};
export async function scan(opts: MeterOptions): Promise<Usage[]> {
  const root = resolve(opts.root);
  if (!opts.salt)
    throw new DomainError("A repository hashing salt is required");
  let identity = opts.repoId;
  if (!identity)
    try {
      identity = execFileSync("git", ["config", "--get", "remote.origin.url"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .replace(/^git@([^:]+):/, "https://$1/")
        .replace(/^git\+/, "")
        .replace(/\.git$/, "")
        .replace(/\/$/, "");
    } catch {}
  identity ??= root;
  const at = opts.at ?? now();
  const repo_hash =
    "sha256:" +
    createHash("sha256")
      .update(opts.salt + "\0" + identity)
      .digest("hex");
  const deps: Dependency[] = [];
  const npm = await read(root, "package-lock.json");
  if (npm) deps.push(...npmLock(JSON.parse(npm)));
  const pnpm = await read(root, "pnpm-lock.yaml");
  if (pnpm) deps.push(...pnpmLock(yaml(pnpm)));
  const py = await read(root, "pyproject.toml");
  const pylock =
    (await read(root, "poetry.lock")) ?? (await read(root, "uv.lock"));
  if (py && pylock) deps.push(...pythonLock(toml(pylock), toml(py)));
  const req = await read(root, "requirements.txt");
  if (req)
    for (const m of req.matchAll(/^([\w.-]+)==([^\s;]+).*$/gm))
      deps.push({
        ecosystem: "pypi",
        name: m[1].toLowerCase().replace(/_/g, "-"),
        version: m[2],
        depth: 0,
      });
  const cargo = await read(root, "Cargo.lock"),
    manifest = await read(root, "Cargo.toml");
  if (cargo && manifest) deps.push(...cargoLock(toml(cargo), toml(manifest)));
  const go = await read(root, "go.mod");
  if (go) deps.push(...goMod(go));
  if (opts.sbom) {
    const text = await read(root, opts.sbom);
    if (!text) throw new DomainError("SBOM file not found");
    deps.push(...sbomPackages(JSON.parse(text)));
  }
  const observations: { dep: Dependency; signal: Usage["signal"] }[] = deps.map(
    (dep) => ({ dep, signal: "sbom" }),
  );
  if (opts.base && npm) {
    let before: any;
    try {
      before = JSON.parse(
        execFileSync("git", ["show", `${opts.base}:package-lock.json`], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          maxBuffer: 20_000_000,
        }),
      );
    } catch {
      before = null;
    }
    const old = new Map(
      (before ? npmLock(before) : []).map((d) => [d.name, d.version]),
    );
    for (const dep of deps.filter(
      (d) => d.ecosystem === "npm" && old.get(d.name) !== d.version,
    ))
      observations.push({ dep, signal: "lockfile_diff" });
  }
  let files: string[];
  if (opts.changedOnly) {
    try {
      files = execFileSync(
        "git",
        ["diff", "--name-only", opts.base ?? "HEAD"],
        { cwd: root, encoding: "utf8" },
      )
        .split("\n")
        .filter(Boolean);
    } catch {
      files = await sourceFiles(root);
    }
  } else files = await sourceFiles(root);
  for (const file of files) {
    const full = resolve(root, file);
    if (!full.startsWith(root + "/")) continue;
    const text = await read(root, file);
    if (!text) continue;
    for (const imported of imports(text.slice(0, 2_000_000), file)) {
      const matches = deps.filter(
        (d) =>
          d.name === imported ||
          (d.ecosystem === "go" && imported.startsWith(d.name + "/")),
      );
      for (const dep of matches)
        observations.push({
          dep: { ...dep, depth: 0 },
          signal: "import_graph",
        });
    }
  }
  const unique = new Map<string, Usage>();
  for (const { dep, signal } of observations) {
    const event = {
      org_id: opts.orgId,
      repo_hash,
      period: periodOf(at),
      package: {
        ecosystem: dep.ecosystem,
        name: dep.name,
        version: dep.version,
      },
      signal,
      depth: dep.depth,
      agent: opts.agent,
      session_id: opts.sessionId,
      observed_at: at,
    };
    const event_id =
      "meter_" +
      hash({
        org: opts.orgId,
        repo_hash,
        period: event.period,
        session: opts.sessionId,
        dep,
        signal,
      });
    unique.set(event_id, { ...event, event_id, id: event_id });
  }
  return [...unique.values()];
}
