import 'dotenv/config';
import cron from 'node-cron';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { generateAllOccurrences } from './jobs/generateOccurrences.js';
import { runDatabaseBackup } from './jobs/backupDb.js';
import { ensureSystemTeams } from './jobs/ensureSystemTeams.js';
import { runAvailabilityReminderCycle } from './jobs/sendAvailabilityReminders.js';

async function main() {
  const app = await buildApp();

  await ensureSystemTeams();

  const { eventsProcessed, occurrencesCreated } = await generateAllOccurrences();
  app.log.info({ eventsProcessed, occurrencesCreated }, 'Generated recurring event occurrences on boot');

  cron.schedule('0 3 * * *', async () => {
    const result = await generateAllOccurrences();
    app.log.info(result, 'Generated recurring event occurrences (daily job)');
  });

  cron.schedule('0 2 * * *', async () => {
    try {
      await runDatabaseBackup(app.log);
    } catch (err) {
      app.log.error(err, 'Database backup failed');
    }
  });

  cron.schedule('0 8 * * *', async () => {
    try {
      await runAvailabilityReminderCycle(app.log);
    } catch (err) {
      app.log.error(err, 'Availability reminder cycle failed');
    }
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
