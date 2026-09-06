import qrcode from 'qrcode-generator';

/**
 * QR codes as inline SVG. Rendered on the server, no canvas, no image host:
 * the same markup goes into the share modal, the printable card and the
 * check-in pass. Error-correction M survives a phone screenshot of a screen.
 */
export function qrSvg(text: string, opts: { size?: number; margin?: number; dark?: string; light?: string } = {}): string {
  const size = opts.size ?? 240;
  const margin = opts.margin ?? 2;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / (count + margin * 2);
  let path = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const x = (c + margin) * cell;
        const y = (r + margin) * cell;
        path += `M${x.toFixed(2)} ${y.toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="${opts.light ?? '#ffffff'}"/><path d="${path}" fill="${opts.dark ?? '#111111'}"/></svg>`;
}

export function qrDataUrl(text: string, size = 240): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(text, { size }))}`;
}
