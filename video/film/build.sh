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
mkdir -p vo; [ -f vo/v19.wav ] || node tts.mjs vo.json vo af_heart 0.95

# 1. generative scenes (three.js, rendered frame by frame in headless Chrome); layout from the real graph
(cd scene && node layout.mjs > /dev/null)
if [ ! -f "$B/open.mp4" ]; then (cd scene && npx esbuild scene.js --bundle --format=iife --loader:.json=json --outfile=bundle.js --log-level=warning && node render.mjs "$B/open.mp4" 1920 1080 0 18); fi
if [ ! -f "$B/end.mp4" ]; then (cd scene && MODE=end node render.mjs "$B/end.mp4" 1920 1080 0 11.5); fi
# 2. typography
[ -f "$B/stakes.mp4" ]  || node render-page.mjs "type.html?scene=stakes"  "$B/stakes.mp4" 14.5
[ -f "$B/turn.mp4" ]    || node render-page.mjs "type.html?scene=turn"    "$B/turn.mp4" 16
[ -f "$B/endcard.mp4" ] || node render-page.mjs "type.html?scene=endcard" "$B/endcard.mp4" 10
# 3. the real app (captures from capture/capture.mjs), edited
[ -f "$B/product.mp4" ] || python3 edit.py "$CAP" "$B/product.mp4"
# 4. narration: vo/*.wav is generated in step 0 (Kokoro-82M); a human recording with the same names also works
# 5. sound + mix
(cd scene && python3 audio.py "$B/open_sound.wav")
python3 mix.py "$B/open_sound.wav" "$B/film_audio.wav"
python3 captions.py "$OUT/nebraska-film.srt"
# 6. assemble, grade, captions, loudness
ffmpeg -y -v error \
  -i "$B/open.mp4" -i "$B/stakes.mp4" -i "$B/turn.mp4" -i "$B/product.mp4" -i "$B/end.mp4" -i "$B/endcard.mp4" -i "$B/film_audio.wav" \
  -filter_complex "\
[0:v]trim=0:15.5,setpts=PTS-STARTPTS[a];[1:v]trim=0:14.5,setpts=PTS-STARTPTS[b];[2:v]trim=0:16,setpts=PTS-STARTPTS[c];\
[3:v]trim=0:92.8,setpts=PTS-STARTPTS[d];[4:v]trim=0:11.5,setpts=PTS-STARTPTS[e];[5:v]trim=0:10,setpts=PTS-STARTPTS[f];\
[a][b][c][d][e][f]concat=n=6:v=1:a=0,format=yuv420p,\
noise=c0s=5:c0f=t+u:c1s=2:c1f=t+u:c2s=2:c2f=t+u,\
subtitles=$OUT/nebraska-film.srt:fontsdir=$FILM/fonts:force_style='FontName=Inter Tight,FontSize=15,PrimaryColour=&H00EDE8DD,OutlineColour=&H80000000,BackColour=&H38000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22'[v];\
[6:a]loudnorm=I=-15:TP=-1.5:LRA=11[au]" \
  -map "[v]" -map "[au]" -c:v libx264 -preset medium -crf 17 -tune film -c:a aac -b:a 256k -ar 48000 -movflags +faststart \
  "$OUT/nebraska-film.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/nebraska-film.mp4"
