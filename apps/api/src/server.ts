import { assertConfig, config } from './config.js';
import { createApp } from './app.js';
import { getDatabase, closeDatabase } from './db/factory.js';
import { startJobs } from './jobs.js';

async function main() {
  assertConfig();
  const db = await getDatabase();
  const app = createApp(db);
  const stopJobs = startJobs(db);

  const server = app.listen(config.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(
      `acoYAradas! API escuchando en http://0.0.0.0:${config.port}${config.apiPrefix} (motor: ${db.kind}, auth: ${config.authMode})`,
    );
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[server] ${signal} recibido, cerrando...`);
    stopJobs();
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] no se pudo iniciar:', err);
  process.exit(1);
});
