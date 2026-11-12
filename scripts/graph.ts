import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { npmGraph } from "../src/meter/graph";
const { values } = parseArgs({
  options: { root: { type: "string", default: process.cwd() }, out: { type: "string", default: "fixtures/dependency-graph.json" } },
});
const root = resolve(values.root!);
const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
const g = npmGraph(lock);
await mkdir(dirname(values.out!), { recursive: true });
await writeFile(
  values.out!,
  JSON.stringify({ source: "package-lock.json", ecosystem: "npm", ...g }, null, 2) + "\n",
);
console.log(`${g.nodes.length} nodes, ${g.edges.length} edges -> ${values.out}`);
