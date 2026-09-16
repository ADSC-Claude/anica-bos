/**
 * The people on the dress code page: the designer's drawn fashion plates,
 * recoloured on the page to the colours the couple picked.
 *
 * Each drawing is two images (`src/lib/attire-art.ts`): the garment as its
 * shading alone — grey, its middle tone at exactly half — and the rest as
 * drawn (face, hair, shirt, tie, shoes, bag), laid over it.
 *
 * The garment is coloured in three layers, with CSS every browser has: a flat
 * fill of the chosen colour cut to the garment's silhouette by the shading's
 * own alpha (a mask), the shading itself blended over it in hard light, and
 * the fixed parts on top. Hard light sends the shading's black to black, its
 * middle tone to the colour and its white to white — the folds, the sheen and
 * the shadows of the drawing survive in any colour, a black suit and an ivory
 * gown alike. It used to be an SVG filter on the image; Safari does not apply
 * those to images, and left the garments out.
 */
import type { CSSProperties } from 'react';
import type { Drawing } from '@/lib/attire-art';

export function Drawn({ drawing, color, width }: { drawing: Drawing; color: string; /** the figure's width, a CSS length; the height follows the drawing's shape */ width?: string }) {
  const shade = `/attire/${drawing.id}-shade.webp`;
  // the silhouette: the shading's alpha as a mask over the flat colour (prefixed for the Safari versions that still need it)
  const mask: CSSProperties = {
    background: color,
    WebkitMaskImage: `url(${shade})`,
    maskImage: `url(${shade})`,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  };
  return (
    <span className="inv-figure" style={{ aspectRatio: `${drawing.w} / ${drawing.h}`, width }}>
      <span className="inv-figure-color" style={mask} aria-hidden />
      <img src={shade} alt="" className="inv-figure-cloth" loading="lazy" decoding="async" />
      <img src={`/attire/${drawing.id}-fixed.webp`} alt="" className="inv-figure-rest" loading="lazy" decoding="async" />
    </span>
  );
}
