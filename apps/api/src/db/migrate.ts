import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { createDatabase } from './factory.js';
import type { Database } from './index.js';

/** Busca la raíz del repositorio (donde vive la carpeta supabase/). */
export async function findRepoRoot(start = process.cwd()): Promise<string> {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (await exists(path.join(dir, 'supabase', 'migrations'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('No se encontró la raíz del repositorio (supabase/migrations)');
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface MigrationFile {
  name: string;
  path: string;
}

export async function listMigrations(root: string, includeSupabaseOnly = false): Promise<MigrationFile[]> {
  const dirs = [path.join(root, 'supabase', 'migrations')];
  if (includeSupabaseOnly) dirs.push(path.join(root, 'supabase', 'supabase_only'));

  const files: MigrationFile[] = [];
  for (const dir of dirs) {
    if (!(await exists(dir))) continue;
    const entries = await fs.readdir(dir);
    for (const entry of entries.filter((f) => f.endsWith('.sql')).sort()) {
      files.push({ name: entry, path: path.join(dir, entry) });
    }
  }
  return files;
}

async function ensureMigrationsTable(db: Database) {
  await db.exec(`
    create schema if not exists ops;
    create table if not exists ops.schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

export async function runMigrations(options?: {
  reset?: boolean;
  root?: string;
  db?: Database;
  silent?: boolean;
}) {
  const root = options?.root ?? (await findRepoRoot());
  const externalDb = options?.db;
  const db = externalDb ?? (await createDatabase());
  const ownsDb = !externalDb;
  const log = options?.silent ? () => {} : (msg: string) => console.log(msg);

  try {
    await ensureMigrationsTable(db);

    if (options?.reset) {
      log('[migrate] reseteando esquema público...');
      await db.exec(`
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'acoyaradas_app') then
            create role acoyaradas_app nologin;
          end if;
        end
        $$;
        drop schema if exists public cascade;
        create schema public;
        grant usage on schema public to acoyaradas_app;
        alter default privileges in schema public grant select, insert, update, delete on tables to acoyaradas_app;
        alter default privileges in schema public grant usage, select on sequences to acoyaradas_app;
      `);
      await db.exec('drop table if exists ops.schema_migrations;');
      await ensureMigrationsTable(db);
    }

    const applied = new Set(
      (await db.system.query<{ name: string }>('select name from ops.schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );

    const files = await listMigrations(root, config.dbMode === 'supabase');
    for (const file of files) {
      if (applied.has(file.name)) continue;
      const sql = await fs.readFile(file.path, 'utf8');
      log(`[migrate] aplicando ${file.name}...`);
      await db.exec(sql);
      await db.system.query('insert into ops.schema_migrations (name) values ($1)', [file.name]);
    }

    log(`[migrate] listo (${files.length} migraciones disponibles, motor: ${db.kind}).`);
  } finally {
    if (ownsDb) await db.close();
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  runMigrations({ reset: process.argv.includes('--reset') }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] error:', err);
    process.exit(1);
  });
}
