import { assertConfig, config } from './config.js';
import { createApp } from './app.js';
import { getDatabase, closeDatabase } from './db/factory.js';
import { startJobs } from './jobs.js';
import { runMigrations } from './db/migrate.js';
import { seedDemoData } from './db/seed.js';

async function main() {
  assertConfig();
  const db = await getDatabase();

  // Detectar entorno Render (más fiable que NODE_ENV)
  const isRender = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_ID;
  const isProduction = config.isProd || isRender;

  // Ejecutar migraciones en todos los entornos (sin reset en producción)
  // En desarrollo local: reset + seed para empezar limpio
  // En producción/Render: solo migraciones pendientes (sin reset, sin seed)
  console.log('[server] ejecutando migraciones...');
  await runMigrations({ reset: !isProduction, db, silent: false });

  if (!isProduction) {
    console.log('[server] modo desarrollo: ejecutando seed demo...');
    await seedDemoData(db);
    console.log('[server] seed completado');
  } else {
    console.log('[server] producción detectada: saltando seed demo');
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
