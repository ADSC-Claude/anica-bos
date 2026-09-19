# Cutting the wardrobe

The figures on the dress code page are the designer's fashion plates, cut into
two layers each: `<id>-shade.webp`, the garment as its shading alone, which the
page recolours to whatever the family picked; and `<id>-fixed.webp`, the parts
that keep their colour as drawn — the white shirt and tie inside a coat, a bow
tie, the shirt sleeves under a boy's waistcoat, a leg through a slit. Both go
into `public/attire/`, and `src/lib/wardrobe.json` lists every garment with its
size, group, kind and `coat`: how much of the figure the picked colour reaches.

Two sheets were drawn. Each script here reads its own boxes — one per garment on
the sheet, in the sheet's pixels — and writes its half of the registry:

    node scripts/wardrobe/cut-sheet-1.mjs out1 /path/to/sheet-1.png --debug
    node scripts/wardrobe/cut-sheet-2.mjs out2 /path/to/sheet-2.png --debug

The sheets themselves are the designer's artwork and are not in the repository;
ask for them before recutting. `--debug` writes a strip per garment — the source,
the cut as a red/blue mask, and the figure previewed in two colours — which is
how the cut is checked. `wardrobe.json` is the two outputs' registries joined,
sheet 1 first.

**A whole outfit is one garment.** Shirts once had their trousers cut into the
fixed layer, so the colour reached only half the figure and the page showed a
sage shirt over cream chinos whatever anyone picked. Everything that is cloth
belongs in the shade layer; only what is not the garment is fixed.
