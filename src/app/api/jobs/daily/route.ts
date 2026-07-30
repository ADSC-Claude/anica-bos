import { NextResponse } from 'next/server';
import { runDailyJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily scheduled jobs. Protected by CRON_SECRET so only your scheduler can
 * trigger it:
 *
 *   curl -X POST https://YOUR_APP/api/jobs/daily -H "Authorization: Bearer $CRON_SECRET"
 *
 * On Vercel, add to vercel.json:
 *   { "crons": [{ "path": "/api/jobs/daily", "schedule": "0 22 * * *" }] }
 *   (22:00 UTC = 6am Manila)
 */
async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  const vercelCron = req.headers.get('x-vercel-cron');

  if (!vercelCron) {
    if (!secret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured; refusing to run.' },
        { status: 503 },
      );
    }
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
    }
  }

  try {
    const report = await runDailyJobs();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), report });
  } catch (err) {
    console.error('[jobs/daily]', err);
    return NextResponse.json({ error: 'Job failed. Check the server logs.' }, { status: 500 });
  }
}

export const POST = handler;
export const GET = handler;
