import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import L from './layout.json';
import T from './timeline.json';

const W = window.innerWidth, H = window.innerHeight;
const MODE = new URLSearchParams(location.search).get('mode') || 'open';
const S = W / 1920; // scale factor for previews
const INK = new THREE.Color('#070706');

// ---------- helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 4);
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- data ----------
const N = L.nodes.length;
const P = L.nodes.map((n) => new THREE.Vector3(...n.p));
const deepIdx = L.nodes.reduce((a, n, i) => (n.depth > L.nodes[a].depth ? i : a), 0);
// chain: reverse BFS from deepest node to a depth-0 root
const up = new Map();
L.edges.forEach(([a, b]) => { if (!up.has(b)) up.set(b, []); up.get(b).push(a); });
const prev = new Map([[deepIdx, -1]]);
let root = -1;
{ const q = [deepIdx];
  while (q.length) { const c = q.shift(); if (L.nodes[c].depth === 0) { root = c; break; }
    for (const p of up.get(c) || []) if (!prev.has(p)) { prev.set(p, c); q.push(p); } } }
const chain = [];
for (let c = root; c !== -1; c = prev.get(c)) chain.push(c);
const chainPos = new Map(chain.map((n, k) => [n, k]));
// hop distance from root (undirected) for the reveal wave
const adj = Array.from({length: N}, () => []);
L.edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
const hop = new Array(N).fill(99); hop[root] = 0;
{ const q = [root]; while (q.length) { const c = q.shift(); for (const d of adj[c]) if (hop[d] === 99) { hop[d] = hop[c] + 1; q.push(d); } } }
const maxHop = Math.max(...hop.filter((h) => h < 99));
const hopD = new Array(N).fill(99); hopD[deepIdx] = 0;
{ const q = [deepIdx]; while (q.length) { const c = q.shift(); for (const d of adj[c]) if (hopD[d] === 99) { hopD[d] = hopD[c] + 1; q.push(d); } } }
const maxHopD = Math.max(...hopD.filter((h) => h < 99));
window.__data = {root: L.nodes[root].name, deep: L.nodes[deepIdx], chain: chain.map((i) => L.nodes[i].name), maxHop, nodes: N, edges: L.edges.length};

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, W / H, 0.5, 6000);

// ---------- shared uniforms ----------
const U = {
  uTime: {value: 0}, uFocus: {value: 600}, uAperture: {value: 0.004}, uScale: {value: S * H / 1080},
  uChainOn: {value: 0}, uChainProg: {value: -1}, uFade: {value: 1}, uDeepPulse: {value: 0},
  uRevealStart: {value: T.pullStart}, uIsolate: {value: 0}, uGreen: {value: -1},
};

