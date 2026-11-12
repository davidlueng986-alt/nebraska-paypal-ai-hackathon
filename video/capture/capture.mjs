// High-resolution screen capture of the real Nebraska app for the demo film.
// Records each segment with the Chrome DevTools screencast at 2x device pixels,
// then rebuilds a constant-frame-rate MP4 per segment with ffmpeg.
//
// usage: node video/capture/capture.mjs [segment ...]
// env:   NEBRASKA_BASE_URL (default http://localhost:3000), CHROME (optional executable)
// Needs a fresh demo-mode server:  rm -f data/demo.db* && npm run build && npm start
import {chromium} from 'playwright-core';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NEBRASKA_BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve('artifacts/video/captures');
const VW = 1440, VH = 900, DPR = 2, FPS = 30;
fs.mkdirSync(OUT, {recursive: true});

const CURSOR = `
(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M1 1 L1 22 L6.5 17 L10.5 26 L14 24.5 L10 15.8 L17.5 15.8 Z" fill="#1F2328" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'0', top:'0', zIndex:2147483647, pointerEvents:'none', transform:'translate(-100px,-100px)', transition:'none', filter:'drop-shadow(0 1px 2px rgba(0,0,0,.25))'});
    const r = document.createElement('div');
    r.id = '__ring';
    Object.assign(r.style, {position:'fixed', left:'0', top:'0', width:'36px', height:'36px', marginLeft:'-18px', marginTop:'-18px', borderRadius:'50%', border:'2px solid rgba(9,105,218,.55)', zIndex:2147483646, pointerEvents:'none', opacity:'0'});
    document.documentElement.append(r, c);
    const st = document.createElement('style');
    st.textContent = 'nextjs-portal{display:none!important} *{cursor:none!important}';
    document.documentElement.append(st);
    const pos = JSON.parse(sessionStorage.getItem('__curpos') || '[720,450]');
    c.style.transform = 'translate(' + pos[0] + 'px,' + pos[1] + 'px)';
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; sessionStorage.setItem('__curpos', JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener('mousedown', (e) => {
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      r.animate([{opacity: 1, transform: 'scale(.4)'}, {opacity: 0, transform: 'scale(1.4)'}], {duration: 450, easing: 'ease-out'});
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
})();`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/rtest/node_modules/.remotion/chrome-for-testing/linux64/chrome-linux64/chrome',
  args: ['--hide-scrollbars', '--font-render-hinting=none', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({viewport: {width: VW, height: VH}, deviceScaleFactor: DPR, colorScheme: 'light', baseURL: BASE});
await ctx.addInitScript(CURSOR);
const page = await ctx.newPage();
let mouse = [720, 450];

const sleep = (ms) => page.waitForTimeout(ms);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
async function moveTo(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  const [x0, y0] = mouse;
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    await sleep(ms / steps);
  }
  mouse = [x, y];
}
async function clickOn(locator, {ms = 750, hold = 350} = {}) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await moveTo(x, y, ms);
  await sleep(hold);
  await page.mouse.down(); await sleep(70); await page.mouse.up();
}
async function hoverOn(locator, ms = 700) {
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function glide(dy, ms = 1100) {
  const steps = Math.round(ms / 20);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(20); }
}

// ---------- recorder ----------
async function record(name, fn) {
  const dir = path.join(OUT, '.frames', name);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, `${String(n++).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({file, t: f.metadata.timestamp});
    try { await cdp.send('Page.screencastFrameAck', {sessionId: f.sessionId}); } catch {}
  });
  await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 95, maxWidth: VW * DPR, maxHeight: VH * DPR, everyNthFrame: 1});
  const tStart = Date.now() / 1000;
  await sleep(300);
  await fn();
  await sleep(200);
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  // concat list with per-frame durations -> constant frame rate
  if (!frames.length) throw new Error('no frames for ' + name);
  const list = [];
  const t0 = frames[0].t;
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : t0 + (tEnd - tStart);
    list.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, next - frames[i].t).toFixed(4)}`);
  }
  list.push(`file '${frames[frames.length - 1].file}'`);
  const lf = path.join(dir, 'list.txt');
  fs.writeFileSync(lf, list.join('\n'));
  const out = path.join(OUT, `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', `fps=${FPS},scale=${VW * DPR}:${VH * DPR}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', out], {stdio: 'inherit'});
  if (r.status !== 0) throw new Error('ffmpeg failed for ' + name);
  const dur = frames[frames.length - 1].t - t0;
  console.log(`${name}: ${frames.length} frames, ${(tEnd - tStart).toFixed(1)}s -> ${out}`);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({name, seconds: +(tEnd - tStart).toFixed(2), frames: frames.length, viewport: [VW, VH], dpr: DPR, base: BASE, mode: 'demo', capturedAt: new Date().toISOString()}, null, 2));
}

