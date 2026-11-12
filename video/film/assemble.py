"""Concatenate the film's sections from edl.json, add grain, burn captions, mix in the audio, normalize loudness.
usage: python3 assemble.py <build_dir> <film_audio.wav> <captions.srt> <out.mp4>
"""
import json, subprocess, sys
B, AUDIO, SRT, OUT = sys.argv[1:5]
HERE = __file__.rsplit('/', 1)[0]
E = json.load(open(f'{HERE}/edl.json'))
inputs, parts = [], []
for i, s in enumerate(E['sections']):
    inputs += ['-i', f"{B}/{s['file']}"]
    parts.append(f"[{i}:v]trim={s['in']}:{s['in'] + s['dur']},setpts=PTS-STARTPTS,fps=30,format=yuv420p[s{i}]")
n = len(E['sections'])
style = ("FontName=Inter Tight,FontSize=15,PrimaryColour=&H00EDE8DD,OutlineColour=&H80000000,"
         "BackColour=&H38000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22")
fc = ';'.join(parts) + ';' + ''.join(f'[s{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0,' \
     'noise=c0s=5:c0f=t+u:c1s=2:c1f=t+u:c2s=2:c2f=t+u,' \
     f"subtitles={SRT}:fontsdir={HERE}/fonts:force_style='{style}'[v];[{n}:a]loudnorm=I=-15:TP=-1.5:LRA=11[au]"
cmd = ['ffmpeg', '-y', '-v', 'error', *inputs, '-i', AUDIO, '-filter_complex', fc, '-map', '[v]', '-map', '[au]',
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-tune', 'film', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
       '-movflags', '+faststart', '-shortest', OUT]
subprocess.run(cmd, check=True)
print('done', OUT)
