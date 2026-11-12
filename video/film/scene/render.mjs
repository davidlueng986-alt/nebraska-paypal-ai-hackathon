// usage: node render.mjs <out.mp4> <width> <height> [fromSec] [toSec] [step]
import puppeteer from 'puppeteer-core';
import {spawn} from 'child_process';
import fs from 'fs';
import path from 'path';
const [out, w = '1920', h = '1080', from, to, step = '1'] = process.argv.slice(2);
const T = JSON.parse(fs.readFileSync('timeline.json', 'utf8'));
const W = +w, H = +h, fps = T.fps;
const CHROME = process.env.CHROME || '/tmp/rtest/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await puppeteer.launch({executablePath: CHROME, headless: 'shell',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--no-sandbox', `--window-size=${W},${H}`]});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({width: W, height: H, deviceScaleFactor: 1});
await page.goto('file://' + path.resolve('index.html') + (process.env.MODE ? '?mode=' + process.env.MODE : ''));
await page.waitForFunction('window.__ready === true');
await page.evaluate(() => document.fonts.ready);
console.log(JSON.stringify(await page.evaluate(() => window.__data)));
const f0 = Math.round((from ? +from : 0) * fps), f1 = Math.round((to ? +to : T.duration) * fps);
const stills = out.endsWith('/');
let ff;
if (!stills) ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps / +step), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', out], {stdio: ['pipe', 'inherit', 'inherit']});
else fs.mkdirSync(out, {recursive: true});
const t0 = Date.now();
for (let f = f0; f < f1; f += +step) {
  await page.evaluate((t) => window.renderAt(t), f / fps);
  const buf = await page.screenshot({type: 'png'});
  if (stills) fs.writeFileSync(`${out}f${String(f).padStart(4, '0')}.png`, buf);
  else if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f - f0) % (30 * +step) === 0) console.log(`frame ${f}/${f1}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
await browser.close();
console.log('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
