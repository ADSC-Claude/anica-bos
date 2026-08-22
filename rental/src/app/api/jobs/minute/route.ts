import { handle, requireCronSecret } from '@/lib/guard';
import { runMinuteJobs } from '@/lib/jobs';

export const maxDuration = 60;

/** Vercel Cron every 15 minutes. Idempotent — a double fire changes nothing. */
export const POST = handle(async (req) => {
  requireCronSecret(req);
  return runMinuteJobs();
});

// Vercel Cron issues GETs; the same guard applies.
export const GET = POST;
