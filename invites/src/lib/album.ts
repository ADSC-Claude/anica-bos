/**
 * What the shared album takes, in one place.
 *
 * These three numbers are told to three different people: the storage layer
 * enforces them, the guest upload form prints them under the file chooser, and
 * the couple reads them in the builder before they tell their guests anything.
 * Written out separately they drift, and drifting copy about a limit is how a
 * guest ends up told their photo is fine when it is about to be refused.
 *
 * Photos, not video. That is a decision and not an oversight: a thirty-second
 * clip from a phone is fifty to a hundred megabytes against a photograph's
 * two, it arrives in whatever a phone records — an iPhone's HEVC will not play
 * on half the devices a guest opens the page with — and putting it right means
 * a transcoding service and a monthly bill. The album is for photographs; the
 * couple's own prenup video is a YouTube or Vimeo link, which costs nothing to
 * carry.
 */

/** JPEG, PNG and WebP, checked by the file's own first bytes rather than its name. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** The most one photograph may weigh. A phone photo is two to four. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** How many a guest may pick in one go. */
export const PHOTOS_AT_ONCE = 20;

/** "10 MB", for the places that say it to somebody. */
export const PHOTO_MAX_LABEL = `${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)} MB`;
