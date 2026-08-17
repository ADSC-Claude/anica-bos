/**
 * The name set as signage rather than as a line of text.
 *
 * "ANICA Wellness Spa" on one line reads as a sentence. Stacked — the name
 * wide-tracked above, the descriptor smaller and wider still beneath — it
 * reads as a mark, which is what a name beside a logo actually is.
 *
 * The split is on the first word, so a spa called "ANICA Wellness Spa" gives
 * ANICA / Wellness Spa, and a one-word name simply has no second line rather
 * than an empty gap.
 */
export function Wordmark({
  name,
  tone = 'dark',
  size = 'md',
}: {
  name: string;
  /** `light` for the cocoa header, `dark` for the sand footer. */
  tone?: 'light' | 'dark';
  size?: 'md' | 'lg';
}) {
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  const head = space > 0 ? trimmed.slice(0, space) : trimmed;
  const tail = space > 0 ? trimmed.slice(space + 1) : '';

  return (
    <span className="block leading-[1.05]">
      <span
        className={`block font-display uppercase ${
          size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
        } tracking-[0.3em] ${tone === 'light' ? 'text-white' : 'text-cocoa-800'}`}
      >
        {head}
      </span>
      {tail && (
        <span
          className={`block pl-[0.2em] text-[0.55rem] uppercase tracking-[0.4em] ${
            tone === 'light' ? 'text-sand-300' : 'text-gilt-600'
          }`}
        >
          {tail}
        </span>
      )}
    </span>
  );
}
