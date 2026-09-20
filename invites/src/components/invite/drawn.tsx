import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { t, type Lang } from '@/lib/copy';
import type { Occasion } from '@prisma/client';
import { lookLine, lookTitle, type Look, type LineKey, type TitleKey } from '@/lib/looks';
import { imageUrl, IMAGE } from '@/lib/images';
import { mapsHref, wazeHref } from '@/lib/places';
import {
  elementStyle, photoStyle, cropStyle, shapeStyle, lineText, valueAt, pageRatio, floatShape, floatAt, BLOCK_CLASS, LINE_CLASS, LINE_TAG,
  decorStyle, decorOver, flowFloats, flowDecor, motionOf, isPicture, canOpen, shows,
  type PageSpec, type Element, type PhotoEl, type TextEl, type ShapeEl, type VideoEl, type AnimEl, type Line, type WordKey, type FieldRef, type MomentEl
} from '@/lib/design';
import { LazyVideo, LazyLottie } from './client';
import { Moment } from './moments';
import { MOMENT_BY_KEY, momentHint, triggerOf, type MomentKey, aspectOf } from '@/lib/moments';
import { cropBeside } from '@/lib/photo-crop';

/**
 * A page drawn from the design's document.
 *
 * The two Baby Blue pages have always been two hand-written components with
 * their numbers in a constants file (StoryMilestones and BabyPhotos in
 * renderer.tsx). This is the same markup with the numbers read from the
 * document instead, so a design the owner draws in the studio renders through
 * the same CSS: `.inv-bb-slot` for a frame, `.inv-bb-head` for a heading,
 * `.inv-bb-label` for a milestone's two lines, `.inv-bb-caption` for the word
 * on a polaroid's strip.
 *
 * The originals are not switched over to it. They keep their components and
 * their constants; this draws designs whose `design` column carries a
 * document, which is only ever a copy made in the studio. That is what makes
 * a copy safe to make: nothing a guest already holds a link to can move.
 *
 * The file imports nothing that is server-only, so the studio's live preview
 * can mount it in the browser (tests/client/ proves it, without the
 * react-server condition that would hide a mistake).
 */
/**
 * `edit` is the studio's view of the same page: every element keeps a
 * `data-el` so the canvas can measure the box a guest will actually see, and
 * one that would draw nothing is drawn anyway, as an empty box labelled with
 * what fills it. A guest never passes it, so a guest never sees either.
 */
export type EditView = {
  label: (el: Element) => string;
  /**
   * The frame she is fitting a picture into. Its whole picture is drawn once
   * more, faintly, behind the frame and spilling out of it, so she can see
   * what she is panning past. It is the same element's own placement, so it
   * lands on the frame exactly — turn and all — without a second set of
   * geometry to keep in step.
   */
  cropping?: string;
  /** the clip she has picked, which plays on the canvas so she can see what it looks like where it is; the rest stay their posters */
  playing?: string;
};

/**
 * What an element's words and pictures are read from: the look, the answers,
 * the copy.
 *
 * The occasion goes to the look because a look's words are written for a
 * wedding and only some of them can be lent to another occasion — a box
 * holding `{word: 'invitation'}` on a christening must not read "Join us as
 * we say I do!". Without one, a look answers as written.
 */
function reader(content: Record<string, unknown>, look: Look | undefined, lang: Lang, occasion?: Occasion, edit?: EditView, parts?: Record<string, string>, onArt?: boolean, path?: string, held?: Set<string>, song?: boolean, rides?: Map<string, number>): Read {
  return {
    content,
    lang,
    edit,
    path,
    held,
    rides,
    hasSong: song,
    parts,
    onArt,
    word: (key: WordKey) => (key.startsWith('title:') ? lookTitle(look, lang, key.slice(6) as TitleKey, occasion) : lookLine(look, lang, key as LineKey, occasion)) ?? '',
    copy: (key: string) => t(lang, key as Parameters<typeof t>[1]),
  };
}

/**
 * How far each rider on this page has to travel.
 *
 * A `slide` frame moves its picture by its own height, which is what keeps
 * it out of sight at every page size. Two frames released by the same tap
 * are two heights, so the same rule sends them at two speeds — the instax
 * print came out of the camera over 26.9cqw and the photograph inside it
 * over 19.0cqw, and the picture visibly lagged the frame it lives in. This
 * reads the leader's height off the document, once per page, so the rider
 * can be told to cover exactly that.
 *
 * Only a frame with a width and a shape has a height to lend; anything
 * else is left to the plain rule, which is what it had before.
 */
