"""
Cut the pieces of her artwork that have to move.

Three of them, and each is taken out of her own export rather than drawn:

  click-for-music  her CLICK FOR MUSIC, set around the rim of the disc, which
                   no box of words can bend. The page is rendered as she drew
                   it and again with its *text* removed and nothing else, and
                   the difference is her letters on transparency.
  instax-print     the polaroid, frame and picture together, taken as the
                   difference between her page and the trimmed ground — which
                   has the print gone and the camera still on it, so the piece
                   comes out already cut off where the camera covers it. That
                   cut is the one the animation wants: the print rises out of
                   the slot, and what is behind the camera was never seen.
  envelope-card    the part of the card that is out of the envelope. She drew
                   it as tall as the envelope and pushed all the way in, so
                   there is no room to hide it behind the pocket — move it a
                   hair and its bottom corner shows below. What can be hidden
                   is what is above the mouth, so the card is cut along that
                   line and the piece above it is the element.

    python3 scripts/canva-cut.py <pdf dir> <trimmed grounds dir>

It prints the placement of each piece, which is what christening.ts carries.
"""
import sys, os, math
import pymupdf
from PIL import Image

if len(sys.argv) != 3:
    sys.exit(__doc__)
SRC, GROUNDS = sys.argv[1], sys.argv[2]
OUT = 'public/christening/parts'
os.makedirs(OUT, exist_ok=True)


def difference(before, after, box, floor, span):
    """What the second render is missing, on transparency, trimmed."""
    a, b = before.crop(box), after.crop(box)
    pa, pb = a.load(), b.load()
    w, h = a.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    po = out.load()
    for y in range(h):
        for x in range(w):
            r1, g1, b1 = pa[x, y]
            r2, g2, b2 = pb[x, y]
            d = max(abs(r1 - r2), abs(g1 - g2), abs(b1 - b2))
            if d > floor:
                po[x, y] = (r1, g1, b1, min(255, int(d * 255 / span)))
    bb = out.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()
    return out.crop(bb), bb


def place(name, page, box, bb, size, W, H):
    x0 = (box[0] + bb[0]) / size[0] * 100
    x1 = (box[0] + bb[2]) / size[0] * 100
    y0 = (box[1] + bb[1]) / size[1] * 100
    y1 = (box[1] + bb[3]) / size[1] * 100
    print(f'{name}: cx {(x0 + x1) / 2:.2f}  cy {(y0 + y1) / 2:.2f}  '
          f'w {x1 - x0:.2f}  aspect {((y1 - y0) * H) / ((x1 - x0) * W):.4f}')


def render(path, dpi_width=1080):
    d = pymupdf.open(path)
    p = d[0]
    z = dpi_width / p.rect.width
    pix = p.get_pixmap(matrix=pymupdf.Matrix(z, z))
    return d, p, Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


# ── her CLICK FOR MUSIC, off the rim of the disc ─────────────────────────────
d, p, before = render(f'{SRC}/Main Page 3 - Highlights.pdf')
W, H = p.rect.width, p.rect.height
p.add_redact_annot(p.rect, fill=False)
p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                   graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                   text=pymupdf.PDF_REDACT_TEXT_REMOVE)
p = d.reload_page(p)
z = 1080 / W
pix = p.get_pixmap(matrix=pymupdf.Matrix(z, z))
after = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
box = (int(0.650 * before.width), int(0.230 * before.height),
       int(0.910 * before.width), int(0.365 * before.height))
piece, bb = difference(before, after, box, 10, 80)
piece.save(f'{OUT}/click-for-music.webp', 'WEBP', quality=92, method=6)
place('click-for-music', p, box, bb, before.size, W, H)

# ── the polaroid, off the cover ──────────────────────────────────────────────
d, p, before = render(f'{SRC}/Main Page 1 - Cover.pdf')
W, H = p.rect.width, p.rect.height
# the cleaned ground, under the name canva-grounds.py now writes it: the page
# it is, not the file Canva exported
after = Image.open(f'{GROUNDS}/cover.webp').convert('RGB').resize(before.size)
box = (int(0.395 * before.width), int(0.705 * before.height),
       int(0.635 * before.width), int(0.870 * before.height))