// ---------- nodes (bokeh points) ----------
{
  const g = new THREE.BufferGeometry();
  const gr = new Float32Array(N); const pos = new Float32Array(N * 3), size = new Float32Array(N), ck = new Float32Array(N), rev = new Float32Array(N), dep = new Float32Array(N), deep = new Float32Array(N);
  L.nodes.forEach((n, i) => {
    pos.set(P[i].toArray(), i * 3);
    size[i] = 2.2 + Math.sqrt(n.dependents) * 1.1;
    ck[i] = chainPos.has(i) ? chainPos.get(i) : -1;
    rev[i] = i === root ? -10 : (hop[i] < 99 ? hop[i] / maxHop : 1) * 2.4 + rnd() * 0.5;
    dep[i] = n.depth / 8;
    deep[i] = i === deepIdx ? 1 : 0;
    gr[i] = hopD[i] < 99 ? hopD[i] / maxHopD : 1.2;
  });
  g.setAttribute('aGreen', new THREE.BufferAttribute(gr, 1));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aChain', new THREE.BufferAttribute(ck, 1));
  g.setAttribute('aReveal', new THREE.BufferAttribute(rev, 1));
  g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  g.setAttribute('aDeep', new THREE.BufferAttribute(deep, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize, aChain, aReveal, aDepth, aDeep, aGreen;
      uniform float uGreen, uTime, uFocus, uAperture, uScale, uChainOn, uChainProg, uFade, uRevealStart, uIsolate, uDeepPulse;
      varying float vA; varying float vCoc; varying vec3 vCol;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.);
        float d = -mv.z;
        float coc = abs(d - uFocus) * uAperture * 900. / max(d,1.);   // circle of confusion in px
        float base = aSize * 900. / max(d,1.);
        float isChain = step(0., aChain);
        float lit = isChain * uChainOn * smoothstep(aChain - 1.2, aChain, uChainProg);
        float reveal = smoothstep(0., .6, uTime - uRevealStart - aReveal);
        float fog = mix(1., .35, aDepth);
        float iso = mix(1., .18, uIsolate * (1. - aDeep));
        vA = reveal * fog * iso * uFade * (1. + lit * 2.2 + aDeep * uDeepPulse * 3.);
        vCol = mix(vec3(.93,.91,.86), vec3(1.,.86,.62), lit);
        float gk = smoothstep(aGreen, aGreen + .08, uGreen);
        vCol = mix(vCol, vec3(.3,.86,.45), gk); vA *= 1. + gk * 0.3;
        vCoc = coc;
        gl_PointSize = (base + coc) * uScale;
        vA *= 1. / (1. + coc * coc * .0035);
        gl_PointSize = min(gl_PointSize, 160. * uScale);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA; varying float vCoc; varying vec3 vCol;
      void main(){
        float r = length(gl_PointCoord - .5) * 2.;
        if (r > 1.) discard;
        float sharp = smoothstep(1., .55, r);
        float bokeh = smoothstep(1., .9, r) * (.55 + .45 * smoothstep(.55, .95, r));   // ring-edged disc
        float k = clamp(vCoc / 14., 0., 1.);
        float a = mix(sharp * sharp, bokeh, k);
        gl_FragColor = vec4(vCol * a * vA, 1.);
      }`,
  });
  scene.add(new THREE.Points(g, m));
}

// ---------- edges ----------
{
  const E = L.edges.length;
  const egr = new Float32Array(E * 2); const pos = new Float32Array(E * 6), tt = new Float32Array(E * 2), ck = new Float32Array(E * 2), rev = new Float32Array(E * 2), dep = new Float32Array(E * 2);
  L.edges.forEach(([a, b], i) => {
    pos.set(P[a].toArray(), i * 6); pos.set(P[b].toArray(), i * 6 + 3);
    tt[i * 2] = 0; tt[i * 2 + 1] = 1;
    const onChain = chainPos.has(a) && chainPos.has(b) && chainPos.get(b) === chainPos.get(a) + 1;
    ck[i * 2] = ck[i * 2 + 1] = onChain ? chainPos.get(a) : -1;
    const r = Math.min(hop[a], hop[b]);
    rev[i * 2] = rev[i * 2 + 1] = (r < 99 ? r / maxHop : 1) * 2.4 + 0.15;
    dep[i * 2] = L.nodes[a].depth / 8; dep[i * 2 + 1] = L.nodes[b].depth / 8;
    egr[i * 2] = hopD[a] < 99 ? hopD[a] / maxHopD : 1.2; egr[i * 2 + 1] = hopD[b] < 99 ? hopD[b] / maxHopD : 1.2;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('aGreen', new THREE.BufferAttribute(egr, 1));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  g.setAttribute('aChain', new THREE.BufferAttribute(ck, 1));
  g.setAttribute('aReveal', new THREE.BufferAttribute(rev, 1));
  g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aT, aChain, aReveal, aDepth, aGreen;
      uniform float uGreen, uTime, uFocus, uAperture, uChainOn, uChainProg, uFade, uRevealStart, uIsolate;
      varying float vA; varying float vT; varying float vLit; varying float vChain; varying float vG;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.);
        float d = -mv.z;
        float coc = abs(d - uFocus) * uAperture * 900. / max(d,1.);
        float isChain = step(0., aChain);
        vLit = isChain * uChainOn * smoothstep(aChain, aChain + 1., uChainProg);
        vChain = isChain;
        float reveal = smoothstep(0., .9, uTime - uRevealStart - aReveal);
        vA = reveal * mix(1., .3, aDepth) * uFade * mix(1., .12, uIsolate * (1. - vLit)) / (1. + coc * .25);
        vT = aT;
        vG = smoothstep(aGreen, aGreen + .08, uGreen); vA *= 1. + vG * 0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime, uChainProg;
      varying float vA; varying float vT; varying float vLit; varying float vChain; varying float vG;
      void main(){
        float base = .085;
        float lit = vLit * (.55 + .45 * smoothstep(.0, 1., vT));
        vec3 c = mix(vec3(.93,.91,.86) * base, vec3(1.,.82,.55) * .9, lit);
        c = mix(c, vec3(.25,.85,.42) * .16, vG);
        gl_FragColor = vec4(c * vA, 1.);
      }`,
  });
  scene.add(new THREE.LineSegments(g, m));
}

