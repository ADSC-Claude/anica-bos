# Interactive Moments: the library of 42, and how it is built

Part 1 is for the owner and uses her words. Parts 2 to 5 are for the engineer; every file and line named was checked against the code on the day this was written.

The brief, in her words: *launch with these 42 curated interactions rather than an oversized library; make it as realistic as possible, not so animated that it looks like it is for kids, so a formal event can use it; where an interaction belongs to more than one category, build it once and tag it under both; when one needs photos, we put the photo in and it syncs in the system and in the form for the clients; each one has Speed (Slow / Normal / Fast) and Trigger (Tap / Swipe / Hold where applicable).* And the storyline she wants a guest to feel: *tap the wax seal, the envelope opens, the invitation begins; tap the camera in Our Story and a Polaroid develops; swipe the curtains for the prenup photos; tap the church doors for the ceremony; scratch to reveal a surprise message.*

---

## 1. What she gets, in her words

### Words to know first

- **Moment.** One interaction on a page: a thing a guest taps, swipes or holds, and what it does. The instant camera, the ring box, the scratch card. A moment is placed on a page like a photo frame is, and moved and sized the same way.
- **Opening.** The moment before the invitation: the sealed envelope, the ribbon, the doors. There is one opening per invitation and it fills the screen. The openings the app already draws (The Envelope, The Seal, The Curtain, The Drape) are the first four of the seven; the ribbon, the doors, the capiz panels and the folded letter join them.
- **Category.** The six shelves the library is arranged on: Opening Experience, Tap & Reveal, Swipe & Pull, Photo Moments, Occasion Interactions, Surprise Moments. A moment can sit on two shelves: the instant camera is on Tap & Reveal and on Photo Moments, built once.
- **Trigger.** What the guest does: a tap, a swipe (in the direction the moment says), or a press-and-hold that fills a ring. Each moment says which it takes; some take only one (a scratch card is rubbed, nothing else).
- **Speed.** Slow, Normal or Fast. Slow is ceremonial, Fast is a flick. The same moment, the same motion, just its pace.
- **What it reveals.** A photograph, some words, or both, from the customer's form. The Polaroid that develops is *their* photo; the message under the scratch card is *their* words. She decides which form field it reads, as she does for a frame today, and the form asks the customer for it in the same list as everything else.
- **The still.** What a guest who cannot or will not tap sees: the moment already open, with the photo and words showing. It is what prints, what a screen reader gets, and what shows when the phone asks for less motion.

### What she does in the studio

1. On a page, presses **+ Moment**. A sheet opens with the six shelves and the 42 moments, each with a small still of it closed and a line saying what the guest does. Filter by shelf; a moment on two shelves shows on both.
2. Picks one. It lands on the page like a frame does, selected, at the size the moment wants. On a page laid out by its words it hangs off the head like any other piece.
3. In the properties on the right: **Trigger** (only the ones the moment takes), **Speed** (Slow / Normal / Fast), **Plays** (once, or every time), the moment's **photographs** (each a frame like any other: a customer's field marked *Ask the customer*, or a picture from the library), and its **words** (a text box like any other, so the fonts, size and colour are hers). A **Play it** button runs it on the canvas.
4. The page's own writings can be inside a moment: drag the ceremony heading into the church doors and it is what the doors open onto (this uses the lift from #173).
5. The checklist says when a moment is missing its photo, when a hold is on a page with nothing to hold for, when it is too small to tap on a phone, and when two moments overlap.

### What the customer gets

- The form asks for the moment's photographs and words in the same list as the frames — "Our Story — the photograph in the instant camera (a square)". Nothing new to learn.
- Their invitation plays the moment with their own photo and words. Where they left it blank, the moment either hides (the camera is not there) or shows the design's own picture, whichever she chose, exactly as a frame does today.
- Which package gets what is one table (part 4). Proposed: the seven openings are every package's, like the drawn openings today; the in-page moments come with Standard and up, three on Standard, unlimited from Signature; the Surprise shelf (code, puzzle, hold) from Signature. **This is a business call and is hers to change before it ships.**

