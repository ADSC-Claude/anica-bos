import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/account', '/checkout', '/api', '/login', '/signup'] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
