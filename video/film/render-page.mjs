// Render an HTML page that exposes window.renderAt(t) to an MP4, frame by frame (deterministic).
// usage: node render-page.mjs <page.html?query> <out.mp4|dir/> <seconds> [width] [height] [fps] [--gl]
import puppeteer from 'puppeteer-core';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [pg, out, secs, w = '1920', h = '1080', fps = '30'] = process.argv.slice(2);
const gl = process.argv.includes('--gl');
const CHROME = process.env.CHROME || '/tmp/rtest/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell';
const args = ['--allow-file-access-from-files', '--no-sandbox', `--window-size=${w},${h}`];
if (gl) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
const browser = await puppeteer.launch({executablePath: CHROME, headless: 'shell', args});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({width: +w, height: +h, deviceScaleFactor: 1});
const [file, query] = pg.split('?');
await page.goto('file://' + path.resolve(file) + (query ? '?' + query : ''));
await page.waitForFunction('window.__ready === true');
await page.evaluate(() => document.fonts.ready);
const total = Math.round(+secs * +fps);
const stills = out.endsWith('/');
let ff;
if (stills) fs.mkdirSync(out, {recursive: true});
else ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', fps, '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', out], {stdio: ['pipe', 'inherit', 'inherit']});
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
for (let f = 0; f < total; f++) {
  if (only && !only.includes(f)) continue;
  await page.evaluate((t) => window.renderAt(t), f / +fps);
  const buf = await page.screenshot({type: 'png'});
  if (stills) fs.writeFileSync(path.join(out, `f${String(f).padStart(4, '0')}.png`), buf);
  else if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
await browser.close();
console.log('done', out);
