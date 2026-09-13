# The gate-fold reveal engine

A ribbon-tied gate-fold holder. One tap unties the bow, the two panels swing
open like doors, and the card lifts out of the shadow between them and opens
out to fill the screen — at which point the engine lets go and what is left is
the invitation, scrolling, exactly as it was written.

Three files, no dependencies, no build step, and nothing fetched from anywhere:

| File | What it is |
|---|---|
| `gatefold.css` | The animation, the layout and all five themes. Every theme variable and its default is documented in the block at the top. |
| `gatefold.js` | The engine. An ES module exporting `createGatefold`. |
| `demo.html` | A theme switcher, colour pickers and a replay button, with a placeholder invitation inside. |
| `README.md` | This. |

Open the demo at **`/gatefold/demo.html`** (`npm run dev` from `invites/`). It
has to be served rather than opened from disk: an ES module cannot be imported
from a `file://` URL.

## Using it

```html
<link rel="stylesheet" href="/gatefold/gatefold.css">
<div id="app"></div>
<div hidden><div id="my-invitation">…your HTML…</div></div>

<script type="module">
  import { createGatefold } from '/gatefold/gatefold.js';

  const gf = createGatefold('#app', {
    theme: 'wedding',                    // wedding baptism birthday debut corporate
    colors: { primary: '#F5EFE6', ribbon: '#8B1E3F', accent: '#C9A961' },  // optional
    fonts: { heading: 'Georgia, serif' },                                   // optional
    untieHint: 'Tap to Untie',
    content: '#my-invitation',           // selector, element or HTML string
    onOpen: () => {},
  });
</script>
```

Every field is optional; anything missing or unknown falls back to a default
and says so in the console rather than throwing. `colors` takes any of
`primary`, `lining`, `secondary`, `accent`, `ribbon`, `ribbonHighlight`,
`background`, `text`; pass `colors: null` to go back to the theme's own.

`gf.open()` plays the reveal, `gf.reset()` ties it up ready to replay,
`gf.update({ … })` re-renders in place without a reload, and `gf.destroy()`
removes the package and puts a borrowed content element back where it was.
`gf.state` reads the stage. The root element also fires `gatefold:state` and
`gatefold:open`.

## The two rules this engine keeps

**It never styles your content.** A content element is *moved* into the card,
listeners and identity intact; an HTML string is written in as it stands. The
only property the engine puts on the wrapper is the transform that reveals it,
and that is removed at the handoff. No class of ours, no font, no colour, no
spacing — before or after.

**The reveal never varies.** A theme may set ten colour and font variables and
add a decorative pseudo-element to a panel face. It may not set a length, a
duration, an easing or a transform. Switching theme or colours changes how the
package looks and nothing about how it opens: tied → untying → opening →
revealed → expanded, 4.97s, every time.

## The five stages

| At | What moves |
|---|---|
| idle | the package breathes, 1 → 1.014 over 3.6s, its shadow with it |
| 0ms | the loops shrink and turn in (0–400), the knot lets go (300–600), the tails and the band fall outward (500–1400), the ribbon fades (1200–1600) |
| 1690ms | the left panel swings, the right follows 130ms later, 1400ms each; the shadow lifts off the card as they go |
| 3310ms | the card rises 16px, its shadow deepens, the accent glow comes up, eight motes drift. Held 800ms |
| 4110ms | the card opens out to the viewport over 860ms while the package fades |
| 4970ms | handoff: transforms dropped, card is a plain scrollable box, `onOpen` fires |

90ms of stillness is left between one stage finishing and the next starting.

## How the card fills the screen without a reflow

The card is `position: fixed` and inset from the first frame, so the invitation
is laid out at its final width once and never again. To sit in the holder it is
scaled down, and its content is scaled back up in Y by exactly the amount that
makes the pair a *uniform* scale — so the card shows the whole width of the
invitation in miniature and in proportion, and opening out is that miniature
growing to life size.

The two transforms have to agree in every frame, not only at the ends. Left to
interpolate separately their product bulges in the middle and the type visibly
stretches, so neither is transitioned: two registered custom properties are,
and both transforms are arithmetic on them.

One consequence worth knowing: what the card shows is the whole viewport-width
layout, shrunk. On a phone that is about 40% scale and perfectly legible; on a
wide desktop it is nearer 25%, so a desktop-width invitation reads as a
miniature until it opens out. Invitations laid out as a narrow column suit the
card best.

A browser without `@property` gets `data-gatefold-tween="snap"`: the numbers
step instead of easing, every stage still renders correctly, and the last stage
becomes a fade rather than a growth.

## Making a new theme

```css
.gatefold.harvest,
.gatefold-stage.harvest {          /* the stage too: --background is a backdrop */
  --primary-color: #c8703a;
  --lining-color: #8f4e26;
  --secondary-color: #fffaf2;
  --accent-color: #f0c987;
  --ribbon-color: #6b4226;
  --ribbon-highlight: #e8a76a;
  --background: #fbf0e0;
  --text-color: #6b4226;
  --font-heading: Georgia, serif;
  --font-body: system-ui, sans-serif;
}

/* Optional. Decoration only, and it must keep clear of two things: the hinge,
   which is the outer edge each panel turns on, and the band of the ribbon
   across the middle. */
.gatefold.harvest .gatefold__face--front::after { … }
```

Then add the name to `THEMES` in `gatefold.js` so the engine accepts it.

## Fitting it into a box

The package sizes itself from the viewport and the opened card is
`position: fixed`, because opening over the whole screen is what it is for. To
put one inside a card or a preview instead:

```css
#my-mount .gatefold-stage { min-height: 100%; }
#my-mount .gatefold       { --gf-width: 220px; }
```

The mount and everything above it must not have a `transform`, `filter` or
`perspective`: any of those would become the containing block for the fixed
card and the invitation would open inside the box rather than over the page.

## Why the package is the size it is

A gate-fold opened to 158° is 1.93 times as wide as it is closed. `--gf-width`
is capped at `47vw` so both panels stay on the screen at full swing, and at
`52vh` so the package and its hint fit above the fold. Raise the caps and the
panels will swing off the edges.
