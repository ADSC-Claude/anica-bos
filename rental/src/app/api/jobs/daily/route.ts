import { handle, requireCronSecret } from '@/lib/guard';
import { runDailyJobs } from '@/lib/jobs';

export const maxDuration = 300;

/** Vercel Cron at 22:00 UTC = 06:00 Manila. Idempotent. */
export const POST = handle(async (req) => {
  requireCronSecret(req);
  return runDailyJobs();
});

export const GET = POST;