export function ridesOf(page: PageSpec): Map<string, number> | undefined {
  const out = new Map<string, number>();
  const wants = new Set((page.elements ?? []).map((el) => el.tapAs).filter(Boolean) as string[]);
  if (!wants.size) return undefined;
  for (const el of page.elements ?? []) {
    if (!wants.has(el.id) || el.kind !== 'photo') continue;
    const h = (el.w ?? 0) * (el.aspect ?? 0);
    if (h > 0) out.set(el.id, Number(h.toFixed(3)));
  }
  return out.size ? out : undefined;
}

export function DrawnPage({ page, content, look, lang, occasion, edit, parts, path, song }: { page: PageSpec; content: Record<string, unknown>; look?: Look; lang: Lang; occasion?: Occasion; edit?: EditView; parts?: Record<string, string>; path?: string; song?: boolean }) {
  // a page whose own background is a picture: a moment on it stands on the page, not on a studio card
  const held = new Set((page.elements ?? []).map((el) => el.taps).filter(Boolean) as string[]);
  const read = reader(content, look, lang, occasion, edit, parts, Boolean(page.ground && isPicture(page.ground)), path, held, song, ridesOf(page));
  // A page that grows places by its width rather than by its height: see
  // elementStyle. The ratio is what turns one into the other.
  const grow = page.grow ? pageRatio(page) : undefined;
  return (
    <section id={page.key} className={`inv-section inv-bb-art inv-bb-${page.key}`}>
      {(page.elements ?? [])
        // a control for a song this invitation has not got is a dead button
        .filter((el) => read.edit || (shows(el, content) && (!el.song || read.hasSong)))
        .map((el) => <Fragment key={el.id}>{draw(el, read, grow)}</Fragment>)}
    </section>
  );
}

type Read = Parameters<typeof lineText>[1] & {
  content: Record<string, unknown>;
  edit?: EditView;
  /** the design's own photographed parts for its moments, by PartKey */
  parts?: Record<string, string>;
  /**
   * Whether the page under these elements already carries a picture of its
   * own. A moment stands on the studio ground it was photographed on where
   * the page gives it nothing; on a page that is already a photograph the
   * ground would be a card laid over the design's art, so it stands on the
   * page itself instead — the cut-out object and its shadow are the scene.
   */
  onArt?: boolean;
  /**
   * For each name a `tapAs` rider answers to, how tall the element it rides
   * is, in the page's own width. See `tapAttrs`: it is what lets two frames
   * released by one tap travel the same distance.
   */
  rides?: Map<string, number>;
  /** the invitation's own path, so an ADD TO CALENDAR button can point at its .ics */
  path?: string;
  /**
   * The elements on this page that some other element's `taps` names.
   *
   * They hold: their arrival does not play when they scroll into view, it
   * plays when the guest taps the thing that names them. Collected once per
   * page rather than asked per element, because an element cannot see its
   * siblings and this is a fact about the page.
   */
  held?: Set<string>;
  /** whether this invitation actually has a song to play, for a `song` control */
  hasSong?: boolean;
};

/**
 * The pictures a flow page's words flow around.
 *
 * A flow page is laid out by its words — its height is whatever they come
 * to — so it has never placed anything. These are the third kind of thing:
 * not placed and not stacked, but floated, so the section's *real* words
 * make room beside them. They are emitted before the sections, which is
 * what a float needs in order to have anything to flow past.
 *
 * A tilted frame floats a box big enough to hold it turned, with a
 * `shape-outside` polygon tracing its real corners, so the words follow the
 * tilt rather than a rectangle. `floatShape` works that out; see its note
 * for why `float` and `transform` need the help.
 *
 * An empty binding draws nothing at all, the way an empty frame does: a
 * customer who gave no picture gets their words, in one column, and no gap
 * where a photograph was going to be.
 */
export function FlowFloats({ page, content, lang }: { page: PageSpec; content: Record<string, unknown>; lang: Lang }) {
  const floats = flowFloats(page);
  if (!floats.length) return null;
  return (
    <>
      {floats.map((el) => {
        const url = 'asset' in el.bind ? el.bind.asset : valueAt(content, el.bind);
        if (!url) return null;
        const shape = floatShape(el.aspect ?? 1, el.rotate ?? 0);
        const alt = el.alt ? valueAt(content, el.alt) : '';
        // the whole width of what floats, and from it the place she dropped it
        const box = (el.w ?? 40) * shape.width;
        const at = floatAt(el, box);
        return (
          <figure
            key={el.id}
            className="inv-bb-float"
            data-el={el.id}
            data-float={at.side}
            data-frame={el.frame && el.frame !== 'none' ? el.frame : undefined}
            data-mask={el.mask && el.mask !== 'none' ? el.mask : undefined}
            style={{
              width: `${box}%`,
              aspectRatio: `${shape.width} / ${shape.height}`,
              shapeOutside: shape.polygon,
              ['--float-inner' as string]: `${shape.inner}%`,
              ['--float-turn' as string]: `${el.rotate ?? 0}deg`,
              // the place, as margins: in from its own side, down from where
              // the words start. Per-cent, so both are shares of the column
              // the words are in — which is what a float's place is measured
              // in, because the column is what it stands in (`floatAt`).
              ['--float-x' as string]: `${at.inset}%`,
              ['--float-y' as string]: `${at.down}%`,
            } as CSSProperties}
          >
            <img src={el.animated ? url : imageUrl(url, IMAGE.grid)} alt={alt} loading="lazy" lang={lang === 'tl' ? 'tl' : undefined} />
          </figure>
        );
      })}
    </>
  );
}