### What a guest gets

- A moment reads as the thing it is: paper that bends with a shadow under it, wax that cracks along a line, brass hinges on doors that swing on a real pivot, a ribbon that slackens before it falls. Nothing bounces, nothing wobbles, nothing sparkles unless the moment is a flash. Slow easing for heavy things (doors, drapes), quick for light things (a flash, a sticker corner).
- A tap is a tap; a swipe follows the finger and only completes past halfway (let go before that and it settles back); a hold fills a thin ring and completes at the top. The hint under a moment says which ("Tap to open", "Swipe the curtains apart", "Press and hold").
- With Reduce Motion on, or when the page prints, or without JavaScript: the still, already open. A guest is never left tapping a thing that does not answer.

---

## 2. The library

One entry per moment in `src/lib/moments.ts`, the way `OPENINGS` lists the openings in `src/lib/openings.ts`. The entry is what the studio's sheet is drawn from, what the checklist reads, and what the guest page keys its CSS on.

```ts
export type MomentKey = 'envelope' | 'seal' | 'ribbon' | 'curtains' | 'doors' | 'capiz' | 'letter'
  | 'instant-camera' | 'ring-box' | 'light' | 'bloom' | 'candle' | 'gift' | 'frame'
  | 'pull-card' | 'scratch' | 'sticker' | 'frost' | 'scroll' | 'panels'
  | 'polaroid-stack' | 'film-strip' | 'album' | 'photo-booth' | 'projector' | 'carousel'
  | 'church-doors' | 'cake' | 'baby' | 'diploma' | 'cheers' | 'holiday-gift'
  | 'hold' | 'code' | 'puzzle' | 'flip' | 'mystery' | 'flash';

export type MomentDef = {
  key: MomentKey;
  name: string;                       // "Instant Camera"
  categories: Category[];             // every shelf it sits on
  action: string;                     // "Tap camera" — the guest's move, for the sheet and the hint
  happens: string;                    // "Flash → Polaroid slides out → photo develops"
  triggers: Trigger[];                // the ones it takes; the first is the default
  swipe?: 'up' | 'down' | 'apart' | 'left' | 'right';
  photos: { count: 0 | 1 | 2 | 3 | 6; shape: AskShape; label: string };  // "the photograph in the camera"
  words?: 'line' | 'lines' | 'names' | 'code';   // what it reveals in writing, if anything
  occasions?: Occasion[];             // the Occasion shelf only: the ring box is a wedding's
  aspect: number;                     // height over width of the box it lands in
  minTier: Tier;
  realism: string;                    // one line for the engineer: the material and the easing
};
```

The 42, deduplicated to 31 scenes. A scene on two shelves is one component with two tags; a scene that re-skins another is one component with a `variant`:

