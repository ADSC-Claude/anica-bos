// Cut every garment on the designer's sheet into two layers: the cloth as
// normalised shading (recoloured on the page) and the parts that keep their
// colour — shirts, ties, trousers under a shirt, skin — as drawn.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, '../../package.json'))('sharp');
/** The designer's sheet, which does not live in the repository; pass its path. */
const SHEET = process.argv[3] ?? 'sheet-1.png';
const OUT = process.argv[2] ?? 'out'; fs.mkdirSync(OUT, { recursive: true });
const DEBUG = process.argv.includes('--debug');
const boxes = JSON.parse(fs.readFileSync(path.join(here, 'boxes-sheet-1.json'), 'utf8'));
const box = (id) => boxes.find((b) => b.id === id);
const { data, info } = await sharp(SHEET).raw().toBuffer({ resolveWithObject: true });
const FW = info.width, FH = info.height;
const at = (x, y) => { const i = (y * FW + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };

// A merged box holds several garments that touch; split it into n at the n-1
// thinnest columns (fewest solid pixels), at least `minW` apart.
function split(b, n, minW = 60) {
  const W = b.x1 - b.x0; const cols = new Float32Array(W);
  for (let x = 0; x < W; x++) { let c = 0; for (let y = b.y0; y < b.y1; y++) if (at(b.x0 + x, y)[3] > 160) c++; cols[x] = c; }
  const cuts = [];
  const cand = [...cols.keys()].filter((x) => x > minW && x < W - minW).sort((a, c) => cols[a] - cols[c]);
  for (const x of cand) { if (cuts.length >= n - 1) break; if (cuts.every((c) => Math.abs(c - x) >= minW)) cuts.push(x); }
  cuts.sort((a, c) => a - c);
  const edges = [0, ...cuts, W];
  return edges.slice(0, -1).map((e, i) => ({ x0: b.x0 + e, x1: b.x0 + edges[i + 1], y0: b.y0, y1: b.y1 }));
}

// id, group, kind, source box (or part of a split), and what keeps its colour:
//   shirt   the shirt and tie in the middle of a coat, and a pocket square
//   below:t everything under t of the height (trousers, shorts)
//   above:t everything above t (a blouse)
//   skin    skin by colour
//   bow     a dark bow tie at the top centre
const r15 = split(box('r1-5'), 2), r110 = split(box('r1-10'), 3), r21 = split(box('r2-1'), 10, 90), r22 = split(box('r2-2'), 2), r41 = split(box('r4-1'), 7, 80);
const ITEMS = [
  { id: 'tuxedo', group: 'gents', kind: 'tuxedo', b: box('r1-1'), fixed: ['shirt', 'bow'] },
  { id: 'suit-black', group: 'gents', kind: 'suit', b: box('r1-2'), fixed: ['shirt'] },
  { id: 'suit-navy', group: 'gents', kind: 'suit', b: box('r1-3'), fixed: ['shirt'] },
  { id: 'suit-cream', group: 'gents', kind: 'suit', b: box('r1-4'), fixed: ['shirt'] },
  { id: 'suit-olive', group: 'gents', kind: 'suit', b: r15[0], fixed: ['shirt'] },
  { id: 'suit-brown', group: 'gents', kind: 'suit', b: r15[1], fixed: ['shirt'] },
  { id: 'suit-grey', group: 'gents', kind: 'suit', b: box('r1-6'), fixed: ['shirt'] },
  { id: 'barong-1', group: 'gents', kind: 'barong', b: box('r1-7'), fixed: [] },
  { id: 'barong-2', group: 'gents', kind: 'barong', b: box('r1-8'), fixed: [] },
  { id: 'barong-short', group: 'gents', kind: 'barongShort', b: box('r1-9'), fixed: [] },
  { id: 'linen-shirt', group: 'gents', kind: 'linen', b: r110[0], fixed: [] },
  { id: 'white-shirt', group: 'gents', kind: 'shirt', b: r110[1], fixed: [] },
  { id: 'casual-shirt', group: 'gents', kind: 'casual', b: r110[2], fixed: [] },
  { id: 'gown-satin', group: 'ladies', kind: 'long', b: r21[0], fixed: [] },
  { id: 'gown-draped-shoulder', group: 'ladies', kind: 'long', b: r21[1], fixed: [] },
  { id: 'gown-lace', group: 'ladies', kind: 'long', b: r21[2], fixed: [] },
  { id: 'gown-slit', group: 'ladies', kind: 'long', b: r21[3], fixed: ['skin'] },
  { id: 'gown-halter', group: 'ladies', kind: 'long', b: r21[4], fixed: [] },
  { id: 'gown-chiffon', group: 'ladies', kind: 'long', b: r21[5], fixed: [] },
  { id: 'gown-ruffles', group: 'ladies', kind: 'long', b: r21[6], fixed: [] },
  { id: 'gown-tiers', group: 'ladies', kind: 'long', b: r21[7], fixed: [] },
  { id: 'gown-floral-1', group: 'ladies', kind: 'longPrint', b: r21[8], fixed: [] },
  // where garments overlapped on the sheet, the neighbour's part is cut away (polygons in fractions of the box)
  { id: 'gown-floral-2', group: 'ladies', kind: 'longPrint', b: r21[9], fixed: [], exclude: [[[0.64, 0], [1, 0], [1, 1], [0.8, 1], [0.78, 0.6], [0.7, 0.35], [0.64, 0.2]]] },
  { id: 'terno-ivory', group: 'ladies', kind: 'terno', b: r22[0], fixed: [], exclude: [[[0, 0.62], [0.31, 0.70], [0.31, 0.975], [0.6, 0.975], [0.6, 1], [0, 1]]] },
  { id: 'terno-olive', group: 'ladies', kind: 'terno', b: r22[1], fixed: [], exclude: [[[0, 0.5], [0.14, 0.55], [0.14, 1], [0, 1]]] },
  { id: 'midi-wrap', group: 'ladies', kind: 'midi', b: box('r3-1'), fixed: [] },
  { id: 'cocktail-flare', group: 'ladies', kind: 'cocktail', b: box('r3-2'), fixed: [] },
  { id: 'cocktail-cowl', group: 'ladies', kind: 'cocktail', b: box('r3-3'), fixed: [] },
  { id: 'midi-flutter', group: 'ladies', kind: 'midi', b: box('r3-4'), fixed: [] },
  { id: 'cocktail-pleated', group: 'ladies', kind: 'cocktail', b: box('r3-5'), fixed: [] },
  { id: 'jumpsuit-wrap', group: 'ladies', kind: 'jumpsuit', b: box('r3-6'), fixed: [] },
  { id: 'blazer-suit', group: 'ladies', kind: 'ladySuit', b: box('r3-7'), fixed: [] },
  { id: 'jumpsuit-belted', group: 'ladies', kind: 'jumpsuit', b: box('r3-8'), fixed: [] },
  { id: 'blouse-trousers', group: 'ladies', kind: 'blouseTrousers', b: box('r3-9'), fixed: [] },
  { id: 'blouse-skirt', group: 'ladies', kind: 'blouseSkirt', b: box('r3-10'), fixed: [] },
  { id: 'jumpsuit-cami', group: 'ladies', kind: 'jumpsuit', b: box('r3-11'), fixed: [] },
  { id: 'midi-belted', group: 'ladies', kind: 'midi', b: box('r3-12'), fixed: [] },
  ...r41.map((b, i) => ({ id: `girl-${i + 1}`, group: 'girls', kind: 'girl', b, fixed: [] })),
  { id: 'boy-tuxedo', group: 'boys', kind: 'boyFormal', b: box('r4-2'), fixed: ['shirt', 'bow'] },
  { id: 'boy-barong', group: 'boys', kind: 'boyBarong', b: box('r4-3'), fixed: [] },
  { id: 'boy-vest', group: 'boys', kind: 'boyFormal', b: box('r4-4'), fixed: ['shirt', 'bow'] },
  { id: 'boy-suspenders', group: 'boys', kind: 'boySmart', b: box('r4-5'), fixed: [] },
  { id: 'boy-shirt', group: 'boys', kind: 'boySmart', b: box('r4-6'), fixed: [] },
  { id: 'boy-polo', group: 'boys', kind: 'boyCasual', b: box('r4-7'), fixed: [] },
];

const inPoly = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const hue = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0; let h; if (mx === r) h = (g - b) / (mx - mn); else if (mx === g) h = 2 + (b - r) / (mx - mn); else h = 4 + (r - g) / (mx - mn); h *= 60; return h < 0 ? h + 360 : h; };
const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const registry = [];

