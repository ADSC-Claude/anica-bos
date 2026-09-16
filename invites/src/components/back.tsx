'use client';

import type { MouseEvent } from 'react';

/**
 * The way back from a page a visitor stepped into. The arrow steps back
 * through their own history when they came from a page of ours, so they land
 * exactly where they were — a collection with its filters, the gallery
 * halfway down. A link opened cold has no history to step back through, so it
 * follows the href to the page above this one instead. Either way the sign is
 * a real link, and works with JavaScript off.
 */
export function BackArrow({ href, label, className = '' }: { href: string; label: string; className?: string }) {
  const step = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (!cameFromUs()) return;
    e.preventDefault();
    window.history.back();
  };
  return (
    <a href={href} onClick={step} className={`text-sm text-[color:var(--color-plum-600)] hover:underline ${className}`}>
      ← {label}
    </a>
  );
}

/** True when the page before this one was ours, so stepping back stays on the site. */
export function cameFromUs(): boolean {
  if (typeof window === 'undefined' || window.history.length <= 1) return false;
  try {
    return Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
  } catch {
    // a referrer we cannot read is not one we can trust to step back to
    return false;
  }
}