| Scene | Shelves | Trigger(s) | Photos | Words | Notes |
|---|---|---|---|---|---|
| envelope | Opening | tap | 0 | — | exists: `data-style='envelope'` |
| seal (break wax seal) | Opening | tap | 0 | — | exists: `data-style='seal'`; crack line added |
| ribbon (untie / pull ribbon) | Opening, Swipe & Pull | swipe down, tap | 0 | — | one scene, two shelves |
| curtains (open curtains / slide panels) | Opening, Swipe & Pull | swipe apart, tap | 1 | — | exists as `curtain`; in-page version is the same stage in a box |
| doors (open doors / church doors) | Opening, Occasion | tap | 0–1 | lifted heading | one scene, `variant: 'plain' | 'church'` |
| capiz | Opening | tap | 0 | — | new: eight shell panels folding out on the design's accent |
| letter (unfold letter) | Opening | tap | 0 | — | new: tri-fold, two stages, paper grain |
| instant-camera (Instant Camera / Instax) | Tap & Reveal, Photo Moments | tap | 1 | caption | one scene, two shelves |
| ring-box | Tap & Reveal, Occasion | tap | 0 | names or date | one scene, two shelves |
| light (magic light / magic flash) | Tap & Reveal, Surprise | tap | 0–1 | line | one scene, two shelves; flash is the Surprise variant |
| bloom (flower bloom) | Tap & Reveal | tap | 1 | line | petals as SVG paths, one design colour |
| candle (light a candle / birthday cake) | Tap & Reveal, Occasion | tap | 0 | line | `variant: 'candle' | 'cake'` (the cake blows out, the candle lights) |
| gift (gift box / mystery gift / holiday gift) | Tap & Reveal, Surprise, Occasion | tap | 0–1 | line | `variant: 'plain' | 'mystery' | 'holiday'`; mystery shakes first |
| frame (photo frame) | Tap & Reveal | tap | 1 | — | the frame is a `PhotoEl` with `frame: 'thin'`; the reveal is a wipe |
| pull-card (pull invitation) | Swipe & Pull | swipe up | 0 | — | follows the finger out of an envelope |
| scratch (scratch reveal / scratch to reveal) | Swipe & Pull, Surprise | rub | 0–1 | line | canvas; foil texture; clears at 60% rubbed |
| sticker (peel sticker) | Swipe & Pull | swipe | 0–1 | line | corner curl with a back-face shadow |
| frost (clear frosted glass) | Swipe & Pull | rub | 1 | — | canvas; same engine as scratch with a blur mask |
| scroll (unroll scroll / graduation scroll) | Swipe & Pull, Occasion | swipe down, tap | 0 | lines | `variant: 'paper' | 'diploma'` |
| polaroid-stack | Photo Moments | tap | 3 | captions | slides into a fan |
| film-strip | Photo Moments | swipe left/right | 6 | — | horizontal snap scroll in a sprocketed strip |
| album | Photo Moments | swipe | 6 | captions | page turn with a fold shadow |
| photo-booth | Photo Moments | tap | 3 | — | countdown, flash, strip drops |
| projector | Photo Moments | tap | 1 | — | takes a clip too (a `VideoEl` in its beam) |
| carousel | Photo Moments | swipe | 6 | captions | |
| baby (baby reveal) | Occasion | tap | 1 | line | cloud parts / gift opens |
| cheers (champagne cheers) | Occasion | tap | 0 | line | glasses meet on a real arc, one ring of light |
| hold (hold to reveal) | Surprise | hold | 0–1 | line | ring fills; releases early and it drains back |
| code (secret code) | Surprise | tap (keys) | 0–1 | line | four digits she sets; wrong shakes once |
| puzzle (puzzle reveal) | Surprise | drag | 1 | — | nine pieces of one photo; snaps within 8% |
| flip (flip card) | Surprise | tap | 1 | lines | 3D flip, back face carries the words |

Each shelf still shows its seven: a shelf lists keys, and a key on two shelves appears on both. That is the "build once, tag under multiple categories" she asked for.

---

## 3. The document

One new element kind, next to the five in `src/lib/design.ts:683`:

```ts
export type MomentEl = Base & {
  kind: 'moment';
  moment: MomentKey;
  variant?: string;                      // 'church', 'cake', 'mystery', 'diploma' …
  trigger?: Trigger;                     // blank = the moment's first
  speed?: 'slow' | 'normal' | 'fast';    // blank = normal
  plays?: 'once' | 'always';             // blank = once
  /** the moment's photographs, each a frame like any other: bound to a field, or a piece from the library */
  photos?: Array<{ bind: FieldRef | { asset: string }; crop?: PhotoEl['crop'] }>;
  /** what it reveals in writing: lines like a text box's, so a lifted writing can be one (TextEl.lifted) */
  lines?: Line[];
  /** the Secret Code's answer; the checklist says when it is blank */
  code?: string;
  h?: number;                            // height, where the moment's box is not its aspect
};
```

