import { npmLock } from "./index";

export type GraphNode = { id: string; name: string; depth: number; dependents: number };
export type GraphEdge = { from: string; to: string };

/** Dependency graph from a package-lock.json (v2/v3). Depth comes from the meter's own npmLock(). */
export function npmGraph(lock: any): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const entries: Record<string, any> = lock.packages ?? {};
  const depthByNameVersion = new Map(
    npmLock(lock).map((d) => [`${d.name}@${d.version}`, d.depth]),
  );
  const idOf = (path: string) =>
    `${entries[path].name ?? path.split("node_modules/").at(-1)}@${entries[path].version ?? "unknown"}`;
  const resolve = (from: string, name: string) => {
    let base = from;
    while (base) {
      const c = `${base}/node_modules/${name}`;
      if (entries[c]) return c;
      const i = base.lastIndexOf("/node_modules/");
      base = i >= 0 ? base.slice(0, i) : "";
    }
    return entries[`node_modules/${name}`] ? `node_modules/${name}` : "";
  };
  const edges = new Map<string, GraphEdge>();
  for (const path of Object.keys(entries).filter((p) => p)) {
    for (const name of Object.keys({
      ...entries[path].dependencies,
      ...entries[path].optionalDependencies,
    })) {
      const to = resolve(path, name);
      if (to) {
        const e = { from: idOf(path), to: idOf(to) };
        edges.set(`${e.from}>${e.to}`, e);
      }
    }
  }
  const dependents = new Map<string, number>();
  for (const e of edges.values())
    dependents.set(e.to, (dependents.get(e.to) ?? 0) + 1);
  const nodes = [
    ...new Map(
      Object.keys(entries)
        .filter((p) => p)
        .map((p) => [idOf(p), p]),
    ).keys(),
  ]
    .filter((id) => depthByNameVersion.has(id))
    .map((id) => ({
      id,
      name: id.slice(0, id.lastIndexOf("@")),
      depth: depthByNameVersion.get(id)!,
      dependents: dependents.get(id) ?? 0,
    }))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: [...edges.values()].filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}