piece, bb = difference(before, after, box, 6, 40)
piece.save(f'{OUT}/instax-print.webp', 'WEBP', quality=94, method=6)
place('instax-print', p, box, bb, before.size, W, H)

# ── the card, cut at the envelope's mouth ────────────────────────────────────
d = pymupdf.open(f'{SRC}/Main Page 3 - Highlights.pdf')
p = d[0]
W, H = p.rect.width, p.rect.height
m = {i['xref']: i['transform'] for i in p.get_image_info(xrefs=True)}


def frame(xref):
    a, b, c, dd, e, f = m[xref]
    lu, lv = math.hypot(a, b), math.hypot(c, dd)
    return dict(u=(a, b), v=(c, dd), lu=lu, lv=lv,
                uh=(a / lu, b / lu), vh=(c / lv, dd / lv),
                centre=(e + (a + c) / 2, f + (b + dd) / 2))


def rgba(doc, xref):
    """One of her pictures with its transparency, straight out of the file."""
    pix = pymupdf.Pixmap(doc, xref)
    key = doc.xref_get_key(xref, 'SMask')
    if key and key[0] == 'xref':
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, int(key[1].split()[0])))
    mode = 'RGBA' if pix.alpha else 'RGB'
    return Image.frombytes(mode, (pix.width, pix.height), pix.samples).convert('RGBA')


card, pocket = frame(38), frame(39)
tl = (card['centre'][0] - card['u'][0] / 2 - card['v'][0] / 2,
      card['centre'][1] - card['u'][1] / 2 - card['v'][1] / 2)

# ── where the card stops being seen ─────────────────────────────────────────
# Not the pocket's top edge: the pocket is a rectangle with a wide V cut out
# of its top, and the card shows *through* that V. Cut at the pocket's top
# edge and the card ends a third of the way up the notch, leaving the page
# showing through under her own writing — which is what it did. The line that
# matters is the V's point, the first row of the pocket that hides everything
# behind it, and it is measured off the piece rather than guessed so it stays
# true if she redraws the envelope.
front = Image.open(f'{OUT}/envelope-pocket.webp').convert('RGBA')
px = front.load()
lo, hi = front.width // 3, 2 * front.width // 3
notch = next((y for y in range(front.height)
              if all(px[x, y][3] > 200 for x in range(lo, hi, 2))), front.height) / front.height
top = (pocket['centre'][0] - pocket['v'][0] / 2, pocket['centre'][1] - pocket['v'][1] / 2)
mouth = (top[0] + pocket['v'][0] * notch, top[1] + pocket['v'][1] * notch)

dv = (mouth[0] - tl[0]) * card['vh'][0] + (mouth[1] - tl[1]) * card['vh'][1]
share = dv / card['lv']
turn = math.degrees(math.atan2(card['u'][1], card['u'][0]))
cx = tl[0] + card['uh'][0] * card['lu'] / 2 + card['vh'][0] * dv / 2
cy = tl[1] + card['uh'][1] * card['lu'] / 2 + card['vh'][1] * dv / 2
# from the file every time, so a re-run never crops an already-cropped piece
im = rgba(d, 38)
im.crop((0, 0, im.width, round(im.height * share))).save(
    f'{OUT}/envelope-card.webp', 'WEBP', quality=94, method=6)
print(f'envelope-card: the V bottoms out {notch * 100:.1f}% down the pocket; '
      f'the card keeps its top {share * 100:.1f}%')
print(f'envelope-card: cx {cx / W * 100:.2f}  cy {cy / H * 100:.2f}  '
      f'w {card["lu"] / W * 100:.2f}  aspect {dv / card["lu"]:.4f}  turn {turn:.2f}')
