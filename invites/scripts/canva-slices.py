"""
Cut a ground into head, band and foot, for a page that can outgrow it.

A page that grows stretches its picture, and a stretched banner is a
ruined banner. So the picture is cut in three: the head and the foot are
kept whole and only the band between them is stretched — the same cut the
ten Baby Blue grounds use (`sliceHeights`, 44% each end).

    python3 scripts/canva-slices.py rsvp faq
"""
import sys, os
from PIL import Image

HEAD = 0.44

for slug in sys.argv[1:]:
    src = f'public/christening/{slug}.webp'
    im = Image.open(src).convert('RGB')
    w, h = im.size
    head = round(h * HEAD)
    band = h - head * 2
    im.crop((0, 0, w, head)).save(f'public/christening/{slug}-top.webp', 'WEBP', quality=88, method=6)
    im.crop((0, head, w, head + band)).save(f'public/christening/{slug}-mid.webp', 'WEBP', quality=88, method=6)
    im.crop((0, head + band, w, h)).save(f'public/christening/{slug}-foot.webp', 'WEBP', quality=88, method=6)
    print(f'{slug}: {w}x{h} -> head {head}, band {band}, foot {head}')
