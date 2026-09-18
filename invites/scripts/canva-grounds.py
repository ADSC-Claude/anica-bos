"""Turn a Canva PDF export into text-free page grounds.

    pip install pymupdf
    python3 invites/scripts/canva-grounds.py <pdf-dir> <out-dir>

The only Python in the repository, and deliberately so: this runs once
per design, by hand, when artwork arrives. It is not part of the build
and nothing at runtime imports it.

Why it exists. A design is drawn in Canva with the sample words in
place, and what the app needs is the same artwork with every word gone,
so the real customer's words can be drawn over it live. Asking the
designer to hide each text layer and export a second time is the
obvious answer and a bad one: it is sixteen exports a design, by hand,
every time anything changes, and a page she forgets is a page that
ships with somebody else's baby's name on it.

Three things have to come off, and each needs a different tool:

  1. Real text          BT..ET operators, page stream and every nested form.
  2. Flattened text     Canva rasterises any text carrying an effect — her
                        drop shadow does it. Those images give themselves
                        away by weight: 0-3 KB of thin lettering against
                        21-130 KB of actual art.
  3. Underlines         The rule under CLICK HERE is drawn line art, not
                        text, so neither of the above touches it. All four
                        share one colour, which is what finds them.

Everything removed here gets drawn again as a live element, so this is a
subtraction, not a loss.
"""
import pymupdf, re, glob, os, sys

BT_ET   = re.compile(rb'BT\b.*?\bET\b', re.S)
SMALL   = 8 * 1024
RULE    = (0.4039, 0.4039, 0.4275)   # the CLICK HERE underline

def near(c, t=0.02):
    return c and len(c) == 3 and all(abs(a-b) < t for a, b in zip(c, RULE))

def strip_text(doc, xref, seen):
    if xref in seen: return 0
    seen.add(xref); n = 0
    buf = doc.xref_stream(xref)
    if buf is not None:
        new, k = BT_ET.subn(b'', buf)
        if k: doc.update_stream(xref, new); n += k
    try: res = doc.xref_get_key(xref, 'Resources/XObject')
    except Exception: res = None
    if res and res[0] == 'dict':
        for _, ref in re.findall(r'/([^\s/]+)\s+(\d+)\s+0\s+R', res[1]):
            n += strip_text(doc, int(ref), seen)
    return n

if len(sys.argv) != 3:
    sys.exit(__doc__)
src, out = sys.argv[1], sys.argv[2]
if not os.path.isdir(src):
    sys.exit(f"no such directory: {src}")
os.makedirs(out, exist_ok=True)
tot = [0,0,0]
for f in sorted(glob.glob(f'{src}/*.pdf')):
    stem = os.path.basename(f)[:-4]
    d = pymupdf.open(f); p = d[0]

    seen = set(); t = 0
    for x in p.get_contents(): t += strip_text(d, x, seen)
    for it in p.get_xobjects(): t += strip_text(d, it[0], seen)

    imgs = 0
    for info in p.get_images(full=True):
        try: img = d.extract_image(info[0])
        except Exception: continue
        if len(img['image']) < SMALL:
            try: p.delete_image(info[0]); imgs += 1
            except Exception: pass

    rules = 0
    for dr in p.get_drawings():
        if near(dr.get('color')) or near(dr.get('fill')):
            p.add_redact_annot(dr['rect'] + (-1,-1,1,1), fill=False)
            rules += 1
    if rules:
        p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                           graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                           text=pymupdf.PDF_REDACT_TEXT_NONE)

    p = d.reload_page(p)
    z = 1080 / p.rect.width
    p.get_pixmap(matrix=pymupdf.Matrix(z, z)).save(f'{out}/{stem}.png')
    tot[0]+=t; tot[1]+=imgs; tot[2]+=rules
    flag = '  ←' if (imgs or rules) else ''
    print(f"{stem[:36]:<38} text {t:>3}  flat {imgs:>2}  rules {rules}{flag}")
    d.close()
print(f"\n{tot[0]} text blocks, {tot[1]} flattened pieces, {tot[2]} underlines")
