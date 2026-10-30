/**
 * Capa de acceso a datos.
 *
 * Dos motores con la MISMA API y las MISMAS migraciones/RLS:
 *   - local   : PostgreSQL embebido (PGlite) para desarrollo, demo y tests.
 *   - supabase: PostgreSQL de Supabase vía connection string (pooler).
 *
 * Contexto de ejecución:
 *   - `db.transaction(...)` corre como el rol restringido `acoyaradas_app`
 *     y aplica los claims del usuario (request.jwt.claims) => RLS real.
 *   - `db.system` corre como propietario de las tablas (contexto interno).
 *     Úsese solo para operaciones internas controladas (tracking por token,
 *     jobs programados, seed).
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DbExecutor {
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Database extends DbExecutor {
  kind: 'pglite' | 'postgres';
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  /** Contexto interno (propietario). Solo para tareas internas controladas. */
  system: DbExecutor;
  /** Ejecuta SQL con varias sentencias (simple query protocol). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface Claims {
  sub?: string | null;
  role?: string | null;
  email?: string | null;
  guest_token?: string | null;
  /**
   * Contexto interno del backend de autenticación ('auth').
   * Permite consultar las tablas de credenciales (local_users,
   * refresh_tokens) sin exponerlas al rol de los usuarios.
   */
  service?: string | null;
}

/** Rol de runtime: aplica RLS. El contexto system corre como propietario. */
export const RUNTIME_ROLE = 'acoyaradas_app';

export async function applyClaims(tx: DbExecutor, claims: Claims) {
  const payload = JSON.stringify({
    sub: claims.sub ?? null,
    role: claims.role ?? null,
    email: claims.email ?? null,
    guest_token: claims.guest_token ?? null,
    service: claims.service ?? null,
  });
  await tx.query('select set_config($1, $2, true)', ['request.jwt.claims', payload]);
  try {
    await tx.query(`set local role ${RUNTIME_ROLE}`);
  } catch {
    // Si la DB no soporta roles (como PGlite) o el rol no existe, continuamos solo con los claims.
    // El set_config arriba ya configuró request.jwt.claims para que RLS funcione.
  }
}
