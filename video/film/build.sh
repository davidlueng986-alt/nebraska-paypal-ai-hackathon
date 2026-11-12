#!/usr/bin/env bash
# Build the Nebraska demo film deterministically from repo data and captures.
# Output: artifacts/video/nebraska-film.mp4 (+ .srt). See docs/VIDEO.md for prerequisites.
set -euo pipefail
cd "$(dirname "$0")"
FILM=$(pwd)
REPO=$(cd ../.. && pwd)
B=${BUILD_DIR:-$REPO/artifacts/video/build}
OUT=$REPO/artifacts/video
mkdir -p "$B" "$OUT"
CAP=$REPO/artifacts/video/captures

# 0. fonts (SIL OFL, from npm) and narration (Kokoro-82M) if not present
for d in fonts scene/fonts; do mkdir -p $d
  cp ../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-{normal,italic}.woff2 $d/
  cp ../node_modules/@fontsource/inter-tight/files/inter-tight-latin-500-normal.woff2 ../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2 $d/
done
mkdir -p vo; [ -f vo/m11.wav ] || node tts.mjs vo.json vo

# 1. generative scenes (three.js, rendered frame by frame in headless Chrome); layout from the real graph
(cd scene && node layout.mjs > /dev/null)
if [ ! -f "$B/open.mp4" ]; then (cd scene && npx esbuild scene.js --bundle --format=iife --loader:.json=json --outfile=bundle.js --log-level=warning && node render.mjs "$B/open.mp4" 1920 1080 0 18); fi
if [ ! -f "$B/end.mp4" ]; then (cd scene && MODE=end node render.mjs "$B/end.mp4" 1920 1080 0 11.5); fi
# 2. typography and data visuals
[ -f "$B/problem.mp4" ]  || node render-page.mjs "info.html?scene=problem" "$B/problem.mp4" 39.7
[ -f "$B/paypal.mp4" ]   || node render-page.mjs "info.html?scene=paypal"  "$B/paypal.mp4" 15
[ -f "$B/turn.mp4" ]     || node render-page.mjs "type.html?scene=turn"    "$B/turn.mp4" 10.5
[ -f "$B/endcard.mp4" ]  || node render-page.mjs "type.html?scene=endcard" "$B/endcard.mp4" 7.5
# 3. the real app (captures from capture/capture.mjs), edited
[ -f "$B/product.mp4" ] || python3 edit.py "$CAP" "$B/product.mp4"
# 4. narration: vo/*.wav is generated in step 0 (Kokoro-82M); a human recording with the same names also works
# 5. sound + mix
(cd scene && python3 audio.py "$B/open_sound.wav")
python3 mix.py "$B/open_sound.wav" "$B/film_audio.wav"
python3 captions.py "$OUT/nebraska-film.srt"
# 6. assemble, grade, captions, loudness (sections and trims come from edl.json)
python3 assemble.py "$B" "$B/film_audio.wav" "$OUT/nebraska-film.srt" "$OUT/nebraska-film.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/nebraska-film.mp4"
