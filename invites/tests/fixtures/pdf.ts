/**
 * The smallest PDF that still holds what the reader has to read.
 *
 * A checked-in binary would be a fixture nobody can review in a diff, and a
 * real Canva export is somebody's design. This builds the three cases by
 * hand instead — a page with placed pictures and real text, a flattened
 * page, and a page whose words were turned into outlines — in a form where
 * the bytes and the rectangles are both readable.
 */

export type Placed = { x: number; y: number; w: number; h: number };
export type Written = { x: number; y: number; size: number; words: string };

export function makePdf({ width = 600, height = 900, images = [], text = [], paths = 0 }: {
  width?: number; height?: number; images?: Placed[]; text?: Written[]; paths?: number;
} = {}): Uint8Array {
  const objs: string[] = [];
  const add = (body: string) => { objs.push(body); return objs.length; };   // 1-based, the way a PDF counts

  // a one-pixel picture is still a picture, and it is placed by its matrix
  const imgNums = images.map(() => {
    const px = '\xc8\x64\x64';
    return add(`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n${px}\nendstream`);
  });
  const fontNum = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const parts: string[] = [];
  // PDF measures from the bottom left, so y is the foot of the box
  images.forEach((im, i) => parts.push(`q ${im.w} 0 0 ${im.h} ${im.x} ${im.y} cm /Im${i} Do Q`));
  for (const t of text) parts.push(`BT /F1 ${t.size} Tf 1 0 0 1 ${t.x} ${t.y} Tm (${t.words}) Tj ET`);
  for (let i = 0; i < paths; i++) {
    const x = 40 + (i % 20) * 24, y = 700 - Math.floor(i / 20) * 40;
    parts.push(`0 0 0 rg ${x} ${y} m ${x + 16} ${y} l ${x + 16} ${y + 22} l ${x} ${y + 22} l h f`);
  }
  const content = parts.join('\n');
  const contentNum = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const res = `<< /XObject << ${imgNums.map((n, i) => `/Im${i} ${n} 0 R`).join(' ')} >> /Font << /F1 ${fontNum} 0 R >> >>`;
  const pageNum = objs.length + 2;
  const pagesNum = add(`<< /Type /Pages /Kids [${pageNum} 0 R] /Count 1 >>`);
  add(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${res} /Contents ${contentNum} 0 R >>`);
  const rootNum = add(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${rootNum} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
}