/**
 * The decorations on a page laid out by its words: a piece from the library
 * along its head, a rule above its first heading, a flourish at its foot.
 *
 * One band, `inset: 0` over the whole page, holding everything the page
 * carries that is neither a float nor a section's words. The band is the
 * answer to three problems at once:
 *
 * - A flow page's height is its customer's words, so nothing on it can be
 *   placed by a share of that height. The band is the page's *width*, and a
 *   decoration hangs from the head or the foot by a gap measured in `cqw`
 *   against it (`decorStyle`).
 * - A flow page is not a query container, so a shape's height and a frame's
 *   card — every one of them in `cqw` — would otherwise be measured against
 *   the viewport and be wrong on a laptop. The band is the container.
 * - `.inv-page` is a flex column, and anything absolutely placed inside it
 *   is out of flow but still measured against the page; the band takes the
 *   whole page so the same percentages mean what they mean on a drawn page.
 *
 * It carries `inv-bb-art` as well as its own class, which is not a trick: it
 * *is* an art layer over a page, so every rule a drawn page's frames, cards,
 * cuts and clips already have applies to these unchanged. Two bands are
 * drawn, one before the words and one after (`decorOver`), because a
 * decoration behind the words and a decoration over them cannot be the same
 * layer — and behind is the default, since words a guest cannot read are the
 * one thing a design must not be able to do by accident.
 */
export function FlowDecor({ page, content, look, lang, occasion, layer, edit }: {
  page: PageSpec; content: Record<string, unknown>; look?: Look; lang: Lang; occasion?: Occasion; layer: 'under' | 'over'; edit?: EditView;
}) {
  const decor = flowDecor(page).filter((el) => decorOver(el) === (layer === 'over'));
  if (!decor.length) return null;
  const read = reader(content, look, lang, occasion, edit, undefined, Boolean(page.ground && isPicture(page.ground)));
  return (
    <div className="inv-bb-art inv-deco" data-layer={layer}>
      {decor.map((el) => <Fragment key={el.id}>{draw(el, read, undefined, true)}</Fragment>)}
    </div>
  );
}

/**
 * What an object that opens a booklet carries, spread onto the element the
 * kind drew.
 *
 * On the drawn element and not on a box around it, so the tap target is the
 * artwork itself: a shut door is the door, not a rectangle laid over one.
 * Wrapping would also break the placing, since it is the drawn element that
 * carries `elementStyle` — and cloning the kind's own JSX does not work
 * either, because that sets a prop on a component rather than an attribute
 * on a node, which is a quiet way to get nothing at all.
 *
 * `aria-hidden` has to come *off*, and that is the part worth stating. A
 * shape is decoration by default, and decoration is hidden from a screen
 * reader — so a door drawn as a rectangle would be a door nobody using one
 * could find. Spread this after `aria-hidden` and it undoes it.
 *
 * Only the name goes here. The role, the tab stop, the label, the tap and
 * the way back all belong to `Hub`, so an invitation whose script never
 * runs carries an inert decoration and reads its booklets in the column,
 * rather than an object that looks tappable and is not.
 *
 * Which kinds honour `opens` at all is `canOpen`'s answer and not this
 * function's, because the checklist has to give the same answer: a booklet
 * counts as reachable only through an object that really opens it.
 */
function opensAttrs(el: Element): Record<string, string | undefined> | undefined {
  if (!canOpen(el)) return undefined;
  return { 'data-opens': el.opens, 'aria-hidden': undefined };
}

/**
 * The pair that makes one thing start another: `data-taps` on the thing a
 * guest aims at, `data-tap-id` on the thing that moves, and `data-hold` to
 * keep the second one from arriving on its own when the page scrolls past.
 *
 * The tapped element is given a button's manners — a role, a tab stop — so
 * a guest on a keyboard or a screen reader reaches it the same way.
 */