- `Base` already carries `x, y, w, anchor, z, opacity, hidden, ask, ifEmpty, motion, attachTo`. A moment's photographs are asked for through `asksOf` (`src/lib/asks.ts:88`) exactly as a frame's is: each photo slot with a `bind` to a field becomes one line on the form, labelled from the moment ("Our Story — the photograph in the instant camera"). The `refOf` there gains the `moment` kind, iterating `photos`.
- `flowDecor` and `flowFloats` (`src/lib/design.ts:1432`) treat a moment like a photo: it hangs off the head or foot of a flow page, or sits in a drawn page's box.
- The zod schema gains `zMoment` beside `zElement`'s other kinds; `MomentKey` is validated against the library so a stale key never reaches a guest.
- The opening set stays where openings live: `OPENING_KEYS` in `src/lib/openings.ts` gains `ribbon`, `doors`, `capiz`, `letter`; the cover gains `openingSpeed` and `openingTrigger` fields (`src/lib/sections.ts:302`, beside `opening`), staff-visible, customer-visible for the trigger where the opening takes two. The `Stage` in `src/components/invite/client.tsx:53` gains the four stages. Nothing about how an opening is chosen, gated or played changes; the studio's design can also set the opening it was drawn for (already `DesignDoc.opening` since Phase 3c).

---

## 4. How it plays

### On the guest page

One client component, `Moment` in a new `src/components/invite/moments.tsx` (client, like `LazyVideo`), drawn by `DrawnPage` and `FlowDecor` (`src/components/invite/drawn.tsx:183`) the way `Anim` and `Clip` are:

```html
<div class="inv-moment" data-moment="instant-camera" data-state="closed" data-trigger="tap" data-speed="normal" style="--moment-t: 1">
  <div class="inv-moment-scene">…the scene's own markup…</div>
  <div class="inv-moment-reveal">…photo(s) and words…</div>
  <p class="inv-moment-hint">Tap the camera</p>
</div>
```

- `data-state` runs `closed → opening → open`; every scene's motion is CSS keyed on it, with `--moment-t` as the duration multiplier (slow 1.6, normal 1, fast 0.6) so one stylesheet serves the three speeds.
- **Tap** sets `opening` and listens for `animationend` / `transitionend` on the scene's last piece, then `open`. **Swipe** follows the pointer: the scene reads `--moment-drag` (0 to 1) and the release past 0.5 completes at speed, below it settles back. **Hold** fills `--moment-drag` at the speed's rate while the pointer is down and completes at 1. **Rub** (scratch, frost) is a canvas: the pointer paints `destination-out` and the reveal fires at 60% cleared.
- `plays: 'once'` remembers in `sessionStorage` per invitation and moment id, so a guest scrolling back sees it open; `'always'` closes it again when it leaves the viewport.
- Reduce Motion, print, `data-motion` off (see `.inv[data-motion]` in `globals.css`), or no JavaScript: `data-state="open"` from the server, no hint. The still is the open state, so nothing is drawn twice.
- The first user gesture on an opening is what lets the music play (`client.tsx:17`); in-page moments do not touch audio.

### Realism, as rules the CSS follows

