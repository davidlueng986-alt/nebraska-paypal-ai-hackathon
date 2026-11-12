"""Original sound design for the test shot. Everything is synthesized here (no samples, no music library)."""
import json, sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

T = json.load(open('timeline.json'))
SR = 48000
DUR = T['duration']
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)
t_all = np.arange(n) / SR

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= n: return
    sig = sig[: n - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * gain * l * 1.414
    R[i:i + len(sig)] += sig * gain * r * 1.414

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)
def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)
def env(len_s, a, d):
    t = np.arange(int(len_s * SR)) / SR
    return np.minimum(t / a, 1) * np.exp(-np.maximum(t - a, 0) / d)

# --- keystrokes ---
line = T['importLine']
for k, ch in enumerate(line):
    t0 = T['typeStart'] + k * T['charDt'] + rng.normal(0, 0.004)
    m = 0.08
    click = bp(rng.normal(size=int(m * SR)), 1800 + rng.uniform(-300, 600), 7000) * env(m, 0.0008, 0.010)
    thock = np.sin(2 * np.pi * rng.uniform(170, 230) * np.arange(int(m * SR)) / SR) * env(m, 0.001, 0.018)
    g = 0.16 if ch != ' ' else 0.10
    add(click * 0.9 + thock * 0.35, t0, g * rng.uniform(0.75, 1.0), pan=rng.uniform(-0.25, 0.25))
# last key heavier
tl = T['typeStart'] + len(line) * T['charDt'] + 0.12
add(bp(rng.normal(size=int(0.15 * SR)), 300, 4000) * env(0.15, 0.001, 0.03) * 0.5
    + np.sin(2 * np.pi * 120 * np.arange(int(0.15 * SR)) / SR) * env(0.15, 0.001, 0.05) * 0.4, tl, 0.35)

# --- collapse: reverse swell ---
c0, c1 = T['collapseStart'], T['pullStart']
m = c1 - c0 + 0.05
tt = np.arange(int(m * SR)) / SR
shape = (tt / m) ** 3
sweep = np.sin(2 * np.pi * np.cumsum(180 + 900 * (tt / m) ** 2) / SR)
noise = bp(rng.normal(size=len(tt)), 400, 6000)
add((sweep * 0.3 + noise * 0.5) * shape, c0, 0.5)

# --- impact at pull start ---
m = 4.0
tt = np.arange(int(m * SR)) / SR
f = 52 * np.exp(-tt * 0.6) + 26
sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(m, 0.004, 1.3)
air = lp(rng.normal(size=len(tt)), 900) * env(m, 0.002, 0.35)
add(sub * 0.9 + air * 0.35, c1, 0.75)

# --- drone pad (darkens during the dive, drops out at arrival) ---
d0, d_end = c1, DUR
seg = (t_all >= d0)
roots = [55.0, 82.41, 110.0, 130.81, 164.81]
pad_l = np.zeros(n); pad_r = np.zeros(n)
dive = np.clip((t_all - T['diveStart']) / (T['diveEnd'] - T['diveStart']), 0, 1)
bright = 9 - 6 * dive           # harmonic roll-off: lower = darker
for j, fr in enumerate(roots):
    for h in range(1, 10):
        amp = (1 / h) * np.exp(-h / bright) * (0.9 if j < 2 else 0.5)
        for side, det in ((pad_l, -0.18), (pad_r, 0.21)):
            ph = rng.uniform(0, 2 * np.pi)
            side += amp * np.sin(2 * np.pi * (fr * h + det * h) * t_all + ph + 0.3 * np.sin(2 * np.pi * 0.07 * t_all * (j + 1)))
fade_in = np.clip((t_all - d0) / 2.5, 0, 1) ** 2
drop = 1 - np.clip((t_all - (T['arrive'] - 0.35)) / 0.5, 0, 1) * 0.94
tail = np.clip((d_end - t_all) / 0.6, 0, 1)
g = fade_in * drop * tail * seg * 0.05
L += pad_l * g; R += pad_r * g

# --- depth pings (one per depth level crossed) ---
def ease(x): return np.where(x < .5, 4 * x ** 3, 1 - (-2 * x + 2) ** 3 / 2)
ks = np.linspace(0, 1, 20001)
prog = -1 + ease(ks) * (9 + 0.5)
for d in range(0, 9):
    k = ks[np.argmax(prog >= d)]
    t0 = T['diveStart'] + k * (T['diveEnd'] - T['diveStart'])
    fr = 880 * (0.5 ** (d / 4))  # two octaves down across 8 levels
    m = 1.8
    tt = np.arange(int(m * SR)) / SR
    ping = (np.sin(2 * np.pi * fr * tt) + 0.25 * np.sin(2 * np.pi * fr * 2.01 * tt)) * env(m, 0.003, 0.45)
    gain = 0.11 if d < 8 else 0.16
    add(ping, t0, gain, pan=-0.5 if d % 2 else 0.5)
    add(ping, t0 + 0.23, gain * 0.35, pan=0.5 if d % 2 else -0.5)   # sonar echo

# --- arrival: near silence, one low thump, one fragile tone ---
ta = T['arrive'] + 0.25
m = 2.5; tt = np.arange(int(m * SR)) / SR
thump = np.sin(2 * np.pi * (48 * np.exp(-tt * 3) + 36) * tt) * env(m, 0.005, 0.5)
add(thump, ta, 0.26)
m = 2.2; tt = np.arange(int(m * SR)) / SR
glass = np.sin(2 * np.pi * 1318.5 * tt) * np.minimum(tt / 0.6, 1) * np.exp(-np.maximum(tt - 0.6, 0) / 0.9)
add(glass, ta + 0.6, 0.035, pan=0.1)

# --- room tone ---
room = lp(rng.normal(size=n), 300) * 0.006
L += room; R += lp(rng.normal(size=n), 300) * 0.006

# --- reverb (synthetic IR) ---
ir_len = int(2.6 * SR)
ti = np.arange(ir_len) / SR
irL = rng.normal(size=ir_len) * np.exp(-ti / 0.55); irR = rng.normal(size=ir_len) * np.exp(-ti / 0.55)
irL = lp(irL, 5000); irR = lp(irR, 5000)
wetL = fftconvolve(L, irL)[:n]; wetR = fftconvolve(R, irR)[:n]
wetL /= np.abs(irL).sum() ** 0.5 * 6; wetR /= np.abs(irR).sum() ** 0.5 * 6
outL = L + wetL * 0.9; outR = R + wetR * 0.9
# end fade + normalize to -1 dBFS peak
fade = np.clip((DUR - t_all) / 0.4, 0, 1)
st = np.stack([outL * fade, outR * fade], 1)
st /= np.abs(st).max() / 0.89
wavfile.write(sys.argv[1], SR, (st * 32767).astype(np.int16))
print('ok', st.shape)
