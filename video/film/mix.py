"""Original score, sound design and voice-over mix for the whole film. Everything is synthesized here
(no samples, no music library); narration comes from vo/*.wav (Kokoro-82M, Apache-2.0).

usage: python3 mix.py <open_sound.wav> <out.wav>
"""
import json, sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt, resample_poly
from scipy.io import wavfile

HERE = __file__.rsplit('/', 1)[0]
E = json.load(open(f'{HERE}/edl.json'))
SR = 48000
starts, t = {}, 0.0
for s in E['sections']:
    starts[s['name']] = t; t += s['dur']
DUR = t
n = int(DUR * SR)
music = np.zeros((n, 2)); sfx = np.zeros((n, 2)); vo = np.zeros((n, 2))
rng = np.random.default_rng(3)
T = np.arange(n) / SR

def lp(x, f): return sosfilt(butter(2, f, btype='low', fs=SR, output='sos'), x, axis=0)
def hp(x, f): return sosfilt(butter(2, f, btype='high', fs=SR, output='sos'), x, axis=0)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], btype='band', fs=SR, output='sos'), x, axis=0)
def env(sec, a, d):
    tt = np.arange(int(sec * SR)) / SR
    return np.minimum(tt / a, 1) * np.exp(-np.maximum(tt - a, 0) / d)
def put(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= n or i + len(sig) <= 0: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: n - i]
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        sig = np.stack([sig * l, sig * r], 1)
    buf[i:i + len(sig)] += sig * gain
def tone(f, sec, a=0.005, d=0.4, harm=(1, .3, .1)):
    tt = np.arange(int(sec * SR)) / SR
    return sum(h * np.sin(2 * np.pi * f * (k + 1) * tt) for k, h in enumerate(harm)) * env(sec, a, d)

# ---------------- opening: the test shot's own sound design (rendered for 18 s), cut at 15.5 s ----------------
sr0, o = wavfile.read(sys.argv[1]); o = o.astype(float) / 32767
o = o[: int(E['sections'][0]['dur'] * SR)]
fade = np.ones(len(o)); fade[-int(0.8 * SR):] = np.linspace(1, 0, int(0.8 * SR))
put(sfx, o * fade[:, None] * 0.9, 0)

# ---------------- score: slow pad whose harmony moves minor -> major ----------------
def pad(chord, t0, t1, gain, bright=5.0, attack=2.0, release=2.0):
    i0, i1 = int(t0 * SR), int(min(t1 + release, DUR) * SR)
    tt = np.arange(i1 - i0) / SR
    out = np.zeros((len(tt), 2))
    for j, f in enumerate(chord):
        for h in range(1, 8):
            amp = (1 / h) * np.exp(-h / bright) / len(chord)
            for c, det in ((0, -0.2), (1, 0.23)):
                out[:, c] += amp * np.sin(2 * np.pi * (f * h + det * h) * tt + rng.uniform(0, 6.28) + 0.25 * np.sin(2 * np.pi * 0.06 * (j + 1) * tt))
    e = np.minimum(tt / attack, 1) * np.clip((t1 - t0 + release - tt) / release, 0, 1)
    put(music, out * e[:, None], t0, gain)

A2, C3, E3, A3, Cs3, Fs2, D3, B2, G2 = 110, 130.81, 164.81, 220, 138.59, 92.5, 146.83, 123.47, 98.0
s_st, s_tu, s_pr, s_en, s_ec = starts['stakes'], starts['turn'], starts['product'], starts['end'], starts['endcard']
pad([55, A2, C3, E3], s_st - 1.0, s_tu - 0.3, 0.30, bright=3.5)                 # stakes: A minor, dark
pad([87.31, A2, C3, 174.6], s_st + 7.5, s_tu - 0.3, 0.16, bright=3.0)          # F colour under Tailwind card
pad([55, A2, Cs3, E3, A3], s_tu + 6.9, s_pr + 1.0, 0.30, bright=5.0, attack=2.5)  # "Nebraska": A major, lift
# product underscore: gentle progression, 4 bars repeating
prog = [[55, 110, 138.59, 164.81], [92.5, 110, 138.59, 185.0], [73.42, 110, 146.83, 185.0], [82.41, 123.47, 164.81, 207.65]]
bar = 6.0
k = 0
tb = s_pr
while tb < s_en - 0.5:
    pad(prog[k % 4], tb, min(tb + bar, s_en), 0.22, bright=4.0, attack=1.2, release=1.5)
    tb += bar; k += 1
# soft pulse (heartbeat-like) during product
beat = 60 / 76
tb = s_pr + 0.5
while tb < s_en - 1.0:
    m = 0.5; tt = np.arange(int(m * SR)) / SR
    put(music, np.sin(2 * np.pi * (46 * np.exp(-tt * 6) + 38) * tt) * env(m, 0.004, 0.12), tb, 0.10)
    tb += beat
# end shot: big swell as the graph turns green, then quiet chord under the end card
pad([55, A2, Cs3, E3, A3, 277.18], s_en, s_en + 9.5, 0.42, bright=7.0, attack=6.0, release=2.5)
pad([55, A2, E3, A3], s_ec + 0.2, DUR - 1.0, 0.24, bright=3.0, attack=1.5, release=1.0)

# ---------------- sound design ----------------
def hit(at, gain=0.5):
    m = 2.5; tt = np.arange(int(m * SR)) / SR
    sub = np.sin(2 * np.pi * np.cumsum(50 * np.exp(-tt * 1.2) + 28) / SR) * env(m, 0.004, 0.7)
    put(sfx, sub + lp(rng.normal(size=len(tt)), 700) * env(m, 0.002, 0.15) * 0.3, at, gain)
