# Demo film

**Film:** 1920×1080, 30 fps, 2:58, burned-in English captions; captions also in `artifacts/video/nebraska-film.srt`. The rendered MP4 is published on YouTube (link in the README/Devpost once uploaded); `npm run render` in `video/` rebuilds it to `artifacts/video/nebraska-film.mp4`. Two narrators: a female voice for the story and the close, a male voice for the product demo.

## What is on screen

| Time | Section | Source |
|---|---|---|
| 0:00–0:13 | A real `import` line from this repo; the camera pulls back over the full dependency graph (419 packages from `package-lock.json`) and follows the real chain `@paypal/agent-toolkit → … → p-limit → p-try` to depth 8. | `fixtures/dependency-graph.json`, rendered in three.js |
| 0:13–0:53 | The problem as data: value ($8.8T vs $4.15B to rewrite), concentration (5% of developers, 96% of the value, shown as a dot grid), what breaks (Heartbleed, xz), what AI changes (Tailwind −40% docs traffic, −80% revenue). | `video/film/info.html`, see “Facts” |
| 0:53–1:04 | “AI is the first user of open source that knows exactly who it owes.” Product one-liner. | `video/film/type.html` |
| 1:04–1:19 | Why PayPal: Payouts reach 96 markets in 24 currencies with an email address; a subscription holds the human mandate; one batch pays everyone. | `video/film/info.html` |
| 1:19–2:43 | **The real app**, recorded at 2× device pixels from a local demo-mode server: budget approval (redirect to PayPal cut to the approved state) and hook line, “Why this amount” (AI off $69.44 / AI on $161.29), grant approval, a live month-end run (README injection rejected to neutral 1.0, recipient held, I1–I7, batch `nebraska-2026-11`, three payout items), Maya’s income ($411.29), rerun with “No second payment”. | `artifacts/video/captures/*.mp4` from `video/capture/capture.mjs` |
| 2:43–2:51 | The graph again, threaded back in green from the deepest package upward. | three.js |
| 2:51–2:58 | “You can still choose not to pay. You just can’t say you didn’t know.” Repository URL. | Typography |

A permanent on-screen note reads **“Demo mode · fictional identities”** during the app section. The footage was recorded on a local demo-mode server, which makes no PayPal calls: the approve buttons open the app’s demo approval page, which the edit cuts out (click → approved). In sandbox mode the same buttons redirect to PayPal’s own approval page (`components/start/start-view.tsx`, `components/approvals/grant-ask.tsx`), after a workspace sign-in at `/signin`. Real sandbox evidence so far is limited to what `docs/STATUS.md` records. Package usage, team size, funding and the advisory for `fast-xml-parser` are demo seed values, not facts about the real project. Maya and the other recipients are fictional.

## Facts (each opened at its source)

- Open source value: demand-side value about $8.8 trillion; supply-side cost to rewrite about $4.15 billion; about 5% of developers (roughly 3,000) account for 96% of demand value. Harvard Business School working paper (2024), as reported by The Decoder.
- Heartbleed: OpenSSL took in no more than $2,000 a year in donations and had one full-time developer. The Register, 2021-05-10.
- xz: a single, overworked, uncompensated maintainer; the attack ran over at least two years. LWN.net, 2024.
- Tailwind CSS: docs traffic down about 40%, revenue down close to 80%, 75% of the engineering team (three of four engineers) laid off. Adam Wathan, January 2026, via Leanware.
- PayPal Payouts: 96 markets and 24 currencies; recipients need only an email address or phone number (paypal.com “make payments” pages and docs.paypal.ai, 2026). A reused `sender_batch_id` is rejected within 30 days (developer.paypal.com).

## How it is made (all original)

- **Generative scenes:** three.js with custom point/line shaders, bloom, depth of field, chromatic aberration and letterbox (`video/film/scene/`), rendered frame by frame in headless Chrome (software WebGL). Layout from a seeded d3-force-3d simulation of the real graph.
- **App footage:** `video/capture/capture.mjs` drives the real UI with Playwright and records the DevTools screencast at 2880×1800; a visible cursor is drawn by an injected overlay.
- **Edit:** `video/film/edit.py` (time remaps, eased camera moves and push-in/dip transitions on the captures; the app window floats on the film’s ink background), `video/film/edl.json` (every section, cut, freeze and narration cue), `video/film/assemble.py`.
- **Typography and data visuals:** `video/film/type.html`, `video/film/info.html` (dot grid, bars, globe of points; no maps or logos).
- **Narration:** synthetic voices, Kokoro-82M (Apache-2.0) via `kokoro-js`: `af_heart` (story, close) and `am_michael` (demo); script, voice and speed per line in `video/film/vo.json`. Human recordings with the same file names can replace them.
- **Music and sound:** synthesized in `video/film/mix.py` and `video/film/scene/audio.py` (pads, gate locks, chimes, sonar pings). No samples, no music library.
- **Fonts:** Instrument Serif, Inter Tight, JetBrains Mono (SIL Open Font License), installed from `@fontsource` at build time.
- No third-party logos, stock footage or copyrighted music.

## Rebuild

```bash
# 1) app footage (fresh demo server)
rm -f data/demo.db* && npm run build && NEBRASKA_MODE=demo APP_URL=http://localhost:3000 npm start &
cd video && npm install && npm run capture
# 2) film (needs ffmpeg with libass, Python 3 with numpy/scipy/Pillow, Chrome or chrome-headless-shell via CHROME=)
npm run render        # -> artifacts/video/nebraska-film.mp4 and .srt
```

Intermediate renders go to `artifacts/video/build/` (ignored). App captures (`artifacts/video/captures/*.mp4`), fonts (from `@fontsource`) and narration WAVs (from `video/film/tts.mjs`) are regenerated rather than committed; capture metadata JSON is committed. Set `CHROME=` to a Chrome or chrome-headless-shell binary. Rendering on a 2-core CPU takes about 40 minutes.

## AI used

Narration: Kokoro-82M text-to-speech. The film code, edit and sound design were written with Claude (Anthropic) as Agent C.
