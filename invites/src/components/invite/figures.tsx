/**
 * The people on the dress code page: the designer's drawn fashion plates,
 * recoloured on the page to the colours the couple picked.
 *
 * Each drawing is two images (`src/lib/attire-art.ts`): the garment as its
 * shading alone — grey, its middle tone at exactly half — and the rest as
 * drawn (face, hair, shirt, tie, shoes, bag), laid over it. The garment is
 * coloured by an SVG gradient map: a component transfer that sends black to
 * black, the middle tone to the chosen colour and white to white, so the
 * folds, the sheen and the shadows of the drawing survive in any colour, a
 * black suit and an ivory gown alike.
 */
import type { Drawing } from '@/lib/attire-art';

function channels(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function Drawn({ drawing, color, id, width }: { drawing: Drawing; color: string; id: string; /** the figure's width, a CSS length; the height follows the drawing's shape */ width?: string }) {
  const [r, g, b] = channels(color);
  const table = (c: number) => `0 ${c.toFixed(4)} 1`;
  return (
    <span className="inv-figure" style={{ aspectRatio: `${drawing.w} / ${drawing.h}`, width }}>
      <svg width="0" height="0" aria-hidden focusable="false" style={{ position: 'absolute' }}>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues={table(r)} />
            <feFuncG type="table" tableValues={table(g)} />
            <feFuncB type="table" tableValues={table(b)} />
          </feComponentTransfer>
        </filter>
      </svg>
      <img src={`/attire/${drawing.id}-shade.webp`} alt="" className="inv-figure-cloth" style={{ filter: `url(#${id})` }} loading="lazy" decoding="async" />
      <img src={`/attire/${drawing.id}-fixed.webp`} alt="" className="inv-figure-rest" loading="lazy" decoding="async" />
    </span>
  );
}
