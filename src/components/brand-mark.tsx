/**
 * The ANICA mark.
 *
 * `business.logoUrl` was stored, editable in Settings, and read by nothing —
 * the flower glyph was hardcoded in three places, so uploading a logo appeared
 * to work and changed nothing. This is the one place that decides.
 *
 * The glyph stays as the fallback rather than an empty box, so the header is
 * never broken while a logo is being prepared.
 */
export function BrandMark({
  logoUrl,
  size = 36,
  className = '',
}: {
  logoUrl?: string;
  size?: number;
  className?: string;
}) {
  const src = (logoUrl ?? '').trim();
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cocoa-600 text-white ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // A plain <img>: the source is whatever the Owner typed into Settings,
        // and next/image would need every possible host declared in advance.
        // `contain` because a logo cropped to fill is a logo nobody recognises.
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain"
          style={{ padding: Math.round(size * 0.14) }}
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }}>✿</span>
      )}
    </span>
  );
}
