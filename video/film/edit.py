"""Edit the real app captures into the product section of the film.

Each shot = one capture file, a list of time-remap pieces (src_in, src_out, out_duration; src_in == src_out freezes),
and camera keyframes (t, cx, cy, zoom) in CSS pixels of the 1440x900 app viewport. The app window floats on the
film's ink background; the camera eases between keyframes. Output: raw frames piped to ffmpeg.

usage: python3 edit.py <captures_dir> <out.mp4> [--preview] [--only SHOT]
"""
import json, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

CAP = sys.argv[1]
OUT = sys.argv[2]
PREVIEW = '--preview' in sys.argv
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
FPS = 30
W, H = (960, 540) if PREVIEW else (1920, 1080)
S = W / 1920
VW, VH, DPR = 1440, 900, 2
WIN_CY = 520  # screen y of the window centre at zoom 1 (1080 space)

SHOTS = json.load(open(__file__.replace('edit.py', 'edl.json')))['product']

FONT = '/usr/share/fonts/opentype/inter/Inter-Medium.otf'
f_label = ImageFont.truetype(FONT, int(15 * S))
f_note = ImageFont.truetype(FONT, int(13 * S))

def ease(x):
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2

def cam_at(keys, t):
    if t <= keys[0][0]: return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            k = ease((t - a[0]) / max(1e-6, b[0] - a[0]))
            return tuple(a[i] + (b[i] - a[i]) * k for i in (1, 2, 3))
    return keys[-1][1:]

def src_time(pieces, t):
    acc = 0.0
    for a, b, d in pieces:
        if t < acc + d or (a, b, d) == tuple(pieces[-1]):
            k = min(1.0, max(0.0, (t - acc) / d))
            return a + (b - a) * k
        acc += d
    return pieces[-1][1]

def spaced(draw, xy, text, font, fill, spacing):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing

# background: warm ink with a soft centre
yy, xx = np.mgrid[0:H, 0:W]
r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
g = np.clip(1 - r / 1.25, 0, 1) ** 1.6
bg = np.stack([7 + 13 * g, 7 + 13 * g, 6 + 11 * g], -1).astype(np.uint8)
BG = Image.fromarray(bg)

class Reader:
    def __init__(self, path):
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
        self.idx = -1
        self.frame = None
    def get(self, i):
        while self.idx < i:
            buf = self.p.stdout.read(VW * DPR * VH * DPR * 3)
            if len(buf) < VW * DPR * VH * DPR * 3: break
            self.frame = Image.frombuffer('RGB', (VW * DPR, VH * DPR), buf, 'raw', 'RGB', 0, 1)
            self.idx += 1
        return self.frame
    def close(self):
        self.p.kill()

ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', OUT], stdin=subprocess.PIPE)

NOTE = 'Demo mode  ·  fictional identities'
for shot in SHOTS:
    if ONLY and shot['name'] != ONLY: continue
    dur = sum(p[2] for p in shot['pieces'])
    n = int(round(dur * FPS))
    rd = Reader(f"{CAP}/{shot['file']}")
    for fi in range(n):
        t = fi / FPS
        st = src_time(shot['pieces'], t)
        src = rd.get(int(round(st * FPS)))
        cx, cy, z = cam_at(shot['camera'], t)
        # keep the content filling the frame once we are zoomed in
        fill = min(1.0, max(0.0, (z - 1.0) / 0.3))
        hx, hy = 960 / z, 540 / z
        if 2 * hx < VW: cx = cx + (min(max(cx, hx), VW - hx) - cx) * fill
        # vertically keep a dark band at the top (labels) and bottom (captions): content spans screen y 60..940
        lo, hi = (WIN_CY - 60) / z, VH - (940 - WIN_CY) / z
        if lo < hi: cy = cy + (min(max(cy, lo), hi) - cy) * fill
        sc = z * S  # screen px per css px
        a = DPR / sc
        img = src.transform((W, H), Image.AFFINE, (a, 0, (cx - (W / 2) / sc) * DPR, 0, a, (cy - (WIN_CY * S) / sc) * DPR), resample=Image.BICUBIC)
        # window rectangle on screen
        x0 = (0 - cx) * sc + W / 2; x1 = (VW - cx) * sc + W / 2
        y0 = (0 - cy) * sc + WIN_CY * S; y1 = (VH - cy) * sc + WIN_CY * S
        frame = BG.copy()
        if x0 > -40 or y0 > -40 or x1 < W + 40 or y1 < H + 40:
            sh = Image.new('L', (W // 4, H // 4), 0)
            ImageDraw.Draw(sh).rounded_rectangle([x0 / 4, (y0 + 18 * S) / 4, x1 / 4, (y1 + 18 * S) / 4], radius=4, fill=150)
            sh = sh.filter(ImageFilter.GaussianBlur(8)).resize((W, H), Image.BILINEAR)
            frame.paste(Image.new('RGB', (W, H), (0, 0, 0)), (0, 0), sh)
        mask = Image.new('L', (W, H), 0)
        ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=max(2, int(12 * sc)), fill=255)
        frame.paste(img, (0, 0), mask)
        d = ImageDraw.Draw(frame)
        # chapter label + honesty note (fade in with the shot)
        k = min(1.0, t / 0.6)
        col = tuple(int(c * k) for c in (200, 196, 186))
        tw = d.textlength(NOTE, font=f_note)
        nx, ny = W - tw - int(60 * S), int(28 * S)
        d.rounded_rectangle([nx - 10 * S, ny - 6 * S, nx + tw + 10 * S, ny + 22 * S], radius=int(8 * S), fill=(12, 12, 11))
        d.text((nx, ny), NOTE, font=f_note, fill=tuple(int(c * k) for c in (170, 166, 158)))
        lw = sum(d.textlength(ch, font=f_label) + 3 * S for ch in shot['label'].upper())
        d.rounded_rectangle([50 * S, 20 * S, 70 * S + lw, 50 * S], radius=int(8 * S), fill=(12, 12, 11))
        spaced(d, (int(60 * S), int(26 * S)), shot['label'].upper(), f_label, col, 3 * S)
        ff.stdin.write(frame.tobytes())
        if fi % 90 == 0: print(shot['name'], f'{t:.1f}/{dur:.1f}', flush=True)
    rd.close()
ff.stdin.close(); ff.wait()
print('done', OUT)