function tapAttrs(el: Element, read: Read): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {};
  if (el.taps) { out['data-taps'] = el.taps; out.role = 'button'; out.tabIndex = 0; }
  // the name it answers to, which is its id unless it shares another's (tapAs)
  const name = el.tapAs ?? el.id;
  if (read.held?.has(name)) { out['data-tap-id'] = name; out['data-hold'] = ''; }
  /*
   * A rider travels its leader's distance, not its own.
   *
   * `slide` moves a frame's picture by 100% — the frame's own height —
   * because that is what keeps it out of sight at every size. Two frames
   * released by one tap are two different heights, so 100% is two different
   * distances over the same 1250ms: the print came out of the camera at
   * 26.9cqw and the photograph in it at 19.0cqw, and they arrived out of
   * step. "it is still delayed, the photo and polaroid dont pulled out the
   * same time." Given the leader's height the rider covers the same ground,
   * so the picture stays registered in the window the whole way out.
   */
  if (el.tapAs && read.rides?.has(el.tapAs)) out['data-ride'] = '';
  // the song's own control, wherever the design drew it: the Shell listens
  // for this across the whole invitation, because the player lives there
  if (el.song) { out['data-music'] = ''; out.role = 'button'; out.tabIndex = 0; }
  return out;
}

/** How far a rider travels, in the page's own width, for the rule above. */
function rideVars(el: Element, read: Read): Record<string, string> {
  const ride = el.tapAs ? read.rides?.get(el.tapAs) : undefined;
  return ride ? { '--inv-ride': `${ride}cqw` } : {};
}

/**
 * Where a tap on this element takes the guest, where it takes them off the
 * page: their calendar, Google Maps, Waze.
 *
 * Nothing to point at gives nothing back, and `Leaves` then draws the
 * element plainly rather than as a link — which is the same rule an empty
 * box of words follows, and it is the one that stops a christening with no
 * reception address carrying a dead OPEN IN WAZE.
 */
function goHref(el: Element, read: Read): string {
  const go = el.go;
  if (!go) return '';
  // the chooser page, not the file: an in-app browser will not take a
  // download, and that is where nearly every guest opens the invitation
  if (go.to === 'calendar') return read.path ? `${read.path}/calendar` : '';
  const place = read.content[go.of ?? 'ceremony'] as Parameters<typeof mapsHref>[0];
  return go.to === 'maps' ? mapsHref(place) : wazeHref(place);
}

/**
 * The element *is* the link, rather than sitting inside one.
 *
 * A wrapper was the obvious shape and it is the wrong one: every rule that
 * places a drawn element is written `.inv-bb-art > .inv-bb-text`, a direct
 * child, so an anchor in between takes the placement away and the button
 * lands at the top left of the page. So the tag changes instead — the same
 * class, the same box, the same one child of the section — and the whole
 * element is what a guest taps.
 *
 * Nothing to point at gives nothing back, and the element is then drawn as
 * itself: the same rule an empty box of words follows, and the one that
 * stops a christening with no reception address carrying a dead OPEN IN
 * WAZE.
 */
function goProps(el: Element, read: Read): { tag: 'a'; props: Record<string, string> } | { tag: undefined; props: Record<string, never> } {
  const href = goHref(el, read);
  if (!href) return { tag: undefined, props: {} };
  // the calendar is a page of ours and opens in place, so the guest's Back
  // is the invitation; a map is somebody else's and opens beside it. The
  // `download` that used to be here is gone with the file it pointed at.
  const away = el.go!.to !== 'calendar';
  return {
    tag: 'a',
    props: { href, 'data-go': el.go!.to, ...(away ? { target: '_blank', rel: 'noopener' } : {}) },
  };
}

function draw(el: Element, read: Read, grow?: number, deco?: boolean) {
  if (el.kind === 'photo') return <Frame el={el} read={read} grow={grow} deco={deco} />;
  // on a flow page a box of words hangs off the head or the foot like any other decoration: see flowDecor
  if (el.kind === 'text') return <Block el={el} read={read} grow={grow} deco={deco} />;
  if (el.kind === 'shape') return <Shape el={el} read={read} grow={grow} deco={deco} />;
  if (el.kind === 'video') return <Clip el={el} read={read} grow={grow} deco={deco} />;
  if (el.kind === 'anim') return <Anim el={el} read={read} grow={grow} deco={deco} />;
  if (el.kind === 'moment') return <MomentBox el={el} read={read} grow={grow} deco={deco} />;
  return null;
}

/**
 * An interactive moment in its box, resolved for this invitation: the
 * photographs it carries (the customer's, or the design's own), and the
 * words it reveals, read the way a text box's lines are. The scene and the
 * gesture are the client's (Moment); this is the part that knows the form.
 */
