/**
 * A vector animation, read in the browser before it is sent.
 *
 * Two things have to happen here and neither can happen on the server. The
 * file is checked for being a Lottie at all — the same `readLottie` the
 * route uses, run early so a refusal arrives before an upload rather than
 * after one. And its first frame is drawn, because that is the poster, and
 * drawing a frame of a Lottie needs the player, which is a browser thing.
 *
 * The poster matters more here than it does for a clip. A clip's poster is
 * seen by the three people who never see the clip; an animation's is seen by
 * those three *and* by everyone else, for the second or two before a third
 * of a megabyte of player arrives. It is the page until then.
 */
import { readLottie, zipLike, LOTTIE_MAX_BYTES, LOTTIE_MAX_LABEL, type LottieFacts } from '@/lib/lottie';
import { fromCanvas, sendPicture, type ReadPicture } from './ground';

export type ReadAnim = { file: File; facts: LottieFacts; aspect: number; poster: ReadPicture };
export type SentAnim = { url: string; poster: string; aspect: number; bytes: number } & LottieFacts;

export async function readAnim(file: File): Promise<ReadAnim> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (zipLike(bytes)) {
    throw new Error('That is a .lottie bundle, which is a zip. Export the animation as Lottie JSON instead — on LottieFiles it is the “Lottie JSON” download, and in After Effects it is Bodymovin’s .json.');
  }
  if (bytes.length > LOTTIE_MAX_BYTES) {
    throw new Error(`A vector animation must be ${LOTTIE_MAX_LABEL} or smaller; this one is ${Math.round(bytes.length / 1024)} kB. One that big is usually a picture embedded inside the animation, which belongs in a frame of its own.`);
  }
  const text = new TextDecoder().decode(bytes);
  const read = readLottie(text);
  if (!read.ok) throw new Error(read.why);
  const data = JSON.parse(text);
  return {
    file,
    facts: read.facts,
    aspect: Math.round((read.facts.height / read.facts.width) * 1e4) / 1e4,
    poster: await posterOf(data, read.facts),
  };
}

/**
 * The first frame, as a picture.
 *
 * Drawn by the player itself into a hidden box and then copied onto a
 * canvas, because the player draws SVG and a canvas is what an upload wants.
 * An SVG serialised and drawn through an `<img>` is the only way across that
 * line, and it needs the fonts and images inside the animation to be
 * self-contained — which for a Lottie they are, being paths and data URIs.
 */
async function posterOf(data: unknown, facts: LottieFacts): Promise<ReadPicture> {
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${facts.width}px;height:${facts.height}px`;
  document.body.appendChild(box);
  try {
    const lottie = (await import('lottie-web/build/player/esm/lottie_light.min.js')).default;
    const anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: data });
    // the first frame, drawn and then held there
    anim.goToAndStop(0, true);
    await new Promise((done) => requestAnimationFrame(() => done(null)));
    const svg = box.querySelector('svg');
    if (!svg) throw new Error('The animation would not draw its first frame.');
    svg.setAttribute('width', String(facts.width));
    svg.setAttribute('height', String(facts.height));
    const markup = new XMLSerializer().serializeToString(svg);
    anim.destroy();
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((done, fail) => {
      img.onload = () => done();
      img.onerror = () => fail(new Error('The animation’s first frame could not be turned into a still.'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = facts.width;
    canvas.height = facts.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot draw the first frame.');
    ctx.drawImage(img, 0, 0, facts.width, facts.height);
    return await fromCanvas(canvas, ctx);
  } finally {
    box.remove();
  }
}

/** The JSON through its own door, and the poster through the picture one. */
export async function sendAnim(read: ReadAnim, templateId: string): Promise<SentAnim> {
  const stem = read.file.name.replace(/\.[^.]+$/, '') || 'animation';
  const poster = await sendPicture(read.poster, `${stem}-poster`, templateId);
  const fd = new FormData();
  fd.set('file', read.file);
  fd.set('templateId', templateId);
  const res = await fetch('/api/admin/design-animation', { method: 'POST', body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'The animation could not be uploaded.');
  return { url: json.url as string, poster: poster.url, aspect: read.aspect, bytes: read.file.size, ...read.facts };
}
