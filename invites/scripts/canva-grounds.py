"""Turn a Canva PDF export into text-free page grounds.

    pip install pymupdf pillow

    python3 invites/scripts/canva-grounds.py <pdf-dir> <out-dir> --survey
    python3 invites/scripts/canva-grounds.py <pdf-dir> <out-dir>

The only Python in the repository, and deliberately so: it runs once per
design, by hand, when artwork arrives. Nothing at runtime imports it and
it is not part of the build.

Why it exists
-------------
A design is drawn in Canva with sample words in place, and what the app
needs is the same artwork with every word gone, so a real customer's
name can be drawn over it live. Asking the designer to hide each text
layer and export a second time is the obvious answer and a bad one: it
is sixteen exports a design, by hand, repeated whenever anything
changes, and a page she forgets is a page that ships carrying somebody
else's baby's name.

The words leave by three different doors
----------------------------------------
**Real text** is BT..ET in the content stream. Stripping the page's own
streams got eleven of the christening's sixteen pages; the other five
keep text inside form XObjects, so it recurses.

**Underlines** are neither text nor picture. The rule under CLICK HERE
is drawn line art and survives every text pass. All four on the
christening are painted one colour nothing else uses, which is what
finds them; redaction then lifts the line art out of those rects while
leaving the images and background behind them alone.

    The mode matters. REMOVE_IF_TOUCHED took the page's baby blue
    ground with the underline, because that ground is a single filled
    path the size of the page and everything on the page touches it —
    so the two pages carrying underlines came out white and the other
    fourteen were fine. REMOVE_IF_COVERED removes only what sits
    wholly inside the rect, which is the underline and nothing else.

**Flattened text is not text at all.** Canva rasterises any text
carrying an effect — a drop shadow does it — so the cover's names, the
hashtag and the whole gift-note paragraph arrive as pictures.

    Nothing in the file marks which pictures those are, and file size,
    the obvious guess, is worthless. What gets stored is a mask, and a
    cloud mask weighs the same two kilobytes as a line of lettering. A
    size rule was tried here and it deleted nine clouds, a sprig of
    greenery and the music disc along with the words — and it did that
    while reporting success, which is the worse half.

So this does not guess. `--survey` writes a sheet showing every
candidate picture *as it appears on the page*, next to its xref. A
person reads it in a minute, lists the ones that are lettering in
`drops.json` beside the PDFs, and only those are removed. With no
drops.json every picture is kept, because keeping your artwork is the
safe failure and losing it silently is not.

    { "Main Page 1 - Cover": [18, 20, 26, 27] }

Everything removed here is drawn again as a live element, so this is a
subtraction, not a loss.
"""
import pymupdf, re, glob, os, sys, json

BT_ET = re.compile(rb'BT\b.*?\bET\b', re.S)
RULE  = (0.4039, 0.4039, 0.4275)   # the colour of the CLICK HERE underline
BIG   = 40 * 1024                  # a picture this heavy is plainly artwork, never a word

def near(c, t=0.02):
    return c and len(c) == 3 and all(abs(a - b) < t for a, b in zip(c, RULE))

def strip_text(doc, xref, seen):
    """Remove text operators from a stream and every form it draws."""
    if xref in seen:
        return 0
    seen.add(xref)
    n = 0
    buf = doc.xref_stream(xref)
    if buf is not None:
        new, k = BT_ET.subn(b'', buf)
        if k:
            doc.update_stream(xref, new)
            n += k
    try:
        res = doc.xref_get_key(xref, 'Resources/XObject')
    except Exception:
        res = None
    if res and res[0] == 'dict':
        for _, ref in re.findall(r'/([^\s/]+)\s+(\d+)\s+0\s+R', res[1]):
            n += strip_text(doc, int(ref), seen)
    return n