function MomentBox({ el, read, grow, deco }: { el: MomentEl; read: Read; grow?: number; deco?: boolean }) {
  const def = MOMENT_BY_KEY[el.moment];
  const photos = (el.photos ?? []).map((p) => ('asset' in p.bind ? p.bind.asset : valueAt(read.content, p.bind))).filter(Boolean);
  const texts = (el.lines ?? []).map((l) => lineText(l.sources, read));
  const hasWords = texts.some(Boolean);
  const wants = def?.photos.count ?? 0;
  // nothing to show and nothing asked: the moment is not there for this invitation
  if (!read.edit && el.hidden !== 'never' && wants > 0 && !photos.length && !hasWords) return null;
  const style = {
    ...(deco ? decorStyle(el) : elementStyle(el, grow)),
    ['--moment-aspect' as string]: String(el.aspect ?? aspectOf(el.moment, el.variant)),
    ...motionOf(el).vars,
  } as CSSProperties;
  const trigger = triggerOf(el.moment, el.trigger);
  // the words it reveals, read the way a text box's lines are; in the studio an empty moment says what fills it
  const words = hasWords
    ? <>{el.lines?.map((line, i) => (texts[i] ? <LineText key={i} line={line} text={texts[i]} /> : null))}</>
    : read.edit && !photos.length ? <p className="inv-bb-ask">{read.edit.label(el)}</p> : undefined;
  return (
    <Moment
      id={el.id}
      scene={el.moment}
      variant={el.variant}
      trigger={trigger}
      speed={el.speed}
      plays={el.plays}
      hint={momentHint(el.moment, trigger, read.lang)}
      edit={Boolean(read.edit)}
      photos={photos.map((u) => imageUrl(u, IMAGE.grid))}
      words={words}
      code={el.code}
      parts={read.parts}
      ground={!read.onArt}
      style={style}
      attrs={{
        ...(motionOf(el).attrs as Record<string, string | undefined>),
        ...(read.edit ? { 'data-el': el.id, 'data-empty': !photos.length && !hasWords ? '' : undefined } : {}),
        ...(grow && el.from === 'bottom' ? { 'data-foot': '' } : {}),
      }}
    />
  );
}

/**
 * A vector animation in its box.
 *
 * It is drawn exactly where a photograph or a clip would be — the same
 * geometry, the same layer — and the difference is all inside `LazyLottie`:
 * the player is fetched only when the thing is on screen, and the poster
 * stands in until it is, and for ever for a guest who asked for less motion
 * or is sparing their data.
 *
 * It plays in the studio too, unlike a clip. A canvas with four clips
 * running under the handles is unusable and a clip is not what she is
 * placing; a Lottie is small, silent and short, and watching it is the only
 * way to know whether it sits right on the page.
 */
function Anim({ el, read, grow, deco }: { el: AnimEl; read: Read; grow?: number; deco?: boolean }) {
  const placed = deco ? decorStyle(el) : elementStyle(el, grow);
  const box = { ...placed, aspectRatio: `1 / ${el.aspect}` } as CSSProperties;
  const poster = el.poster ? imageUrl(el.poster, IMAGE.grid) : undefined;
  if (!el.url && !read.edit) return null;
  if (!el.url) {
    return (
      <div className="inv-bb-anim" style={box} data-el={el.id} data-empty="">
        <span className="inv-bb-ask">{read.edit!.label(el)}</span>
      </div>
    );
  }
  return (
    <LazyLottie
      src={el.url}
      poster={poster}
      loop={el.loop !== false}
      speed={el.speed ?? 1}
      className="inv-bb-anim"
      style={box}
    />
  );
}

/**
 * A clip on a page, in its element's box like any other.
 *
 * The poster is what everything falls back to, so it is treated as the real
 * picture: it goes through `imageUrl` the way a photograph does, it is what
 * prints, and it is what a guest sparing their data or asking for less
 * motion sees instead. That is why the checklist reads legibility against
 * the poster rather than against a frame nobody may ever be shown.
 *
 * In the studio the clip is not played — a canvas with four clips running
 * under the handles is unusable, and she is placing a box, not watching a
 * film. The poster stands in, and the whole invitation tab beside it is
 * where the clip actually plays.
 */
