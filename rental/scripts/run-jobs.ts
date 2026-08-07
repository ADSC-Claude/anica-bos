/**
 * Runs the scheduled work from a terminal, for development and for a manual
 * catch-up after downtime. Vercel Cron hits the endpoints instead.
 *
 *   npm run jobs:minute
 *   npm run jobs:daily
 */
import { runMinuteJobs, runDailyJobs } from '../src/lib/jobs';

const which = process.argv[2] ?? 'minute';

async function main() {
  const report = which === 'daily' ? await runDailyJobs() : await runMinuteJobs();
  console.info(`\n${which} jobs:`);
  for (const [key, value] of Object.entries(report)) {
    console.info(`  ${key.padEnd(24)} ${value}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
