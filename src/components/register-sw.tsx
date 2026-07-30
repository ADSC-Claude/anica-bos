'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the service worker and shows a persistent offline banner.
 * v1 caches today's schedule read-only; nothing critical is queued offline.
 */
export function RegisterServiceWorker() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration is best-effort */
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
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-clay-500 px-4 py-2 text-center text-xs font-semibold text-white no-print">
      You are offline — showing the last saved copy of today&apos;s schedule. Saving is
      disabled until the connection returns.
    </div>
  );
}
