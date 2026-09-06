/**
 * Runs the scheduled work from a terminal, for development and for a manual
 * catch-up after downtime. Vercel Cron hits the endpoint instead.
 *
 *   npm run jobs:daily
 */
import { runDailyJobs } from '../src/lib/jobs';

async function main() {
  const report = await runDailyJobs();
  console.info('\ndaily jobs:');
  for (const [key, value] of Object.entries(report)) {
    console.info(`  ${key.padEnd(28)} ${value}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
