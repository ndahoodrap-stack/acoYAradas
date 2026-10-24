import { config } from '../config.js';
import type { Database } from './index.js';
import { createPgliteDatabase } from './pglite.js';
import { createPostgresDatabase } from './postgres.js';

let instance: Database | null = null;

export async function createDatabase(): Promise<Database> {
  if (config.dbMode === 'supabase') {
    return createPostgresDatabase(config.databaseUrl);
  }
  return createPgliteDatabase(config.pgliteDataDir);
}

/** Instancia compartida (singleton) del proceso. */
export async function getDatabase(): Promise<Database> {
  if (!instance) instance = await createDatabase();
  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
