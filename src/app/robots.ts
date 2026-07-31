import type { MetadataRoute } from 'next';

/**
 * Keep the staff side out of search results.
 *
 * The landing page and the booking flow should be found — that is the point of
 * having them. The sign-in screen and the portal should not: a staff login form
 * listed in Google is an invitation to try passwords against it.
 *
 * This is discouragement, not protection. Well-behaved crawlers honour it and
 * attackers do not, so it lowers how often the door is rattled without making it
 * any stronger. The lock is the password.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/login', '/portal', '/portal/', '/api/'],
    },
  };
}
