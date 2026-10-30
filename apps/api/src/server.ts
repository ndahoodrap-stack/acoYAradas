import { assertConfig, config } from './config.js';
import { createApp } from './app.js';
import { getDatabase, closeDatabase } from './db/factory.js';
import { startJobs } from './jobs.js';
import { runMigrations } from './db/migrate.js';
import { seedDemoData } from './db/seed.js';

async function main() {
  assertConfig();
  const db = await getDatabase();

  // En desarrollo: ejecutar migraciones y seed al arrancar para que
  // migración, seed y servidor compartan la misma BD en memoria (memory://)
  if (!config.isProd) {
    console.log('[server] modo desarrollo: ejecutando migraciones y seed...');
    await runMigrations({ reset: true, db, silent: false });
    await seedDemoData(db);
    console.log('[server] migraciones y seed completados');
  }

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