function Clip({ el, read, grow, deco }: { el: VideoEl; read: Read; grow?: number; deco?: boolean }) {
  const poster = el.poster ? imageUrl(el.poster, IMAGE.grid) : undefined;
  /*
   * A background clip is *sized* by the stylesheet and not by the document.
   * A page that grows is as tall as its words, so the height to fill is not
   * known until the browser has laid it out — and an inline left, top, width
   * or aspect here would win over the rule that knows, since an inline style
   * beats a stylesheet. So those four are dropped, and only the two that are
   * still the design's to say are kept: how far down the stack it sits, and
   * how solid it is.
   */
  const placed = deco ? decorStyle(el) : elementStyle(el, grow);
  const motion = motionOf(el);
  const box = el.bg
    ? ({ opacity: placed.opacity, zIndex: placed.zIndex, ...motion.vars } as CSSProperties)
    : ({ ...placed, aspectRatio: el.aspect ? `1 / ${el.aspect}` : undefined, ...motion.vars, ...rideVars(el, read) } as CSSProperties);
  if (!el.url && !read.edit) return null;
  return (
    <div
      className="inv-bb-clip"
      style={box}
      {...motion.attrs}
      data-bg={el.bg ? '' : undefined}
      data-el={read.edit ? el.id : undefined}
      data-foot={grow && el.from === 'bottom' ? '' : undefined}
      data-empty={read.edit && !el.url ? '' : undefined}
      {...opensAttrs(el)}
      {...tapAttrs(el, read)}
    >
      {read.edit && el.url && read.edit.playing === el.id
        // the one she has picked plays, muted and looping, so she can see what it looks like where it is
        ? <video src={el.url} poster={poster} muted autoPlay loop playsInline />
        : read.edit || !el.url
          ? poster
            ? <img src={poster} alt="" />
            : <span className="inv-bb-ask">{read.edit!.label(el)}</span>
          : <LazyVideo src={el.url} webm={el.webm} poster={poster} loop={el.loop !== false} />}
    </div>
  );
}

/**
 * A card behind some words, a rule across the page, a dot. A div and
 * nothing else: no SVG, no script, nothing for a guest to download.
 */
function Shape({ el, read, grow, deco }: { el: ShapeEl; read: Read; grow?: number; deco?: boolean }) {
  return (
    <div
      className="inv-bb-shape"
      aria-hidden={el.taps ? undefined : true}
      {...opensAttrs(el)}
      {...tapAttrs(el, read)}
      data-shape={el.shape}
      style={{ ...(deco ? decorStyle(el) : elementStyle(el, grow)), ...shapeStyle(el), ...motionOf(el).vars, ...rideVars(el, read) } as CSSProperties}
      {...motionOf(el).attrs}
      data-el={read.edit ? el.id : undefined}
      data-foot={grow && el.from === 'bottom' ? '' : undefined}
    />
  );
}

/** A photograph in its frame. An empty binding draws nothing, as today. */
/**
 * The window a picture sits in, where the frame is not the picture.
 *
 * Her instax came out of Canva as one file — white border and picture area
 * together — so the element that holds the photograph is the *print*, and
 * the photograph goes in the window inside it (`inset`). The wrapper is
 * what carries the window's rectangle, so the picture fills it and the
 * print's box does the clipping.
 *
 * That last part is the whole reason it exists. Clipped by its own small
 * box, the photograph was out of sight for the first 30% of the slide out
 * of the camera while the print around it was already showing; clipped by
 * the print's box, the two are revealed by one edge, which is what they
 * are — one object.
 */
