import { Fragment, type CSSProperties } from 'react';
import { t, type Lang } from '@/lib/copy';
import { lookLine, lookTitle, type Look, type LineKey, type TitleKey } from '@/lib/looks';
import { imageUrl, IMAGE } from '@/lib/images';
import {
  elementStyle, photoStyle, cropStyle, shapeStyle, lineText, valueAt, pageRatio, BLOCK_CLASS, LINE_CLASS, LINE_TAG,
  type PageSpec, type Element, type PhotoEl, type TextEl, type ShapeEl, type VideoEl, type Line, type WordKey, type FieldRef,
} from '@/lib/design';
import { LazyVideo } from './client';

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
};

export function DrawnPage({ page, content, look, lang, edit }: { page: PageSpec; content: Record<string, unknown>; look?: Look; lang: Lang; edit?: EditView }) {
  const read = {
    content,
    lang,
    edit,
    word: (key: WordKey) => (key.startsWith('title:') ? lookTitle(look, lang, key.slice(6) as TitleKey) : lookLine(look, lang, key as LineKey)) ?? '',
    copy: (key: string) => t(lang, key as Parameters<typeof t>[1]),
  };
  // A page that grows places by its width rather than by its height: see
  // elementStyle. The ratio is what turns one into the other.
  const grow = page.grow ? pageRatio(page) : undefined;
  return (
    <section id={page.key} className={`inv-section inv-bb-art inv-bb-${page.key}`}>
      {(page.elements ?? []).map((el) => <Fragment key={el.id}>{draw(el, read, grow)}</Fragment>)}
    </section>
  );
}

type Read = Parameters<typeof lineText>[1] & { content: Record<string, unknown>; edit?: EditView };

