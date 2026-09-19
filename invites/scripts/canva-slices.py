"""
Cut a ground into head, band and foot, for a page that can outgrow it.

A page that grows stretches its picture, and a stretched banner is a
ruined banner. So the picture is cut in three: the head and the foot are
kept whole and only the band between them is stretched — the same cut the
ten Baby Blue grounds use (`sliceHeights`, 44% each end).

    python3 scripts/canva-slices.py rsvp faq

44% each end is right for a page whose middle is plain sky. Where the
plain part of a picture is somewhere else — the guestbook's hearts leave
one clear strip, between 45% and 52% of the page, and the Instagram post's
white card runs from a quarter of the way down to just above its own
bottom edge — the head and the foot are given per picture, as fractions of
the height:

    python3 scripts/canva-slices.py guestbook:0.45:0.478 post-event:0.25:0.167

The band between them is what gets stretched, so it has to be a strip that
looks the same however tall it is drawn.
"""
import sys
from PIL import Image

HEAD = 0.44

for arg in sys.argv[1:]:
    parts = arg.split(':')
    slug = parts[0]
    head_share = float(parts[1]) if len(parts) > 1 else HEAD
    foot_share = float(parts[2]) if len(parts) > 2 else head_share
    src = f'public/christening/{slug}.webp'
    im = Image.open(src).convert('RGB')
    w, h = im.size
    head = round(h * head_share)
    foot = round(h * foot_share)
    band = h - head - foot
    if band < 1:
        raise SystemExit(f'{slug}: the head and the foot leave no band to stretch')
    im.crop((0, 0, w, head)).save(f'public/christening/{slug}-top.webp', 'WEBP', quality=88, method=6)
    im.crop((0, head, w, head + band)).save(f'public/christening/{slug}-mid.webp', 'WEBP', quality=88, method=6)
    im.crop((0, head + band, w, h)).save(f'public/christening/{slug}-foot.webp', 'WEBP', quality=88, method=6)
    print(f'{slug}: {w}x{h} -> head {head}, band {band}, foot {foot}')
