import fs from 'fs';
import {forceSimulation, forceLink, forceManyBody, forceX, forceZ} from 'd3-force-3d';
const g = JSON.parse(fs.readFileSync('../../../fixtures/dependency-graph.json','utf8'));
const S = 70; // vertical spacing per depth level
let seed = 7; const rnd = () => (seed = (seed*16807)%2147483647)/2147483647;
const nodes = g.nodes.map((n,i)=>({...n, fy: -n.depth*S + (rnd()-0.5)*18}));
const id = new Map(nodes.map((n,i)=>[n.id,i]));
const links = g.edges.filter(e=>id.has(e.from)&&id.has(e.to)).map(e=>({source:id.get(e.from), target:id.get(e.to)}));
const sim = forceSimulation(nodes, 3).randomSource(rnd)
  .force('link', forceLink(links).distance(40).strength(0.4))
  .force('charge', forceManyBody().strength(-28))
  .force('x', forceX(0).strength(0.03)).force('z', forceZ(0).strength(0.03))
  .stop();
for (let i=0;i<500;i++) sim.tick();
const out = {
  nodes: nodes.map(n=>({name:n.name, depth:n.depth, dependents:n.dependents, p:[+n.x.toFixed(2), +n.fy.toFixed(2), +n.z.toFixed(2)]})),
  edges: links.map(l=>[l.source.index, l.target.index]),
  source: g.source,
};
fs.writeFileSync('layout.json', JSON.stringify(out));
const deep = out.nodes.reduce((a,n,i)=>n.depth>out.nodes[a].depth?i:a,0);
const xs=out.nodes.map(n=>n.p[0]), zs=out.nodes.map(n=>n.p[2]);
console.log('nodes',out.nodes.length,'edges',out.edges.length,'deep',out.nodes[deep], 'xrange',Math.min(...xs)|0,Math.max(...xs)|0,'zrange',Math.min(...zs)|0,Math.max(...zs)|0);
