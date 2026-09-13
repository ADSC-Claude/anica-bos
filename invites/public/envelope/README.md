# The envelope opening engine

A closed envelope, a seal, and one tap. The flap lifts, a card rises out of the
pocket, and the card opens out to fill the screen — at which point the engine
lets go and what is left is the invitation, scrolling, exactly as it was
written.

Three files, no dependencies, no build step, and nothing fetched from anywhere:

| File | What it is |
|---|---|
| `envelope.css` | The animation, the layout, the seven variants, the six seals and the six backdrops. Every theme variable is documented in the block at the top. |
| `envelope.js` | The engine. An ES module exporting `createEnvelope`. |
| `demo.html` | Every variant against every seal against every backdrop, with a switcher and a placeholder invitation inside. |

Open the demo at **`/envelope/demo.html`** (`npm run dev` from `invites/`).
It has to be served rather than opened from disk: an ES module cannot be
imported from a `file://` URL.

## Using it

```html
<link rel="stylesheet" href="/envelope/envelope.css">
<div id="app"></div>
<div hidden><div id="my-invitation">…your HTML…</div></div>

<script type="module">
  import { createEnvelope } from '/envelope/envelope.js';

  const env = createEnvelope('#app', {
    theme: 'royal',                           // wedding floral modern royal
                                              // birthday christening corporate
    background: 'gold-particles',             // plain floral watercolor
                                              // gold-particles minimal dark
    seal: { type: 'couple', text: 'J&J' },    // wax monogram couple number
                                              // cross logo
    colors: { envelope: '#5B2333', accent: '#C9A961' },   // optional
    fonts: { heading: 'Baskerville, serif' },             // optional
    openHint: 'Tap to Open',
    content: '#my-invitation',                // selector, element or HTML string
    onOpen: () => {},
  });
</script>
```

Every field is optional; anything missing or unknown falls back to a default
and says so in the console rather than throwing.

`env.open()` plays the opening, `env.reset()` closes it ready to replay,
`env.update({ … })` re-renders in place without a reload, and `env.destroy()`
removes the envelope and puts a borrowed content element back where it was.
`env.state` reads the phase. The root element also fires `envelope:state` and
`envelope:open`.

## The two rules this engine keeps

**It never styles your content.** A content element is *moved* into the slot,
listeners and identity intact; an HTML string is written in as it stands. The
only property the engine puts on the wrapper is the transform that reveals it,
and that is removed at handoff. No class of ours, no font, no colour, no
spacing — before or after.

**The animation never varies.** A theme may set nine colour and font variables
and add a decorative pseudo-element. It may not set a length, a duration, an
easing or a transform. Switching variant, seal or backdrop changes how the
envelope looks and nothing about how it moves: closed → opening → sliding →
expanded, 1.98s, every time.

## Making a new variant

```css
.envelope.harvest,
.envelope-stage.harvest {          /* the stage too: --background is a backdrop */
  --envelope-color: #c8703a;
  --envelope-accent: #f0c987;
  --envelope-lining: #fdf3e3;
  --seal-color: #6b4226;
  --seal-text-color: #fdf3e3;
  --text-color: #6b4226;
  --background: #fbf0e0;
  --font-heading: Georgia, serif;
  --font-body: system-ui, sans-serif;
}

/* Optional. Decoration only — and it must stay inside the pocket's shape. */
.envelope.harvest .envelope__pocket::after { … }
```

Then add the name to `THEMES` in `envelope.js` so the engine accepts it.

## Fitting it into a box

The envelope sizes itself from the viewport and the opened slot is
`position: fixed`, because opening over the whole screen is what it is for.
To put one inside a card or a preview instead:

```css
#my-mount .envelope-stage { min-height: 100%; }
#my-mount .envelope       { --env-width: 300px; }
```

The mount and everything above it must not have a `transform`, `filter` or
`perspective`: any of those would become the containing block for the fixed
slot and the invitation would open inside the box rather than over the page.