def tick(at, gain=0.15, f=2400):
    m = 0.06; put(sfx, bp(rng.normal(size=int(m * SR)), f * .7, f * 1.6) * env(m, 0.0006, 0.008), at, gain)
def uiclick(at): tick(at, 0.22, 3200); put(sfx, tone(180, 0.08, 0.001, 0.015, (1,)), at, 0.12)
def lock(at, i):   # gate lock: mechanical clunk rising in pitch
    m = 0.5; tt = np.arange(int(m * SR)) / SR
    body = np.sin(2 * np.pi * (140 + i * 18) * tt) * env(m, 0.002, 0.06)
    clack = bp(rng.normal(size=len(tt)), 1500, 6000) * env(m, 0.0005, 0.012)
    put(sfx, body * 0.7 + clack * 0.6, at, 0.42, pan=-0.3 + i * 0.1)
    put(sfx, tone(660 * 2 ** (i / 12 * 2), 0.9, 0.003, 0.25, (1, .2)), at + 0.03, 0.035)
def chime(at, f, gain=0.08): put(sfx, tone(f, 2.5, 0.004, 0.8, (1, .35, .12, .05)), at, gain)
def deny(at):
    m = 0.6; tt = np.arange(int(m * SR)) / SR
    put(sfx, (np.sign(np.sin(2 * np.pi * 92 * tt)) * 0.3 + np.sin(2 * np.pi * 46 * tt)) * env(m, 0.003, 0.18), at, 0.18)
def whoosh(at, sec=0.8, gain=0.25):
    tt = np.arange(int(sec * SR)) / SR
    sh = np.sin(np.pi * tt / sec) ** 2
    put(sfx, bp(rng.normal(size=len(tt)), 300, 5000) * sh, at, gain)

# stakes: a hit on each card
for i, c in enumerate([0.0, 4.0, 8.0]):
    hit(s_st + c + 0.1, 0.35 if i else 0.5); tick(s_st + c + 0.35, 0.12, 5000)
# turn: silence beat, then the name lands
hit(s_tu + 7.1, 0.3)
# product section cuts
pstart = s_pr
offs = 0.0
for sh in E['product']:
    whoosh(pstart + offs - 0.35, 0.7, 0.12); offs += sum(p[2] for p in sh['pieces'])
for at in [2.3, 20.3, 33.6, 40.87, 81.3]:
    uiclick(pstart + at)
p4 = pstart + 40.0
deny(p4 + 5.3)                       # injection rejected
chime(p4 + 12.4, 440, 0.06); chime(p4 + 12.65, 349.2, 0.06)   # recipient held
for i in range(7): lock(p4 + 16.9 + i * 0.5, i)                 # I1..I7
hit(p4 + 20.6, 0.25)                                            # payout batch submitted
for i, f in enumerate([880, 1108.7, 1318.5]): chime(p4 + 22.6 + i * 0.9, f, 0.06)  # three payout items
chime(p4 + 26.6, 659.3, 0.07); chime(p4 + 26.6, 880, 0.05)      # success
chime(pstart + 70.4, 554.4, 0.05); chime(pstart + 70.9, 659.3, 0.05)  # maintainer
chime(pstart + 84.4, 659.3, 0.07)                               # "No second payment" (same motif as success)
# end card logo
hit(s_ec + 5.3, 0.28)

# ---------------- voice-over ----------------
from scipy.io.wavfile import read as wread
vo_env = np.zeros(n)
for v in E['vo']:
    sr, x = wread(f"{HERE}/vo/{v['id']}.wav")
    x = x.astype(float); x = x / (np.abs(x).max() + 1e-9)
    if x.ndim > 1: x = x.mean(1)
    if sr != SR: x = resample_poly(x, SR, sr)
    x = hp(x, 90)
    rms = np.sqrt(np.mean(x ** 2)); x *= 0.11 / (rms + 1e-9)
    at = starts['open'] + v['at']
    put(vo, x, at, 1.0)
    i = int(at * SR); vo_env[i:i + len(x)] = np.maximum(vo_env[i:i + len(x)], 1)
# ducking envelope (attack 80 ms, release 400 ms)
k_a, k_r = 1 - np.exp(-1 / (0.08 * SR)), 1 - np.exp(-1 / (0.4 * SR))
d = np.zeros(n); cur = 0.0
step = 64
for i in range(0, n, step):
    tgt = vo_env[i]; cur += (tgt - cur) * (1 - (1 - (k_a if tgt > cur else k_r)) ** step); d[i:i + step] = cur
duck = 1 - 0.55 * d

# ---------------- reverb on music + sfx, then mix ----------------
ir_len = int(2.4 * SR); ti = np.arange(ir_len) / SR
ir = np.stack([lp(rng.normal(size=ir_len) * np.exp(-ti / 0.6), 5000) for _ in range(2)], 1)
ir /= np.sqrt((ir ** 2).sum(0)) * 4
wet = np.stack([fftconvolve(music[:, c] + sfx[:, c] * 0.6, ir[:, c])[:n] for c in range(2)], 1)
mix = (music * 0.9 + wet * 0.8) * duck[:, None] + sfx + vo
mix[-int(1.0 * SR):] *= np.linspace(1, 0, int(1.0 * SR))[:, None]
mix /= np.abs(mix).max() / 0.89
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
print('ok', round(DUR, 2), 's')
