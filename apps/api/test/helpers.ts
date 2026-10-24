import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPgliteDatabase } from '../src/db/pglite.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDemoData, DEMO_PASSWORD } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import type { Database } from '../src/db/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/test -> raíz del monorepo */
export const REPO_ROOT = path.resolve(here, '..', '..', '..');

export interface TestServer {
  baseUrl: string;
  db: Database;
  close: () => Promise<void>;
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
  guestToken: string | null;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  guest?: string | null;
  headers?: Record<string, string>;
}

/**
 * Levanta la API completa sobre una base PGlite en memoria, migrada y con
 * los datos de demostración. Cada archivo de pruebas usa su propia instancia
 * (aislamiento total entre archivos).
 */
export async function startTestServer(): Promise<TestServer> {
  const db = await createPgliteDatabase('memory://');
  await runMigrations({ db, root: REPO_ROOT, silent: true });
  await seedDemoData(db);

  const app = createApp(db);
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    db,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

/** Cliente HTTP mínimo contra la API de pruebas. */
export function createClient(baseUrl: string) {
  return async function api<T = any>(
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.guest) headers['x-guest-token'] = options.guest;

    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return {
      status: res.status,
      body: body as T,
      headers: res.headers,
      guestToken: res.headers.get('x-guest-token'),
    };
  };
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string; role: string; store_id?: string | null; rider_id?: string | null };
}

export const DEMO_ACCOUNTS = {
  admin: 'admin@acoyaradas.app',
  store: 'comercio@acoyaradas.app',
  store2: 'rotiseria@acoyaradas.app',
  store3: 'kiosco@acoyaradas.app',
  rider: 'repartidor@acoyaradas.app',
  customer: 'cliente@acoyaradas.app',
} as const;

export { DEMO_PASSWORD };

export async function login(
  api: ReturnType<typeof createClient>,
  email: string,
  password = DEMO_PASSWORD,
): Promise<Session> {
  const res = await api<Session>('/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200 || !res.body?.access_token) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}