// ---------- segments (the real app, demo mode) ----------
const segments = {
  async '01-start'() {
    await page.goto('/start');
    await page.getByRole('heading', {name: 'Set up Nebraska'}).waitFor();
    await record('01-start', async () => {
      await sleep(1800);
      await clickOn(page.getByRole('button', {name: /Approve \$500\.00 on PayPal/}));
      await page.waitForURL(/demo\/approval/);
      await sleep(2200);
      await clickOn(page.getByRole('button', {name: 'Approve (simulated)'}));
      await page.waitForURL(/\/start/);
      await sleep(2600);
    });
  },
  async '02-month'() {
    await page.goto('/');
    await page.getByText('Going to maintainers').waitFor();
    await record('02-month', async () => {
      await sleep(2200);
      await glide(380);
      await sleep(1200);
      await clickOn(page.getByRole('button', {name: /fast-xml-parser.*Why this amount/}));
      await page.getByRole('dialog').waitFor();
      await sleep(2600);
      await page.getByRole('dialog').getByText('3. Without AI').scrollIntoViewIfNeeded();
      await sleep(3200);
      await page.keyboard.press('Escape');
      await sleep(700);
    });
  },
  async '03-approvals'() {
    await page.goto('/approvals');
    await page.getByText('One-time grant for fast-xml-parser').first().waitFor();
    await record('03-approvals', async () => {
      await sleep(2400);
      await clickOn(page.getByRole('link', {name: /Approve on PayPal/}).first());
      await page.waitForURL(/demo\/approval/);
      await sleep(1800);
      await clickOn(page.getByRole('button', {name: 'Approve (simulated)'}));
      await page.waitForURL(/\/approvals/);
      await page.getByText('Approved on PayPal').first().waitFor();
      await sleep(2600);
    });
  },
  async '05-month-end-live'() {
    await page.goto('/month-end?data=live&speed=1');
    await sleep(800);
    await record('05-month-end-live', async () => {
      await sleep(1200);
      await clickOn(page.getByRole('button', {name: /^Run month-end$/}));
      await page.getByText('Success', {exact: true}).first().waitFor({timeout: 120_000});
      await sleep(3500);
    });
  },
  async '06-maintainer'() {
    await page.goto('/maintainer');
    await page.getByText('Earned in November').waitFor();
    await record('06-maintainer', async () => {
      await sleep(3000);
      await glide(300);
      await sleep(3000);
    });
  },
  async '07-month-end-again'() {
    await page.goto('/month-end?data=live&speed=3');
    await sleep(800);
    await record('07-month-end-again', async () => {
      await sleep(1000);
      await clickOn(page.getByRole('button', {name: /^Run month-end$/}));
      await page.getByText('No second payment.').waitFor({timeout: 120_000});
      await sleep(3800);
    });
  },
  async '08-statement'() {
    await page.goto('/statements/' + new Date().toISOString().slice(0, 7));
    await page.getByText('Recompute hash').waitFor();
    await record('08-statement', async () => { await sleep(3000); await glide(400); await sleep(2500); });
  },
  async '11-supply-chain'() {
    await page.goto('/supply-chain');
    await sleep(1500);
    await record('11-supply-chain', async () => { await sleep(4000); await glide(400); await sleep(2500); });
  },
};

const want = process.argv.slice(2);
for (const [name, fn] of Object.entries(segments)) {
  if (want.length && !want.includes(name)) continue;
  try { await fn(); } catch (e) { console.error('FAILED', name, e.message); }
}
await browser.close();