for (const it of ITEMS) {
  const { x0, y0, x1, y1 } = it.b; const W = x1 - x0, H = y1 - y0, N = W * H;
  const rgb = new Uint8Array(N * 3), alpha = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b, a] = at(x0 + x, y0 + y); const i = y * W + x; rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; alpha[i] = Math.max(0, Math.min(1, (a - 24) / (232 - 24))); }
  if (it.exclude) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (alpha[i] > 0 && it.exclude.some((poly) => inPoly(poly, x / W, y / H))) alpha[i] = 0; }
  // a garment that touched its neighbour on the sheet carries a sliver of it:
  // keep only the pieces that are at least a twentieth of the biggest one
  {
    const lab = new Int32Array(N); const comps = []; let k = 0;
    for (let i = 0; i < N; i++) { if (alpha[i] < 0.4 || lab[i]) continue; k++; const st = [i]; lab[i] = k; let n = 0; while (st.length) { const j = st.pop(); n++; const x = j % W, y = (j - x) / W; for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (q >= 0 && alpha[q] >= 0.4 && !lab[q]) { lab[q] = k; st.push(q); } } comps.push(n); }
    const biggest = Math.max(...comps);
    const keep = comps.map((n) => n >= biggest / 20);
    for (let i = 0; i < N; i++) if (lab[i] && !keep[lab[i] - 1]) alpha[i] = 0;
    // and the faint pixels around a dropped piece
    for (let i = 0; i < N; i++) if (alpha[i] > 0 && alpha[i] < 0.4) { const x = i % W, y = (i - x) / W; let nearKept = false; for (let dy = -2; dy <= 2 && !nearKept; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { const j = yy * W + xx; if (lab[j] && keep[lab[j] - 1]) { nearKept = true; break; } } } if (!nearKept) alpha[i] = 0; }
  }
  // the garment's own colour: the median of the solid pixels in the middle band
  const samp = []; for (let y = Math.round(H * 0.3); y < Math.round(H * 0.7); y++) for (let x = Math.round(W * 0.3); x < Math.round(W * 0.7); x++) { const i = y * W + x; if (alpha[i] > 0.9) samp.push(i); }
  samp.sort((a, b) => lum(rgb[a * 3], rgb[a * 3 + 1], rgb[a * 3 + 2]) - lum(rgb[b * 3], rgb[b * 3 + 1], rgb[b * 3 + 2]));
  const gi = samp[Math.floor(samp.length / 2)]; const gc = [rgb[gi * 3], rgb[gi * 3 + 1], rgb[gi * 3 + 2]]; const gHue = hue(...gc), gLum = lum(...gc), gSat = sat(...gc);
  const fixed = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (alpha[i] <= 0) continue;
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; const h = hue(r, g, b), s = sat(r, g, b), L = lum(r, g, b); const fx = x / W, fy = y / H;
    let fix = false;
    for (const rule of it.fixed) {
      if (rule === 'shirt') {
        const white = Math.min(r, g, b) > 215 && s < 0.1;
        if (white && fy < 0.6 && (gLum < 0.8 || (fx > 0.3 && fx < 0.7))) fix = true; // shirt, collar, pocket square
        const dHue = Math.min(Math.abs(h - gHue), 360 - Math.abs(h - gHue));
        if (fx > 0.42 && fx < 0.58 && fy < 0.5 && !white && (Math.abs(L - gLum) > 0.22 || (dHue > 25 && s > 0.15))) fix = true; // the tie
      }
      if (rule === 'bow' && fy < 0.14 && fx > 0.35 && fx < 0.65 && L < 0.3) fix = true;
      if (rule.startsWith('below:') && fy > Number(rule.slice(6))) fix = true;
      if (rule.startsWith('above:') && fy < Number(rule.slice(6))) fix = true;
      if (rule === 'skin' && r > 140 && r > g && g > b && h >= 12 && h <= 33 && s >= 0.14 && s <= 0.5 && L > 0.35) fix = true;
    }
    if (fix) fixed[i] = 1;
  }
  // specks: drop fixed blobs under 30 px
  { const seen = new Uint8Array(N); for (let i = 0; i < N; i++) { if (!fixed[i] || seen[i]) continue; const blob = [i]; seen[i] = 1; for (let q = 0; q < blob.length; q++) { const j = blob[q]; const x = j % W, y = (j - x) / W; for (const n of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (n >= 0 && fixed[n] && !seen[n]) { seen[n] = 1; blob.push(n); } } if (blob.length < 30) for (const j of blob) fixed[j] = 0; } }
  // shading, the garment's middle tone at half
  const Ls = []; for (let i = 0; i < N; i++) if (alpha[i] > 0.5 && !fixed[i]) Ls.push(lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
  Ls.sort((a, b) => a - b); const m = Ls[Math.floor(Ls.length / 2)] || 0.5;
  const shade = Buffer.alloc(N * 4), fixL = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const L = lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); const sv = L < m ? 0.5 * L / m : 0.5 + 0.5 * (L - m) / (1 - m);
    const v = Math.round(Math.max(0, Math.min(1, sv)) * 255); const a = alpha[i];
    shade[i * 4] = shade[i * 4 + 1] = shade[i * 4 + 2] = v; shade[i * 4 + 3] = Math.round((fixed[i] ? 0 : a) * 255);
    fixL[i * 4] = rgb[i * 3]; fixL[i * 4 + 1] = rgb[i * 3 + 1]; fixL[i * 4 + 2] = rgb[i * 3 + 2]; fixL[i * 4 + 3] = Math.round((fixed[i] ? a : 0) * 255);
  }
  const scale = 2;
  await sharp(shade, { raw: { width: W, height: H, channels: 4 } }).resize({ width: W * scale, height: H * scale, kernel: 'lanczos3' }).webp({ quality: 90, alphaQuality: 90 }).toFile(`${OUT}/${it.id}-shade.webp`);
  await sharp(fixL, { raw: { width: W, height: H, channels: 4 } }).resize({ width: W * scale, height: H * scale, kernel: 'lanczos3' }).webp({ quality: 90, alphaQuality: 90 }).toFile(`${OUT}/${it.id}-fixed.webp`);
  // how much of the figure the picked colour reaches: "the colors of the
  // clothes are not fully coated" is this number falling below about 0.9
  let cloth = 0, rest = 0;
  for (let i = 0; i < N; i++) { if (fixed[i]) rest += alpha[i]; else cloth += alpha[i]; }
  const coat = Math.round((cloth / (cloth + rest)) * 100) / 100;
  registry.push({ id: it.id, group: it.group, kind: it.kind, w: W * scale, h: H * scale, coat });
  if (DEBUG) {
    const preview = (c) => { const out = Buffer.alloc(N * 3, 255); for (let i = 0; i < N; i++) { const a = alpha[i]; if (a <= 0) continue; let r, g, b; if (fixed[i]) { r = rgb[i * 3]; g = rgb[i * 3 + 1]; b = rgb[i * 3 + 2]; } else { const L = lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); const s = Math.max(0, Math.min(1, L < m ? 0.5 * L / m : 0.5 + 0.5 * (L - m) / (1 - m))); const map = (cc) => s < 0.5 ? cc * (s / 0.5) : cc + (255 - cc) * ((s - 0.5) / 0.5); r = map(c[0]); g = map(c[1]); b = map(c[2]); } out[i * 3] = Math.round(255 * (1 - a) + r * a); out[i * 3 + 1] = Math.round(255 * (1 - a) + g * a); out[i * 3 + 2] = Math.round(255 * (1 - a) + b * a); } return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(); };
    const maskView = Buffer.alloc(N * 3); for (let i = 0; i < N; i++) { const a = alpha[i]; const c = fixed[i] ? [230, 60, 60] : [60, 120, 230]; for (let ch = 0; ch < 3; ch++) maskView[i * 3 + ch] = Math.round(255 * (1 - a) + c[ch] * a); }
    const tiles = [await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), await sharp(maskView, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), await preview([0x1f, 0x2a, 0x44]), await preview([0xd9, 0xa9, 0xa9])];
    await sharp({ create: { width: tiles.length * (W + 4), height: H, channels: 3, background: '#777' } }).composite(tiles.map((t, i) => ({ input: t, left: i * (W + 4), top: 0 }))).png().toFile(`${OUT}/debug-${it.id}.png`);
  }
  console.log(it.id.padEnd(22), `${W}x${H}`, 'colour', gc.join(','), 'L', gLum.toFixed(2), 'fixed', fixed.reduce((s, v) => s + v, 0));
}
fs.writeFileSync(`${OUT}/wardrobe.json`, JSON.stringify(registry, null, 1) + '\n');
