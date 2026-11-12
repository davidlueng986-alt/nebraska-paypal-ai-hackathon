# Demo film

**Film:** 1920×1080, 30 fps, 2:40, burned-in English captions; captions also in `artifacts/video/nebraska-film.srt`. The rendered MP4 is published on YouTube (link in the README/Devpost once uploaded); `npm run render` in `video/` rebuilds it to `artifacts/video/nebraska-film.mp4`.

## What is on screen

| Time | Section | Source |
|---|---|---|
| 0:00–0:15 | A real `import` line from this repo; the camera pulls back over the full dependency graph (419 packages from `package-lock.json`) and follows the real chain `@paypal/agent-toolkit → … → p-limit → p-try` to depth 8. | `fixtures/dependency-graph.json`, rendered in three.js |
| 0:15–0:30 | Three verified incidents (Heartbleed, xz, Tailwind), each with its source on screen. | See “Facts” below |
| 0:30–0:46 | “AI is the first user of open source that knows exactly who it owes.” Product one-liner. | Typography |
| 0:46–2:19 | **The real app**, recorded at 2× device pixels from a local demo-mode server: budget approval (redirect to PayPal cut to the approved state) and hook line, “Why this amount” (AI off $69.44 / AI on $161.29), grant approval, a live month-end run (README injection rejected to neutral 1.0, recipient held, I1–I7, batch `nebraska-2026-11`, three payout items), Maya’s income ($411.29), rerun with “No second payment”, and the recomputable statement. | `artifacts/video/captures/*.mp4` from `video/capture/capture.mjs` |
| 2:19–2:30 | The graph again, threaded back in green from the deepest package upward. | three.js |
| 2:30–2:40 | “You can still choose not to pay. You just can’t say you didn’t know.” Repository URL. | Typography |

A permanent on-screen note reads **“Demo mode · fictional identities”** during the app section. The footage was recorded on a local demo-mode server, which makes no PayPal calls: the approve buttons open the app’s demo approval page, which the edit cuts out (click → approved). In sandbox mode the same buttons redirect to PayPal’s own approval page (`components/start/start-view.tsx`, `components/approvals/grant-ask.tsx`), after a workspace sign-in at `/signin`. Real sandbox evidence so far is limited to what `docs/STATUS.md` records. Package usage, team size, funding and the advisory for `fast-xml-parser` are demo seed values, not facts about the real project. Maya and the other recipients are fictional.

## Facts (each opened at its source)

- Heartbleed: OpenSSL took in no more than $2,000 a year in donations and had one full-time developer. The Register, 2021-05-10.
- xz: a single, overworked, uncompensated maintainer; the attack ran over at least two years. LWN.net, 2024.
- Tailwind CSS: docs traffic down about 40%, revenue down close to 80%, 75% of the engineering team (three of four engineers) laid off. Adam Wathan, January 2026, via Leanware.

## How it is made (all original)

- **Generative scenes:** three.js with custom point/line shaders, bloom, depth of field, chromatic aberration and letterbox (`video/film/scene/`), rendered frame by frame in headless Chrome (software WebGL). Layout from a seeded d3-force-3d simulation of the real graph.
- **App footage:** `video/capture/capture.mjs` drives the real UI with Playwright and records the DevTools screencast at 2880×1800; a visible cursor is drawn by an injected overlay.
- **Edit:** `video/film/edit.py` (time remaps and camera moves on the captures; the app window floats on the film’s ink background), `video/film/edl.json` (every cut, freeze and narration cue).
- **Typography:** `video/film/type.html`.
- **Narration:** synthetic voice, Kokoro-82M (Apache-2.0) via `kokoro-js`, voice `af_heart`; script in `video/film/vo.json`. It can be replaced by a human recording with the same file names.
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
