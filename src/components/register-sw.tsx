'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the service worker and shows a persistent offline banner.
 * Caches today's schedule read-only; nothing critical is queued offline.
 */
export function RegisterServiceWorker({ version }: { version: string }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      // The version in the URL is what makes a deployment produce a *different*
      // service worker, so the old one's caches get dropped instead of
      // outliving it. updateViaCache: 'none' stops the browser serving this
      // script itself from its HTTP cache, which would defeat the same thing.
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(version)}`, { updateViaCache: 'none' })
        .catch(() => {
          /* registration is best-effort */
        });

      // A tab open across a deployment is holding markup whose Server Action
      // ids no longer exist — its forms would post into the void. When the new
      // worker takes over, reload once to pick the new deployment up.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [version]);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-clay-500 px-4 py-2 text-center text-xs font-semibold text-white no-print">
      You are offline — showing the last saved copy of today&apos;s schedule. Saving is
      disabled until the connection returns.
    </div>
  );
}
