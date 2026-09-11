import { Fragment, type CSSProperties } from 'react';
import { t, type Lang } from '@/lib/copy';
import { lookLine, lookTitle, type Look, type LineKey, type TitleKey } from '@/lib/looks';
import { imageUrl, IMAGE } from '@/lib/images';
import {
  elementStyle, lineText, valueAt, BLOCK_CLASS, LINE_CLASS, LINE_TAG,
  type PageSpec, type Element, type PhotoEl, type TextEl, type Line, type WordKey, type FieldRef,
} from '@/lib/design';

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
export type EditView = { label: (el: Element) => string };

export function DrawnPage({ page, content, look, lang, edit }: { page: PageSpec; content: Record<string, unknown>; look?: Look; lang: Lang; edit?: EditView }) {
  const read = {
    content,
    lang,
    edit,
    word: (key: WordKey) => (key.startsWith('title:') ? lookTitle(look, lang, key.slice(6) as TitleKey) : lookLine(look, lang, key as LineKey)) ?? '',
    copy: (key: string) => t(lang, key as Parameters<typeof t>[1]),
  };
  return (
    <section id={page.key} className={`inv-section inv-bb-art inv-bb-${page.key}`}>
      {(page.elements ?? []).map((el) => <Fragment key={el.id}>{draw(el, read)}</Fragment>)}
    </section>
  );
}

type Read = Parameters<typeof lineText>[1] & { content: Record<string, unknown>; edit?: EditView };

function draw(el: Element, read: Read) {
  if (el.kind === 'photo') return <Frame el={el} read={read} />;
  if (el.kind === 'text') return <Block el={el} read={read} />;
  // video, animation and shape arrive with phases 3, 4 and 2; a document that
  // names one is read and kept, it simply has nothing to draw yet
  return null;
}

/** A photograph in its frame. An empty binding draws nothing, as today. */
function Frame({ el, read }: { el: PhotoEl; read: Read }) {
  const url = 'asset' in el.bind ? el.bind.asset : valueAt(read.content, el.bind);
  if (!url && el.hidden !== 'never' && !read.edit) return null;
  const alt = el.alt ? valueAt(read.content, el.alt) : '';
  return (
    <figure className="inv-bb-slot" style={elementStyle(el) as CSSProperties} data-el={read.edit ? el.id : undefined} data-empty={read.edit && !url ? '' : undefined}>
      {url
        // a moving picture is never re-encoded: the transform endpoint would take its first frame
        ? <img src={el.animated ? url : imageUrl(url, IMAGE.grid)} alt={alt} loading="lazy" />
        : <figcaption className="inv-bb-ask">{read.edit!.label(el)}</figcaption>}
    </figure>
  );
}

/**
 * One or more lines stacked in flow inside one box: the heading with its
 * line under it, or a milestone's name with its sentence. An empty line is
 * dropped; a block whose every line is empty draws nothing.
 */
function Block({ el, read }: { el: TextEl; read: Read }) {
  const texts = el.lines.map((l) => lineText(l.sources, read));
  const blank = !texts.some(Boolean);
  if (blank && el.hidden !== 'never' && !read.edit) return null;
  const style = { ...elementStyle(el), ...blockType(el) } as CSSProperties;
  const cls = BLOCK_CLASS[el.block];
  const mark = read.edit ? { 'data-el': el.id, 'data-empty': blank ? '' : undefined } : {};
  // the caption is the paragraph itself, the way the polaroid's strip is written
  if (el.block === 'caption') return <p className={cls} style={style} {...mark}>{texts.find(Boolean) || (read.edit ? read.edit.label(el) : '')}</p>;
  const body = blank && read.edit
    ? <p className="inv-bb-ask">{read.edit.label(el)}</p>
    : el.lines.map((line, i) => (texts[i] ? <LineText key={i} line={line} text={texts[i]} /> : null));
  if (el.block === 'head') return <header className={cls} style={style} {...mark}>{body}</header>;
  return <div className={cls} style={style} {...mark}>{body}</div>;
}

function LineText({ line, text }: { line: Line; text: string }) {
  const Tag = LINE_TAG[line.role];
  const cls = LINE_CLASS[line.role];
  const style: CSSProperties = {};
  if (line.align) style.textAlign = line.align;
  if (line.size) style.fontSize = `${line.size}cqw`;
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
  if (el.backing === 'shadow') style.textShadow = '0 1px 3px rgba(0,0,0,0.35)';
  return style;
}

/** What a frame is bound to, for the studio's dashed placeholder and the asks sheet. */
export function bindingOf(el: Element): FieldRef | undefined {
  if (el.kind === 'photo') return 'asset' in el.bind ? undefined : el.bind;
  if (el.kind !== 'text') return undefined;
  for (const line of el.lines) for (const s of line.sources) if ('bind' in s) return s.bind;
  return undefined;
}
