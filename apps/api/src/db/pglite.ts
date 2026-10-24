import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Database, DbExecutor, QueryResult } from './index.js';

/**
 * PostgreSQL embebido (PGlite) para desarrollo, demo y tests.
 * Es el mismo motor PostgreSQL: las migraciones, constraints y políticas
 * RLS son idénticas a las de Supabase.
 */
export async function createPgliteDatabase(dataDir: string): Promise<Database> {
  if (dataDir !== 'memory://') {
    await fs.mkdir(dataDir, { recursive: true });
  }
  const pg = new PGlite(dataDir);
  await pg.waitReady;

  const makeExecutor = (runner: {
    query: (sql: string, params?: unknown[]) => Promise<any>;
  }): DbExecutor => ({
    query: async <R = any>(sql: string, params: unknown[] = []): Promise<QueryResult<R>> => {
      const res = await runner.query(sql, params as never[]);
      const rows = (res?.rows ?? []) as R[];
      const rowCount = typeof res?.affectedRows === 'number' ? res.affectedRows : rows.length;
      return { rows, rowCount };
    },
  });

  const system: DbExecutor = makeExecutor(pg);

  return {
    kind: 'pglite',
    query: system.query,
    system,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
    transaction: async <T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> => {
      return pg.transaction(async (tx) => fn(makeExecutor(tx)));
    },
    close: async () => {
      await pg.close();
    },
  };
}
