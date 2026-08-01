'use client';

/**
 * "Back" that means the previous step, not the front door.
 *
 * The booking form is several steps inside one page, so a plain link home threw
 * away everything typed to get here — someone on "therapist & room" who wanted
 * to change their treatment lost the whole booking. The wizard pushes a history
 * entry per step, so stepping back is what the browser's own Back already does;
 * this makes the on-page control agree with it.
 *
 * The href stays real: without JavaScript, or on the first step, it goes home,
 * which is the right destination when there is nothing to go back to.
 */
export function BackLink({
  href = '/',
  label = 'Back',
  className = 'text-sm text-cocoa-600 underline underline-offset-4',
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // Read the live URL rather than a prop: the wizard changes the step with
        // history.pushState, which no React hook observes.
        const step = Number(new URLSearchParams(window.location.search).get('step') ?? '1');
        if (step > 1) {
          e.preventDefault();
          window.history.back();
        }
      }}
    >
      {label}
    </a>
  );
}