function wrap(el: PhotoEl, img: ReactNode): ReactNode {
  const w = el.inset;
  if (!w) return img;
  return (
    <span className="inv-bb-win" style={{ left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${w.w * 100}%`, height: `${w.h * 100}%` }}>
      {img}
    </span>
  );
}

function Frame({ el, read, grow, deco }: { el: PhotoEl; read: Read; grow?: number; deco?: boolean }) {
  const url = 'asset' in el.bind ? el.bind.asset : valueAt(read.content, el.bind);
  if (!url && el.hidden !== 'never' && !read.edit) return null;
  const alt = el.alt ? valueAt(read.content, el.alt) : '';
  /*
   * Whose window this frame shows.
   *
   * The design's own, where the designer cropped a piece of her artwork —
   * that is a decision about the drawing and the family cannot move it. The
   * family's own everywhere else, because the frame is holding *their*
   * photograph and only they know where the face is. Neither, and the frame
   * shows the middle of the file the way it always has.
   */
  const crop = el.crop ?? ('asset' in el.bind ? undefined : cropBeside(read.content, el.bind));
  // a shape other than square, a cut, a card and a window on the source: each
  // one says nothing at all when it is not set, which is why the two designs
  // that carry none of them serve the markup they always served
  const figure = (
    <figure
      className="inv-bb-slot"
      style={{ ...(deco ? decorStyle(el) : elementStyle(el, grow)), ...photoStyle(el), ...motionOf(el).vars, ...rideVars(el, read) } as CSSProperties}
      {...motionOf(el).attrs}
      data-el={read.edit ? el.id : undefined}
      data-foot={grow && el.from === 'bottom' ? '' : undefined}
      data-empty={read.edit && !url ? '' : undefined}
      data-own={'asset' in el.bind ? '' : undefined}
      data-crop={crop ? '' : undefined}
      data-win={el.inset ? '' : undefined}
      data-frame={el.frame && el.frame !== 'none' ? el.frame : undefined}
      data-mask={el.mask && el.mask !== 'none' ? el.mask : undefined}
      {...opensAttrs(el)}
      {...tapAttrs(el, read)}
    >
      {url
        // a moving picture is never re-encoded: the transform endpoint would take its first frame
        ? wrap(el, <img
            src={el.animated ? url : imageUrl(url, IMAGE.grid)}
            alt={alt}
            /*
             * A picture that waits for a tap is fetched before the tap.
             *
             * A held element is hidden outright until the thing that names
             * it is pressed, and a lazy picture inside one is not fetched
             * while it is hidden — so the photograph in the instax began
             * downloading at the moment the print came out of the camera
             * and landed in the frame a beat later: "its delayed, so it
             * looks awkward that the photo is pulled out delayed." It is
             * one picture and the gesture is the whole point of the page,
             * so it is loaded with the page and waits, decoded, for its cue.
             */
            loading={read.held?.has(el.tapAs ?? el.id) ? 'eager' : 'lazy'}
            fetchPriority={read.held?.has(el.tapAs ?? el.id) ? 'high' : undefined}
            style={crop ? cropStyle(crop) as CSSProperties : undefined}
          />)
        : <figcaption className="inv-bb-ask">{read.edit!.label(el)}</figcaption>}
    </figure>
  );
  if (!url || read.edit?.cropping !== el.id) return figure;
  return (
    <>
      <div className="inv-bb-ghost" aria-hidden style={{ ...elementStyle(el, grow), ...photoStyle(el) } as CSSProperties}>
        <img src={el.animated ? url : imageUrl(url, IMAGE.grid)} alt="" style={(crop ? cropStyle(crop) : { width: '100%', height: '100%' }) as CSSProperties} />
      </div>
      {figure}
    </>
  );
}

/**
 * One or more lines stacked in flow inside one box: the heading with its
 * line under it, or a milestone's name with its sentence. An empty line is
 * dropped; a block whose every line is empty draws nothing.
 */
/**
 * The mark on a button, drawn from where it goes: a pin for either map, a
 * calendar for the date. Drawn here rather than taken from the renderer's
 * set because a drawn page is mounted in the browser by the studio and
 * nothing server-only may be on the path — the same reason places.ts is
 * where it is. It scales with the label, so it stays the right size at any
 * width the design sets.
 */
function GoMark({ to }: { to: NonNullable<TextEl['go']>['to'] }) {
  const d = to === 'calendar'
    ? 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h1'
    : 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z';
  return (
    <svg className="inv-bb-btn-mark" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d={d} />
    </svg>
  );
}

function Block({ el, read, grow, deco }: { el: TextEl; read: Read; grow?: number; deco?: boolean }) {
  const texts = el.lines.map((l) => lineText(l.sources, read));
  const blank = !texts.some(Boolean);
  if (blank && el.hidden !== 'never' && !read.edit) return null;
  const style = { ...(deco ? decorStyle(el) : elementStyle(el, grow)), ...blockType(el), ...motionOf(el).vars, ...rideVars(el, read) } as CSSProperties;
  const cls = BLOCK_CLASS[el.block];
  // `data-foot` says this one is placed from the foot: what holds the bottom
  // of a page that grows follows the page down and is never what pushes it
  const mark = {
    ...motionOf(el).attrs,
    ...(read.edit ? { 'data-el': el.id, 'data-empty': blank ? '' : undefined } : {}),
    ...(grow && el.from === 'bottom' ? { 'data-foot': '' } : {}),
    // what sits behind the words on a busy picture: a halo in the surface
    // colour, or a pale card. Both are the stylesheet's, so both scale with
    // the column and both follow the palette into night.
    ...(el.backing && el.backing !== 'none' ? { 'data-backing': el.backing } : {}),
    ...opensAttrs(el),
    ...tapAttrs(el, read),
  };
  // the caption is the paragraph itself, the way the polaroid's strip is written
  if (el.block === 'caption') {
    const own = { ...style, ...(el.face ? { fontFamily: `var(--inv-${el.face})` } : {}), ...(el.size ? { fontSize: `${el.size}cqw` } : {}) };
    const goCap = goProps(el, read);
    const words = texts.find(Boolean) || (read.edit ? read.edit.label(el) : '');
    if (goCap.tag) return <a className={cls} style={own} {...mark} {...goCap.props}>{words}</a>;
    return <p className={cls} style={own} {...mark}>{words}</p>;
  }
  const body = blank && read.edit
    ? <p className="inv-bb-ask">{read.edit.label(el)}</p>
    : el.lines.map((line, i) => (texts[i] ? <LineText key={i} line={line} text={texts[i]} face={el.face} size={el.size} leading={el.leading} highlight={el.highlight} /> : null));
  if (el.block === 'head') return <header className={cls} style={style} {...mark}>{body}</header>;
  const go = goProps(el, read);
  // a box she asked to be drawn as a button: the pill, and the mark of
  // where it goes beside the label. Only where it goes somewhere — see
  // TextEl.button — so the studio shows an unbound one as plain words.
  if (go.tag && el.button) {
    return (
      <a className={`${cls} inv-bb-btn`} style={style} {...mark} {...go.props}>
        <GoMark to={el.go!.to} />
        <span>{body}</span>
      </a>
    );
  }
  if (go.tag) return <a className={cls} style={style} {...mark} {...go.props}>{body}</a>;
  return <div className={cls} style={style} {...mark}>{body}</div>;
}


/**
 * One line inside a block.
 *
 * A role's own rule sets its face and its size — `.inv-title` is the display
 * face at 5.6cqw — and a rule beats an inline style on the parent, so the
 * block's face and size have to be set on the line itself or the studio's
 * setting would do nothing at all. The line's own size still wins over the
 * block's, because she set that one last and more precisely.
 */
function LineText({ line, text, face, size, leading, highlight }: { line: Line; text: string; face?: TextEl['face']; size?: number; leading?: number; highlight?: TextEl['highlight'] }) {
  const Tag = LINE_TAG[line.role];
  const cls = LINE_CLASS[line.role];
  const style: CSSProperties = {};
  // the line's own face where it has one, else the box's
  const lineFace = line.face ?? face;
  if (lineFace) style.fontFamily = `var(--inv-${lineFace})`;
  if (line.align) style.textAlign = line.align;
  if (line.size ?? size) style.fontSize = `${line.size ?? size}cqw`;
  // the box's leading has to be set on the line, not left to be inherited:
  // every role class carries a line-height of its own, and a class beats
  // inheritance, so a box that only set it on the wrapper set nothing
  if ((line.leading ?? leading) !== undefined) style.lineHeight = line.leading ?? leading;
  // air above this line, where the box holds two writings her own gap apart
  if (line.space !== undefined) style.marginTop = `${line.space}cqw`;
  if (line.caps) style.textTransform = 'uppercase';
  // a whole list in one line's worth of markup: the newlines valueAt joined
  // it with are the line breaks, and the box's leading spaces them
  if (text.includes('\n')) style.whiteSpace = 'pre-line';
  if (line.color) style.color = `var(--inv-${line.color})`;
  const styled = Object.keys(style).length ? style : undefined;
  /*
   * Her highlight goes on a span inside the line, not on the line itself.
   * It is an inline background, so it hugs the words rather than the box
   * and `box-decoration-break: clone` gives every line of a wrapped answer
   * a pill of its own — which is what Canva draws and what a baked one
   * cannot do. Inline padding leaves the line box alone, so the baselines
   * the page was fitted to do not move.
   */
  const body = highlight
    ? <span className="inv-bb-hl" style={{ background: `var(--inv-${highlight})` }}>{text}</span>
    : text;
  return <Tag className={cls || undefined} style={styled}>{body}</Tag>;
}

/** The face, size, weight and letter-spacing the studio set on a whole block. */
function blockType(el: TextEl): CSSProperties {
  const style: CSSProperties = {};
  if (el.face) style.fontFamily = `var(--inv-${el.face})`;
  if (el.size) style.fontSize = `${el.size}cqw`;
  if (el.weight) style.fontWeight = el.weight;
  if (el.tracking !== undefined) style.letterSpacing = `${el.tracking}em`;
  // her own leading, where she set one: unitless, so it follows the size
  if (el.leading !== undefined) style.lineHeight = el.leading;
  if (el.rule) { style.textDecoration = 'underline'; style.textUnderlineOffset = '0.22em'; }
  // inherited, so the lines inside the box take it without being told
  if (el.caps) style.textTransform = 'uppercase';
  return style;
}

/** What a frame is bound to, for the studio's dashed placeholder and the asks sheet. */
export function bindingOf(el: Element): FieldRef | undefined {
  if (el.kind === 'photo') return 'asset' in el.bind ? undefined : el.bind;
  if (el.kind !== 'text') return undefined;
  for (const line of el.lines) for (const s of line.sources) if ('bind' in s) return s.bind;
  return undefined;
}