function draw(el: Element, read: Read, grow?: number) {
  if (el.kind === 'photo') return <Frame el={el} read={read} grow={grow} />;
  if (el.kind === 'text') return <Block el={el} read={read} grow={grow} />;
  if (el.kind === 'shape') return <Shape el={el} read={read} grow={grow} />;
  if (el.kind === 'video') return <Clip el={el} read={read} grow={grow} />;
  // animation arrives with phase 4; a document that names one is read and
  // kept, it simply has nothing to draw yet
  return null;
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
function Clip({ el, read, grow }: { el: VideoEl; read: Read; grow?: number }) {
  const poster = el.poster ? imageUrl(el.poster, IMAGE.grid) : undefined;
  const box = { ...elementStyle(el, grow), aspectRatio: el.aspect ? `1 / ${el.aspect}` : undefined } as CSSProperties;
  if (!el.url && !read.edit) return null;
  return (
    <div
      className="inv-bb-clip"
      style={box}
      data-el={read.edit ? el.id : undefined}
      data-foot={grow && el.from === 'bottom' ? '' : undefined}
      data-empty={read.edit && !el.url ? '' : undefined}
    >
      {read.edit || !el.url
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
function Shape({ el, read, grow }: { el: ShapeEl; read: Read; grow?: number }) {
  return (
    <div
      className="inv-bb-shape"
      aria-hidden
      data-shape={el.shape}
      style={{ ...elementStyle(el, grow), ...shapeStyle(el) } as CSSProperties}
      data-el={read.edit ? el.id : undefined}
      data-foot={grow && el.from === 'bottom' ? '' : undefined}
    />
  );
}

/** A photograph in its frame. An empty binding draws nothing, as today. */
function Frame({ el, read, grow }: { el: PhotoEl; read: Read; grow?: number }) {
  const url = 'asset' in el.bind ? el.bind.asset : valueAt(read.content, el.bind);
  if (!url && el.hidden !== 'never' && !read.edit) return null;
  const alt = el.alt ? valueAt(read.content, el.alt) : '';
  // a shape other than square, a cut, a card and a window on the source: each
  // one says nothing at all when it is not set, which is why the two designs
  // that carry none of them serve the markup they always served
  const figure = (
    <figure
      className="inv-bb-slot"
      style={{ ...elementStyle(el, grow), ...photoStyle(el) } as CSSProperties}
      data-el={read.edit ? el.id : undefined}
      data-foot={grow && el.from === 'bottom' ? '' : undefined}
      data-empty={read.edit && !url ? '' : undefined}
      data-own={'asset' in el.bind ? '' : undefined}
      data-crop={el.crop ? '' : undefined}
      data-frame={el.frame && el.frame !== 'none' ? el.frame : undefined}
      data-mask={el.mask && el.mask !== 'none' ? el.mask : undefined}
    >
      {url
        // a moving picture is never re-encoded: the transform endpoint would take its first frame
        ? <img src={el.animated ? url : imageUrl(url, IMAGE.grid)} alt={alt} loading="lazy" style={el.crop ? cropStyle(el.crop) as CSSProperties : undefined} />
        : <figcaption className="inv-bb-ask">{read.edit!.label(el)}</figcaption>}
    </figure>
  );
  if (!url || read.edit?.cropping !== el.id) return figure;
  return (
    <>
      <div className="inv-bb-ghost" aria-hidden style={{ ...elementStyle(el, grow), ...photoStyle(el) } as CSSProperties}>
        <img src={el.animated ? url : imageUrl(url, IMAGE.grid)} alt="" style={(el.crop ? cropStyle(el.crop) : { width: '100%', height: '100%' }) as CSSProperties} />
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
function Block({ el, read, grow }: { el: TextEl; read: Read; grow?: number }) {
  const texts = el.lines.map((l) => lineText(l.sources, read));
  const blank = !texts.some(Boolean);
  if (blank && el.hidden !== 'never' && !read.edit) return null;
  const style = { ...elementStyle(el, grow), ...blockType(el) } as CSSProperties;
  const cls = BLOCK_CLASS[el.block];
  // `data-foot` says this one is placed from the foot: what holds the bottom
  // of a page that grows follows the page down and is never what pushes it
  const mark = {
    ...(read.edit ? { 'data-el': el.id, 'data-empty': blank ? '' : undefined } : {}),
    ...(grow && el.from === 'bottom' ? { 'data-foot': '' } : {}),
    // what sits behind the words on a busy picture: a halo in the surface
    // colour, or a pale card. Both are the stylesheet's, so both scale with
    // the column and both follow the palette into night.
    ...(el.backing && el.backing !== 'none' ? { 'data-backing': el.backing } : {}),
  };
  // the caption is the paragraph itself, the way the polaroid's strip is written
  if (el.block === 'caption') {
    const own = { ...style, ...(el.face ? { fontFamily: `var(--inv-${el.face})` } : {}), ...(el.size ? { fontSize: `${el.size}cqw` } : {}) };
    return <p className={cls} style={own} {...mark}>{texts.find(Boolean) || (read.edit ? read.edit.label(el) : '')}</p>;
  }
  const body = blank && read.edit
    ? <p className="inv-bb-ask">{read.edit.label(el)}</p>
    : el.lines.map((line, i) => (texts[i] ? <LineText key={i} line={line} text={texts[i]} face={el.face} size={el.size} /> : null));
  if (el.block === 'head') return <header className={cls} style={style} {...mark}>{body}</header>;
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
function LineText({ line, text, face, size }: { line: Line; text: string; face?: TextEl['face']; size?: number }) {
  const Tag = LINE_TAG[line.role];
  const cls = LINE_CLASS[line.role];
  const style: CSSProperties = {};
  if (face) style.fontFamily = `var(--inv-${face})`;
  if (line.align) style.textAlign = line.align;
  if (line.size ?? size) style.fontSize = `${line.size ?? size}cqw`;
  if (line.color) style.color = `var(--inv-${line.color})`;
  const styled = Object.keys(style).length ? style : undefined;
  return <Tag className={cls || undefined} style={styled}>{text}</Tag>;
}

/** The face, size, weight and letter-spacing the studio set on a whole block. */
function blockType(el: TextEl): CSSProperties {
  const style: CSSProperties = {};
  if (el.face) style.fontFamily = `var(--inv-${el.face})`;
  if (el.size) style.fontSize = `${el.size}cqw`;
  if (el.weight) style.fontWeight = el.weight;
  if (el.tracking !== undefined) style.letterSpacing = `${el.tracking}em`;
  return style;
}

/** What a frame is bound to, for the studio's dashed placeholder and the asks sheet. */
export function bindingOf(el: Element): FieldRef | undefined {
  if (el.kind === 'photo') return 'asset' in el.bind ? undefined : el.bind;
  if (el.kind !== 'text') return undefined;
  for (const line of el.lines) for (const s of line.sources) if ('bind' in s) return s.bind;
  return undefined;
}
