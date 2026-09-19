"""
Every writing in a Canva export, with the geometry a design needs.

This is the ground truth the christening is fitted to: for each page, each
run of type with the *baseline* it sits on, the middle of it, its width, its
point size over the page's width (which is cqw), its colour, its angle in
the sense CSS turns things, and the face it was set in.

Two things it does that a plain text dump does not:

  - it reports the **baseline**, not the top of the box. A line of type sits
    some way below the top of its box, and how far depends on the face and
    on the leading, so placing two different faces by their tops puts them
    in two different places. The baseline is what every typesetter measures
    from and it is what christening.ts carries.
  - it drops **Canva's shadow twin**. Canva stacks a black copy under every
    coloured word; the coloured one is the design and the black one is not.

    python3 scripts/canva-text.py <pdf dir> [out.json]
"""
import pymupdf, glob, os, json, math, sys

args = sys.argv[1:]
if not args:
    sys.exit(__doc__)
SRC = args[0]
DEST = args[1] if len(args) > 1 else None
out = {}
for path in sorted(glob.glob(f'{SRC}/*.pdf')):
    name = os.path.basename(path)[:-4]
    d = pymupdf.open(path); p = d[0]
    W, H = p.rect.width, p.rect.height
    raw = []
    for blk in p.get_text('rawdict')['blocks']:
        if blk['type'] != 0: continue
        for ln in blk['lines']:
            dx, dy = ln['dir']
            ang = round(math.degrees(math.atan2(dy, dx)), 1)   # CSS sense: +ve = clockwise on screen
            for sp in ln['spans']:
                chars = [c for c in sp['chars']]
                txt = ''.join(c['c'] for c in chars)
                if not txt.strip(): continue
                x0, y0, x1, y1 = sp['bbox']
                base = chars[0]['origin'][1]
                ox = chars[0]['origin'][0]
                raw.append(dict(t=txt, font=sp['font'], size=round(sp['size'], 2), col=f"#{sp['color']:06x}",
                                ang=ang, x0=x0, x1=x1, y0=y0, y1=y1, base=base, ox=ox))
    # Canva stacks a black copy under every coloured word; the coloured one wins
    keep = []
    for r in raw:
        if r['col'] == '#000000' and any(
            q is not r and q['col'] != '#000000' and q['t'] == r['t']
            and abs(q['x0'] - r['x0']) < 0.6 and abs(q['base'] - r['base']) < 0.6 for q in raw):
            continue
        keep.append(r)
    for r in keep:
        r['x0p'] = round(r['x0'] / W * 100, 2); r['x1p'] = round(r['x1'] / W * 100, 2)
        r['cxp'] = round((r['x0'] + r['x1']) / 2 / W * 100, 2)
        r['y0p'] = round(r['y0'] / H * 100, 2); r['y1p'] = round(r['y1'] / H * 100, 2)
        r['basep'] = round(r['base'] / H * 100, 3)
        r['wp'] = round((r['x1'] - r['x0']) / W * 100, 2)
        r['cqw'] = round(r['size'] / W * 100, 2)
        for k in ('x0', 'x1', 'y0', 'y1', 'base', 'ox'): del r[k]
    keep.sort(key=lambda r: (r['basep'], r['x0p']))
    out[name] = dict(w=W, h=H, spans=keep)
if DEST:
    json.dump(out, open(DEST, 'w'), indent=1)
for name, v in out.items():
    print('=' * 78); print(name)
    for r in v['spans']:
        print(f"  base{r['basep']:7.3f} y{r['y0p']:6.2f}-{r['y1p']:6.2f} cx{r['cxp']:6.2f} w{r['wp']:5.2f} "
              f"{r['cqw']:5.2f}cqw {r['col']} {r['ang']:6.1f} {r['font'][:20]:20s} {r['t'][:40]!r}")
