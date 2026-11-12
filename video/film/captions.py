"""Write the English captions (.srt) from the narration script and the edit decision list."""
import json, sys, wave, textwrap
HERE = __file__.rsplit('/', 1)[0]
E = json.load(open(f'{HERE}/edl.json'))
V = {v['id']: v['text'] for v in json.load(open(f'{HERE}/vo.json'))}

from scipy.io import wavfile
def dur(i):
    sr, x = wavfile.read(f'{HERE}/vo/{i}.wav'); return len(x) / sr
def ts(t):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    return f'{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}'.replace(',1000', ',999')

out, k = [], 1
for v in E['vo']:
    if v.get('caption') is False: continue
    text, t0, d = V[v['id']], v['at'], dur(v['id'])
    # split into caption chunks of at most two lines, timed by character share
    sents = [s.strip() for s in text.replace('? ', '?|').replace('. ', '.|').split('|') if s.strip()]
    chunks, cur = [], ''
    for s in sents:
        if len(cur) + len(s) + 1 <= 84: cur = (cur + ' ' + s).strip()
        else: chunks.append(cur); cur = s
    if cur: chunks.append(cur)
    total = sum(len(c) for c in chunks); t = t0
    for c in chunks:
        cd = d * len(c) / total
        out.append(f"{k}\n{ts(t)} --> {ts(t + cd - 0.05)}\n" + '\n'.join(textwrap.wrap(c, 46)) + '\n')
        k += 1; t += cd
open(sys.argv[1], 'w').write('\n'.join(out))
print(k - 1, 'captions')
