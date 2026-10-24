import pg from 'pg';
import type { Database, DbExecutor, QueryResult } from './index.js';

const { Pool } = pg;

// numeric -> number (los importes se manejan como number con redondeo explícito)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// int8 -> number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

/**
 * Conexión a PostgreSQL de Supabase (o cualquier Postgres gestionado)
 * usando el connection string (pooler o directo).
 */
export async function createPostgresDatabase(connectionString: string): Promise<Database> {
  const useSsl = process.env.NODE_ENV === 'production' || /supabase|pooler|sslmode=require/i.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  const makeExecutor = (runner: {
    query: (sql: string, params?: unknown[]) => Promise<any>;
  }): DbExecutor => ({
    query: async <R = any>(sql: string, params: unknown[] = []): Promise<QueryResult<R>> => {
      const res = await runner.query(sql, params as never[]);
      return { rows: (res?.rows ?? []) as R[], rowCount: res?.rowCount ?? (res?.rows?.length ?? 0) };
    },
  });

  const system: DbExecutor = makeExecutor(pool);

  return {
    kind: 'postgres',
    query: system.query,
    system,
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    transaction: async <T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(makeExecutor(client));
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.end();
    },
  };
}