- Materials: paper (`--inv-surface` with a 2% grain via a tiny repeating SVG, a 1px darker edge, a soft drop shadow that lengthens as it lifts); wax (a radial highlight, a crack drawn as an SVG path whose `stroke-dashoffset` runs, then the two halves rotate 6° apart); brass and wood (the design's `accent`/`accent2`, never a literal colour); glass (a backdrop blur that the rub clears); linen and velvet (a vertical gradient with a 3% noise).
- Easing: heavy things `cubic-bezier(.2,.7,.2,1)` over 900ms+ at Normal; light things `cubic-bezier(.3,0,.1,1)` over 400ms; nothing overshoots except a ribbon end (one 4% settle) and the mystery box's shake (three 2° turns, then still).
- Light: one light source, top-left; shadows go down-right; a flash is a white `radial-gradient` that opens to 140% and fades in 500ms, never a sparkle sprite.
- Motion is in transforms and opacity only (compositor), never layout; scenes are `contain: paint`.

### In the studio

- **+ Moment** beside **+ Frame** (`studio.tsx:795 addElement`) opens a sheet (`MomentSheet`) drawn from `MOMENTS` by shelf; picking one calls `addElement('moment', key)`, which lands it at the moment's `aspect` and default width, selected.
- `Properties` (`studio.tsx:2798`) gains `MomentBlock`: Trigger (radio, only the moment's), Speed, Plays, a **Play it** button (sets `data-state='closed'` then taps it, the way `onReplay` re-runs motion), the photo slots (each a `PhotoBind` picker as `AskBlock` already offers for a frame: a field of the customer's with *Ask the customer*, or a piece from the library, with the same crop tool), the words (a `TextBlock`), and for the Secret Code its four digits.
- The canvas draws the moment's still (open) with a small closed thumbnail in the corner, so she places the open size; **Play it** runs it in place.
- The pieces list names it ("an instant camera, over the words"); the lift from #173 can drop a writing into `lines`.

### The checklist (`src/lib/needs.ts`)

- `moment-photo` (blocks): a photo slot bound to nothing and not marked *leave*.
- `moment-code` (blocks): a Secret Code with no code.
- `moment-small` (blocks): narrower than 28% of the column, so a thumb cannot hit it.
- `moment-hold` (says): a hold on a drawn page with no words or photo to reveal.
- `moment-many` (says): more than three moments on one page.

### Packages (`src/lib/tiers.ts`)

Proposed, hers to change: `'moments.openings': 'BASIC'`, `'moments.page': 'STANDARD'` (three per invitation), `'moments.unlimited': 'COMPLETE'`, `'moments.surprise': 'COMPLETE'`. The guest page draws a moment above the package as its still, open, so nobody is sold a thing the guest never sees; the builder's lock badge says which package it comes with.

---

## 5. Phases

Each phase is its own branch and draft PR, merged on her word, in this order. Every phase ships working moments a guest can use, not scaffolding.

### Phase A — the frame, the studio, the form, and the seven openings (this PR)
`moments.ts` with all 31 scenes registered (so the sheet shows the whole library, with the ones not yet built marked *coming*); `MomentEl`, schema, `asksOf`, `flowDecor`; the `Moment` runtime with tap, swipe, hold and rub; the studio sheet and `MomentBlock`; checklist rules; the four new openings (ribbon, doors, capiz, letter) as full-screen stages plus Speed/Trigger on the cover; the envelope and seal reworked to the realism rules (crack line, paper shadow). Tests for the library, the schema, the asks and the checklist.

### Phase B — Tap & Reveal and the Surprise shelf (14 entries, 10 scenes)
instant-camera, ring-box, light/flash, bloom, candle/cake, gift/mystery/holiday, frame; hold, code, puzzle, flip, scratch (canvas engine). The storyline's Our Story camera and the scratch message.

### Phase C — Swipe & Pull (7 entries, 5 new scenes)
pull-card, sticker, frost (the scratch engine with a blur mask), scroll/diploma, in-page curtains/panels and ribbon. The storyline's prenup curtains.

### Phase D — Photo Moments (7 entries, 5 new scenes)
polaroid-stack, film-strip, album, photo-booth, projector (with a clip), carousel. Six-photo slots on the form.

### Phase E — the feel, and the storyline on the demo
Her verdict on phases A to D was that the moments looked stiff and that the polaroid did not look like a polaroid, and she was right: every scene was flat colour with one deceleration curve. Phase E is the pass that makes them real things, and it puts her storyline on Capiz.

**Materials, declared once.** `.inv-moment` and `.inv-open` carry a small set of custom properties every scene draws with: a fine warm grain (`--mo-grain`, a tiny SVG turbulence at a quarter strength; `--mo-grain-soft` for plastic and velvet), a stretched noise for wood and brushed metal (`--mo-fibre`), one warm shadow colour (`--mo-dark`) and three shadows from it (contact, ambient, lifted), the design's paper (`--mo-paper`). One light, top left, always.

**Motion, declared once.** Four curves: `--mo-heavy` (a door, a lid, a curtain), `--mo-light` (a flame, a crack), `--mo-settle` (heavy, with the one small overshoot of a thing meeting its stop) and `--mo-spring` (a card slid across a table, settling in two); a real `linear()` spring where the browser has it, an ease-out-back where it has not. Three shared keyframes on the independent `scale` and `rotate` properties, so they compose with each piece's `transform`: a lift before a travel, a press under a finger, a sway as a hung thing comes to rest. Nothing bounces more than that.

**The print.** Eighty-eight by a hundred and seven, the picture square and a hair recessed in warm paper with a deep chin, a hairline where it meets the frame, a vignette, one sheen; before it develops it is the blue-black of fresh chemistry and the picture comes up through it as the contrast rises; the caption is written on the chin in the design's script, in ink, a little askew. The stack is three prints none quite square to the next, lifting and fanning on the spring, the top one first, with the words on its chin (`holds.words`). The camera is a matte body with a stepped black faceplate, a lens in three rings holding the room's light, a fresnel flash window, a viewfinder, a metal shutter button and the slot the print rises out of with one small wobble.

**The storyline scenes.** The wax is pressed, never round, with the stamp's ring and the monogram pressed into it and a run of wax that escaped; the tap gives it a hair, the crack runs and fades with the halves, then the flap and then the card. The envelope's back is lined in the accent. The curtains are velvet with soft folds and a nap under a scalloped pelmet, and gather to the sides — still there, bunched — with a settle. The church doors are planks bound with two iron straps and a ring on a boss, in a stone arch of voussoirs; they swing in on a settle, the right a beat after the left, darkening as they turn from the light while the light inside comes up. The scratch card is a ticket with a double rule, under a brushed metal foil in the accent.

**The rest of the library** is brought onto the same system: a leather album with photo corners, a pull-down screen and a projector on a table with spoked reels, a booth cabinet with a lit marquee, flutes drawn as glass over champagne with bubbles rising, a gilt moulding on the frame, a brushed-steel latch plate with screws, a ring in gold with a faceted stone and one glint, a cake in two tiers with icing that drips on a plate, nacre on the capiz panels, satin on the ribbon.

**The storyline on Capiz.** Capiz's document (`builtinDesign('capiz')`) now carries four moments: the instant camera at the head of Our Story (the story's photo and a line for the print), the church doors at the head of the invitation page (the church photo), the curtains at the head of the prenup page (the first prenup photograph), and the scratch card at the foot of the closing page (a surprise line). Each is `ask: true, ifEmpty: 'leave'`: the customer's form asks for exactly what they need, and a Capiz whose customer left them blank shows none of them. Two writings join the form as `byDesign` fields, the story's caption and the closing's surprise, staff's until a design binds them; a moment's binds now count as the design's (`bound()` in asks.ts). A page laid out by its words gains room at the head (`headPad`, the twin of `footPad`; both up to 12 now) so the words start below a moment hung off the top. The catalogue ships the document (`TemplateSeed.design`), and the sync writes it only into an empty column: a document the studio published stays hers. The demo's answers are in the seed; on production they are one update on the demo invitation's content and one on Capiz's design column, both reversible.

---

## 6. Open questions for her

1. The package table in part 4 — is that how she wants to sell it?
2. The Secret Code: does she want the code on the form (the customer sets it) or in the studio (the design sets it)? The plan puts it on the customer's form, since the surprise is theirs.
3. Photo Booth and Puzzle need three and one photograph respectively; where a design already asks for a gallery, should they draw from it rather than ask again? The plan asks again, one list, no surprises.
