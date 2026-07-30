/** CLI entry point: `npm run jobs:daily` */
import { runDailyJobs } from '../src/lib/jobs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

runDailyJobs()
  .then((report) => {
    console.log('Daily jobs complete:');
    for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${v}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