// ---------- drifting dust (atmosphere) ----------
const dustU = {...U, uDrift: {value: 0}};
{
  const D = 2600, pos = new Float32Array(D * 3), ph = new Float32Array(D);
  for (let i = 0; i < D; i++) { pos[i * 3] = (rnd() - .5) * 1600; pos[i * 3 + 1] = 250 - rnd() * 1100; pos[i * 3 + 2] = (rnd() - .5) * 1600; ph[i] = rnd() * 6.28; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPh; uniform float uTime, uFocus, uAperture, uScale, uFade, uRevealStart;
      varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime*.21+aPh)*6., uTime*3.5, cos(uTime*.17+aPh)*6.);
        vec4 mv = modelViewMatrix * vec4(p,1.);
        float d = -mv.z;
        float coc = abs(d - uFocus) * uAperture * 900. / max(d,1.);
        gl_PointSize = (1.2 * 900. / max(d,1.) + coc) * uScale;
        vA = .22 * uFade * smoothstep(0., 1.5, uTime - uRevealStart) / (1. + coc*coc*.02);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard; gl_FragColor=vec4(vec3(.8,.82,.85)*smoothstep(1.,.2,r)*vA,1.);} `,
  });
  scene.add(new THREE.Points(g, m));
}

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.85, 0.55, 0.05);
composer.addPass(bloom);
const lens = new ShaderPass({
  uniforms: {tDiffuse: {value: null}, uCA: {value: 0.0016}, uLetter: {value: 0.12}},
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);} `,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uCA, uLetter; varying vec2 vUv;
    void main(){
      vec2 c = vUv - .5; float r2 = dot(c,c);
      vec2 off = c * uCA * (1. + r2*4.);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1., .55, smoothstep(.12, .55, r2));            // vignette
      float bar = step(vUv.y, uLetter) + step(1. - uLetter, vUv.y); // letterbox
      col = mix(col, vec3(0.), bar);
      gl_FragColor = vec4(col, 1.);
    }`,
});
composer.addPass(lens);
composer.addPass(new OutputPass());

// ---------- camera path ----------
const center = new THREE.Vector3(0, -190, 0);
const curve = new THREE.CatmullRomCurve3(chain.map((i) => P[i].clone()), false, 'centripetal');
const rootP = P[root];
const closeCam = rootP.clone().add(new THREE.Vector3(0, 4, 26));
const wideCam = new THREE.Vector3(780, 420, 1250);
function diveCam(s) {
  const p = curve.getPoint(clamp(s));
  const ang = 0.6 + s * 1.6;
  const r = 300 - s * 120;
  return p.clone().add(new THREE.Vector3(Math.cos(ang) * r, 90 - s * 60, Math.sin(ang) * r));
}

const el = (id) => document.getElementById(id);
const v = new THREE.Vector3();
window.renderAt = (t) => {
  U.uTime.value = t;
  const vid = (x) => x;
  // typing
  const nChars = Math.floor(clamp((t - T.typeStart) / T.charDt, 0, T.importLine.length));
  const caretOn = t < T.collapseStart && (Math.floor(t * 2.2) % 2 === 0 || nChars < T.importLine.length);
  el('code').innerHTML = T.importLine.slice(0, nChars).replace(/&/g, '&amp;').replace(/</g, '&lt;') + `<span class="caret" style="opacity:${caretOn ? 1 : 0}"></span>`;
  const col = ease(lin(t, T.collapseStart, T.collapseEnd));
  el('code').style.opacity = 1 - col;
  el('code').style.transform = `translate(-50%,-50%) scale(${1 - col * 0.92}, ${1 - col * 0.985})`;
  el('code').style.filter = `blur(${col * 6}px) brightness(${1 + col * 3})`;

  // camera
  let camPos, look, focus, aperture = 0.004;
  if (t < T.pullStart) {
    camPos = closeCam.clone(); look = rootP.clone(); focus = 26; aperture = 0.02;
  } else if (t < T.diveStart) {
    const k = ease(lin(t, T.pullStart, T.diveStart - 0.2));
    camPos = closeCam.clone().lerp(wideCam, k);
    camPos.y += Math.sin(k * Math.PI) * 120;
    look = rootP.clone().lerp(center, ease(lin(t, T.pullStart, T.pullStart + 2.6)));
    focus = THREE.MathUtils.lerp(26, camPos.distanceTo(center), k);
    aperture = THREE.MathUtils.lerp(0.02, 0.0025, k);
  } else {
    const k = lin(t, T.diveStart, T.diveEnd);
    const s = ease(k);
    const blendIn = ease(lin(t, T.diveStart, T.diveStart + 1.6));
    const dc = diveCam(s * 0.98);
    camPos = wideCam.clone().lerp(dc, blendIn);
    const target = curve.getPoint(clamp(s * 1.0 + 0.06));
    look = center.clone().lerp(target, blendIn);
    const a = ease(lin(t, T.diveEnd - 1.4, T.end - 0.3));
    if (a > 0) {
      const D = P[deepIdx];
      const drift = (t - T.diveEnd) * 6;
      const hero = D.clone().add(new THREE.Vector3(60 + drift, -140, 90 - drift));
      const heroLook = D.clone().add(new THREE.Vector3(-10, 130, -30));
      camPos.lerp(hero, a); look.lerp(heroLook, a);
      U.uFocusLock = D;
    }
    const fTarget = curve.getPoint(clamp(s));
    focus = camPos.distanceTo(t > T.diveEnd - 1.4 ? P[deepIdx] : fTarget);
    aperture = THREE.MathUtils.lerp(0.0025, 0.022, blendIn) + 0.02 * ease(lin(t, T.diveEnd - 1.4, T.end));
    U.uChainOn.value = blendIn;
    U.uChainProg.value = -1 + s * (chain.length + 0.5);
    U.uIsolate.value = 0.35 * ease(lin(t, T.diveEnd - 1.5, T.end - 0.5));
    U.uDeepPulse.value = lin(t, T.diveEnd - 0.6, T.diveEnd) * (0.75 + 0.25 * Math.sin((t - T.arrive) * 3.0));
  }
  if (t < T.diveStart) { U.uChainOn.value = 0; U.uChainProg.value = -1; U.uIsolate.value = 0; U.uDeepPulse.value = 0; }
  if (MODE === 'end') {
    const D = P[deepIdx];
    const hero = D.clone().add(new THREE.Vector3(60, -140, 90));
    const heroLook = D.clone().add(new THREE.Vector3(-10, 130, -30));
    const k = ease(lin(t, 2.2, 9.5));
    camPos = hero.clone().lerp(wideCam, k); camPos.y += Math.sin(k * Math.PI) * 160;
    look = heroLook.clone().lerp(center, k);
    focus = camPos.distanceTo(k < 0.5 ? D : center);
    aperture = THREE.MathUtils.lerp(0.042, 0.003, ease(lin(t, 2.2, 7)));
    U.uChainOn.value = 1; U.uChainProg.value = 9; U.uIsolate.value = 0.35 * (1 - ease(lin(t, 2, 5)));
    U.uDeepPulse.value = 0.8; U.uGreen.value = -0.05 + lin(t, 0.8, 6.5) * 1.3;
    U.uFade.value = 1 - ease(lin(t, 10.2, 11.5));
    camera.fov = 45 - 15 * k;
  }
  camera.position.copy(camPos); camera.lookAt(look);
  U.uFocus.value = focus; U.uAperture.value = aperture;
  // scene appears as the code collapses
  if (MODE !== 'end') U.uFade.value = ease(lin(t, T.collapseStart + 0.35, T.pullStart + 0.4));
  else U.uRevealStart.value = -100;
  // slight lens breathing
  if (MODE !== 'end') camera.fov = 32 - 4 * ease(lin(t, T.pullStart, T.diveStart)) + 3 * ease(lin(t, T.diveStart, T.diveEnd)) + 16 * ease(lin(t, T.diveEnd - 1.4, T.end - 0.3));
  camera.updateProjectionMatrix();
  lens.uniforms.uLetter.value = 0.12;
  bloom.strength = 0.85 + 0.4 * lin(t, T.diveEnd - 1, T.end);

  // overlays
  const stat = lin(t, T.pullStart + 1.4, T.pullStart + 2.2) * (1 - lin(t, T.diveStart - 0.5, T.diveStart + 0.1));
  el('stat').style.opacity = stat;
  const curDepth = t < T.diveStart ? 0 : Math.min(8, Math.floor(clamp(U.uChainProg.value, 0, 8.4)));
  el('depth').style.opacity = lin(t, T.diveStart + 0.6, T.diveStart + 1.2) * (1 - lin(t, T.end - 1.2, T.end - 0.6));
  el('depthN').textContent = String(L.nodes[chain[curDepth]].depth);
  el('depthName').textContent = L.nodes[chain[curDepth]].name;
  const fade = (a, b) => lin(t, a, a + 0.8) * (1 - lin(t, b - 0.6, b));
  el('l1').style.opacity = fade(...T.line1);
  el('l2').style.opacity = fade(...T.line2);
  // label on deepest node
  camera.updateMatrixWorld(); v.copy(P[deepIdx]).project(camera);
  const lx = (v.x * .5 + .5) * W, ly = (-v.y * .5 + .5) * H;
  el('label').style.transform = `translate(${lx + 22 * S}px, ${ly - 10 * S}px)`;
  el('label').style.opacity = lin(t, T.arrive + 0.5, T.arrive + 1.2);

  if (MODE === 'end') { for (const id of ['code','stat','depth','l1','l2','label']) el(id).style.opacity = 0; }
  composer.render();
  return true;
};
window.__ready = true;
