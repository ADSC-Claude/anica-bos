"""A short music-box loop for the demo invitations.

Written rather than licensed: every demo needs *a* song so the ♫ button and
a design's own CLICK FOR MUSIC can be seen to work, and a real one cannot be
shipped in a public repository. Plain sine partials with a struck-bell decay,
which is close enough to a music box to read as one and is nobody's
recording.
"""
import math
import struct
import wave

RATE = 44100
BPM = 72
BEAT = 60.0 / BPM

# C major, an octave and a half of it — the notes a music box has
N = {'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00,
     'A4': 440.00, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25,
     'G5': 783.99, 'A5': 880.00, 'C6': 1046.50}

# A lullaby figure: rock between the tonic and the fifth, and let it settle.
# (note, beat it is struck on, how loud)
TUNE = [
    ('C5', 0.0, 1.0), ('E5', 0.5, 0.7), ('G5', 1.0, 0.8), ('E5', 1.5, 0.6),
    ('C5', 2.0, 0.9), ('G4', 2.5, 0.6), ('E5', 3.0, 0.8), ('C5', 3.5, 0.6),
    ('A4', 4.0, 1.0), ('C5', 4.5, 0.7), ('E5', 5.0, 0.8), ('C5', 5.5, 0.6),
    ('A4', 6.0, 0.9), ('E4', 6.5, 0.6), ('C5', 7.0, 0.8), ('A4', 7.5, 0.6),
    ('F4', 8.0, 1.0), ('A4', 8.5, 0.7), ('C5', 9.0, 0.8), ('A4', 9.5, 0.6),
    ('F4', 10.0, 0.9), ('C5', 10.5, 0.6), ('A4', 11.0, 0.8), ('F4', 11.5, 0.6),
    ('G4', 12.0, 1.0), ('B4', 12.5, 0.7), ('D5', 13.0, 0.8), ('B4', 13.5, 0.6),
    ('G4', 14.0, 0.9), ('D5', 14.5, 0.6), ('B4', 15.0, 0.7), ('G4', 15.5, 0.6),
    # and round again, ending open so the loop does not thud
    ('C5', 16.0, 1.0), ('E5', 16.5, 0.7), ('G5', 17.0, 0.8), ('C6', 17.5, 0.9),
    ('G5', 18.0, 0.7), ('E5', 18.5, 0.6), ('C5', 19.0, 0.8), ('G4', 19.5, 0.5),
    ('A4', 20.0, 0.9), ('C5', 20.5, 0.6), ('E5', 21.0, 0.7), ('A5', 21.5, 0.8),
    ('G5', 22.0, 0.6), ('E5', 22.5, 0.5), ('C5', 23.0, 0.7), ('C4', 23.0, 0.5),
]

LENGTH = 26.0
buf = [0.0] * int(RATE * LENGTH)

# A struck note: a bright partial that dies quickly over a fundamental that
# rings, which is what makes a comb tooth sound like one.
PARTIALS = [(1.0, 1.00, 2.6), (2.0, 0.30, 1.5), (3.0, 0.12, 0.9), (4.7, 0.06, 0.6)]


def strike(name, at, loud):
    f0 = N[name]
    start = int(at * BEAT * RATE)
    for i in range(int(3.2 * RATE)):
        k = start + i
        if k >= len(buf):
            break
        t = i / RATE
        # a couple of milliseconds of attack, so it is struck and not switched on
        attack = min(1.0, t / 0.004)
        v = 0.0
        for mult, amp, life in PARTIALS:
            v += amp * math.exp(-t / life) * math.sin(2 * math.pi * f0 * mult * t)
        buf[k] += v * attack * loud * 0.085


for name, at, loud in TUNE:
    strike(name, at, loud)

# ease the very start and the very end so the loop joins without a click
fade = int(0.04 * RATE)
for i in range(fade):
    buf[i] *= i / fade
    buf[-1 - i] *= i / fade

peak = max(abs(v) for v in buf) or 1.0
scale = 0.82 / peak
out = b''.join(struct.pack('<h', int(max(-1.0, min(1.0, v * scale)) * 32767)) for v in buf)

with wave.open('/tmp/claude-0/-home-user-anica-bos/07e22423-6a27-56ae-b64c-c47ff58eb796/scratchpad/music-box.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(out)
print('wrote', LENGTH, 's,', len(TUNE), 'notes')
