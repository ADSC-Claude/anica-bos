import type { CSSProperties } from 'react';
/**
 * The Baby Blue layout's drawn pages, measured off the designer's grounds.
 *
 * Two of the ten grounds are finished artwork with empty polaroid frames:
 * Our Story (six frames down a timeline) and Baby Photos (four). The client's
 * photographs drop into those frames, and the writings the designer set on
 * them — the heading, the line under it, each milestone's name and its line —
 * are erased from the ground and set live, so staff and the client can change
 * them. Everything here is a share of the ground's width (x, sizes) or height
 * (y), so it holds at any phone width; the tilt is the frame's, in degrees.
 */
export type Slot = {
  /** centre of the photo area, % of the ground's width and height */
  cx: number;
  cy: number;
  /** side of the (square) photo area, % of the width */
  size: number;
  /** the frame's lean, degrees, as CSS rotate */
  tilt: number;
};

/** A milestone's words on the story page: centred on `cx`, starting at `top`. */
export type Label = { cx: number; top: number; width: number };

/** Our Story: 725 × 2167. */
export const STORY_SLOTS: Slot[] = [
  { cx: 25.93, cy: 22.2, size: 27.2, tilt: -7 },
  { cx: 74.48, cy: 33.41, size: 26.6, tilt: 7.5 },
  { cx: 26.9, cy: 45.96, size: 27.2, tilt: -7 },
  { cx: 75.31, cy: 58.24, size: 27.6, tilt: 8.6 },
  { cx: 26.76, cy: 69.77, size: 27.2, tilt: -7.3 },
  { cx: 74.76, cy: 82.23, size: 27.9, tilt: 9.1 },
];
/** Each milestone's words sit beside its frame, under the drawn icon. */
export const STORY_LABELS: Label[] = [
  { cx: 69.7, top: 21.1, width: 26 },
  { cx: 31.3, top: 33.4, width: 27 },
  { cx: 70.3, top: 46.1, width: 26 },
  { cx: 29.0, top: 57.9, width: 33 },
  { cx: 70.3, top: 71.0, width: 26 },
  { cx: 32.7, top: 82.6, width: 29 },
];
/** The heading and the line under it, where the designer set them. */
export const STORY_HEAD = { titleTop: 9.6, lineTop: 12.5 };

/** Baby Photos: 941 × 1672. */
export const PHOTO_SLOTS: Slot[] = [
  { cx: 31.24, cy: 36.96, size: 26.7, tilt: -9.4 },
  { cx: 68.23, cy: 45.33, size: 27.3, tilt: 9.4 },
  { cx: 30.92, cy: 63.34, size: 27.3, tilt: -10.8 },
  { cx: 69.61, cy: 71.35, size: 27.7, tilt: 12 },
];
/** Baby Photos is 941 × 1672: its height as a share of its width, for placing in cqw. */
export const PHOTO_ASPECT = 1672 / 941;
/**
 * The polaroid's strip below its photo, where the client's caption is written
 * in the design's script: how far below the photo's bottom edge the caption's
 * centre sits, as a share of the ground's width. The frame leans, so the
 * caption leans with it, placed along the frame's own axis.
 */
export const PHOTO_STRIP = { below: 4.3, width: 0.92 };

export function captionStyle(slot: Slot, aspect = PHOTO_ASPECT): CSSProperties {
  const t = (slot.tilt * Math.PI) / 180;
  const d = slot.size / 2 + PHOTO_STRIP.below;
  const x = slot.cx - d * Math.sin(t);
  const y = slot.cy * aspect + d * Math.cos(t);
  return { left: `${x}cqw`, top: `${y}cqw`, width: `${slot.size * PHOTO_STRIP.width}cqw`, transform: `translate(-50%, -50%) rotate(${slot.tilt}deg)` };
}

export const PHOTO_HEAD = { eyebrowTop: 9.4, titleTop: 12.6, lineTop: 20.5 };

/** The style that puts a photo in its frame. */
export function slotStyle(s: Slot): Record<string, string> {
  return { left: `${s.cx}%`, top: `${s.cy}%`, width: `${s.size}%`, transform: `translate(-50%, -50%) rotate(${s.tilt}deg)` };
}
export function labelStyle(l: Label): Record<string, string> {
  return { left: `${l.cx}%`, top: `${l.top}%`, width: `${l.width}%`, transform: 'translateX(-50%)' };
}