def survey(src, out):
    """Write a sheet of every candidate picture, shown where it sits."""
    from PIL import Image, ImageDraw
    os.makedirs(out, exist_ok=True)
    shots, guess = [], {}
    for f in sorted(glob.glob(f'{src}/*.pdf')):
        stem = os.path.basename(f)[:-4]
        d = pymupdf.open(f)
        p = d[0]
        s = 1080 / p.rect.width
        pix = p.get_pixmap(matrix=pymupdf.Matrix(s, s))
        page = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        for info in p.get_images(full=True):
            xref = info[0]
            try:
                img = d.extract_image(xref)
            except Exception:
                continue
            if len(img['image']) >= BIG:
                continue
            rects = p.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            box = (max(0, int(r.x0 * s) - 4), max(0, int(r.y0 * s) - 4),
                   min(page.width, int(r.x1 * s) + 4), min(page.height, int(r.y1 * s) + 4))
            if box[2] - box[0] < 8 or box[3] - box[1] < 8:
                continue
            shots.append((stem, xref, page.crop(box)))
            guess.setdefault(stem, [])
        d.close()

    TH, PAD, COLS = 120, 12, 8
    rows = (len(shots) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * (TH + PAD) + PAD, rows * (TH + 32 + PAD) + PAD), (240, 238, 234))
    dr = ImageDraw.Draw(sheet)
    for i, (stem, xref, im) in enumerate(shots):
        t = im.copy()
        t.thumbnail((TH, TH), Image.LANCZOS)
        c, r = i % COLS, i // COLS
        x, y = PAD + c * (TH + PAD), PAD + r * (TH + 32 + PAD)
        sheet.paste(t, (x + (TH - t.width) // 2, y + (TH - t.height) // 2))
        dr.rectangle([x, y, x + TH, y + TH], outline=(170, 165, 158))
        dr.text((x, y + TH + 2), stem[:18], fill=(60, 70, 85))
        dr.text((x, y + TH + 14), f'xref {xref}', fill=(120, 125, 135))
    path = os.path.join(out, '_survey.png')
    sheet.save(path)
    with open(os.path.join(out, '_drops-template.json'), 'w') as fh:
        json.dump(guess, fh, indent=2)
    print(f'{len(shots)} candidate pictures → {path}')
    print(f'List the lettering ones per page in {src}/drops.json, then run again without --survey.')


def build(src, out, drops, cuts):
    os.makedirs(out, exist_ok=True)
    tot = [0, 0, 0]
    for f in sorted(glob.glob(f'{src}/*.pdf')):
        stem = os.path.basename(f)[:-4]
        d = pymupdf.open(f)
        p = d[0]

        seen, t = set(), 0
        for x in p.get_contents():
            t += strip_text(d, x, seen)
        for it in p.get_xobjects():
            t += strip_text(d, it[0], seen)

        imgs = 0
        for xref in drops.get(stem, []):
            try:
                p.delete_image(xref)
                imgs += 1
            except Exception:
                print(f'  ! {stem}: xref {xref} would not delete')

        # Rectangles to clear of drawn shapes, given per page in cuts.json as
        # percentages of the page. A picture she drew with Canva's shape tools
        # is line art rather than an image, so it has no xref to drop — the
        # polaroid frame on the cover is one, and it has to leave the ground
        # because the whole print rises out of the camera on a tap. The mode
        # is REMOVE_IF_COVERED, so only shapes that fit *entirely* inside the
        # rectangle go: the page's own background fill touches it and stays.
        cut = 0
        for box in cuts.get(stem, []):
            x0, y0, x1, y1 = box
            r = pymupdf.Rect(x0 / 100 * p.rect.width, y0 / 100 * p.rect.height,
                             x1 / 100 * p.rect.width, y1 / 100 * p.rect.height)
            p.add_redact_annot(r, fill=False)
            cut += 1
        if cut:
            p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                               graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                               text=pymupdf.PDF_REDACT_TEXT_NONE)
            p = d.reload_page(p)

        rules = 0
        for dr in p.get_drawings():
            if near(dr.get('color')) or near(dr.get('fill')):
                p.add_redact_annot(dr['rect'] + (-1, -1, 1, 1), fill=False)
                rules += 1
        if rules:
            # REMOVE_IF_COVERED, never IF_TOUCHED: the page ground is one
            # filled path the width of the page, so anything that merely
            # *touches* the rect takes the whole background with it.
            p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                               graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                               text=pymupdf.PDF_REDACT_TEXT_NONE)

        p = d.reload_page(p)
        z = 1080 / p.rect.width
        p.get_pixmap(matrix=pymupdf.Matrix(z, z)).save(f'{out}/{stem}.png')
        left = len(p.get_text().strip())
        tot[0] += t; tot[1] += imgs; tot[2] += rules
        note = '' if not left else f'  ! {left} chars of text left'
        print(f'{stem[:36]:<38} text {t:>3}  lettering {imgs:>2}  rules {rules}  cuts {cut}{note}')
        d.close()
    print(f'\n{tot[0]} text blocks, {tot[1]} flattened pieces, {tot[2]} underlines')


args = [a for a in sys.argv[1:] if not a.startswith('--')]
if len(args) != 2:
    sys.exit(__doc__)
src, out = args
if not os.path.isdir(src):
    sys.exit(f'no such directory: {src}')

if '--survey' in sys.argv:
    survey(src, out)
else:
    dj = os.path.join(src, 'drops.json')
    if os.path.isfile(dj):
        drops = {k: list(v) for k, v in json.load(open(dj)).items()}
    else:
        drops = {}
        print(f'note: no {dj}, so every picture is kept. Run --survey to choose.\n')
    cj = os.path.join(src, 'cuts.json')
    cuts = {k: list(v) for k, v in json.load(open(cj)).items()} if os.path.isfile(cj) else {}
    build(src, out, drops, cuts)
