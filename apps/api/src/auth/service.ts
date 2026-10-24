import type { UserRole } from '@acoyaradas/shared';
import { config } from '../config.js';
import type { Database } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { publicToken } from '../lib/ids.js';
import { hashPassword, hashToken, verifyPassword } from './password.js';
import { signAccessToken } from './jwt.js';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  store_id: string | null;
  rider_id: string | null;
}

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
}

/* ------------------------------------------------------------------ */
/* Supabase Auth (modo authMode = supabase)                            */
/* ------------------------------------------------------------------ */

async function supabaseRequest(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: config.supabaseAnonKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const message = body?.msg || body?.message || body?.error_description || `HTTP ${res.status}`;
    throw badRequest(`Supabase Auth: ${message}`, body);
  }
  return body;
}

async function supabaseSignUp(email: string, password: string, full_name: string, phone: string) {
  return supabaseRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      data: { full_name, phone },
    }),
  });
}

async function supabasePasswordGrant(email: string, password: string) {
  return supabaseRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function supabaseUser(access_token: string) {
  return supabaseRequest('/auth/v1/user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${access_token}` },
  });
}

/* ------------------------------------------------------------------ */
/* Carga de perfil                                                     */
/* ------------------------------------------------------------------ */

export async function loadUserById(db: Database, id: string): Promise<AuthUser | null> {
  return db.transaction(async (tx) => {
    await applyClaims(tx, { sub: id, role: 'customer', email: '' });
    const profile = await tx.query<ProfileRow>(
      'select id, email, full_name, phone, role from public.profiles where id = $1 and deleted_at is null',
      [id],
    );
    if (!profile.rows.length) return null;
    const p = profile.rows[0];

    const membership = await tx.query<{ store_id: string }>(
      'select store_id from public.store_members where user_id = $1 limit 1',
      [id],
    );
    const store = await tx.query<{ id: string }>(
      'select id from public.stores where owner_id = $1 and deleted_at is null limit 1',
      [id],
    );
    const rider = await tx.query<{ id: string }>(
      'select id from public.riders where user_id = $1 limit 1',
      [id],
    );

    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      phone: p.phone,
      role: p.role,
      store_id: store.rows[0]?.id ?? membership.rows[0]?.store_id ?? null,
      rider_id: rider.rows[0]?.id ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Emisión de sesión                                                    */
/* ------------------------------------------------------------------ */

async function issueSession(db: Database, user: AuthUser, withRefresh = true): Promise<AuthResult> {
  const access_token = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  let refresh_token = '';

  if (withRefresh) {
    if (config.authMode === 'local') {
      refresh_token = publicToken(32);
      await db.transaction(async (tx) => {
        await applyClaims(tx, { sub: user.id, role: user.role, email: user.email });
        await tx.query(
          `insert into public.refresh_tokens (user_id, token_hash, expires_at)
           values ($1, $2, now() + $3::int * interval '1 second')`,
          [user.id, hashToken(refresh_token), config.refreshTokenTtlSeconds],
        );
      });
    } else {
      // En modo Supabase la sesión real vive en Supabase Auth; devolvemos un
      // token opaco de nuestra parte para el refresco.
      refresh_token = publicToken(32);
      await db.transaction(async (tx) => {
        await applyClaims(tx, { sub: user.id, role: user.role, email: user.email });
        await tx.query(
          `insert into public.refresh_tokens (user_id, token_hash, expires_at)
           values ($1, $2, now() + $3::int * interval '1 second')`,
          [user.id, hashToken(refresh_token), config.refreshTokenTtlSeconds],
        );
      });
    }
  }

  return { access_token, refresh_token, expires_in: config.accessTokenTtlSeconds, user };
}

/* ------------------------------------------------------------------ */
/* Registro / login / refresco                                          */
/* ------------------------------------------------------------------ */

export async function registerUser(
  db: Database,
  input: { email: string; password: string; full_name: string; phone?: string },
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  let userId: string;

  if (config.authMode === 'supabase') {
    const result = await supabaseSignUp(email, input.password, input.full_name, phone ?? '');
    const id = result?.user?.id;
    if (!id) throw badRequest('Supabase no devolvió un usuario válido');
    userId = id;
  } else {
    const existing = await db.transaction(async (tx) => {
      await applyClaims(tx, { sub: null, role: 'customer', email, service: 'auth' });
      return tx.query<{ id: string }>('select id from public.local_users where lower(email) = lower($1)', [
        email,
      ]);
    });
    if (existing.rows.length) throw conflict('Ya existe una cuenta con ese email');

    const id = publicToken(16).replace(/[^a-f0-9]/g, '').padEnd(32, '0').slice(0, 32);
    const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`;
    userId = uuid;

    await db.transaction(async (tx) => {
      await applyClaims(tx, { sub: userId, role: 'customer', email });
      await tx.query(
        `insert into public.local_users (id, email, password_hash, role) values ($1,$2,$3,'customer')`,
        [userId, email, await hashPassword(input.password)],
      );
    });
  }

  await db.transaction(async (tx) => {
    await applyClaims(tx, { sub: userId, role: 'customer', email });
    const existing = await tx.query('select id from public.profiles where id = $1', [userId]);
    if (existing.rows.length) {
      await tx.query(
        'update public.profiles set full_name = $2, phone = $3, updated_at = now() where id = $1',
        [userId, input.full_name, phone],
      );
    } else {
      await tx.query(
        `insert into public.profiles (id, email, full_name, phone, role)
         values ($1,$2,$3,$4,'customer')`,
        [userId, email, input.full_name, phone],
      );
    }
  });

  const user = await loadUserById(db, userId);
  if (!user) throw badRequest('No se pudo crear el usuario');
  return issueSession(db, user);
}

export async function loginUser(
  db: Database,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();

  if (config.authMode === 'supabase') {
    const session = await supabasePasswordGrant(email, input.password);
    const accessToken = session?.access_token;
    if (!accessToken) throw unauthorized('Credenciales inválidas');
    const supaUser = await supabaseUser(accessToken);
    const userId = supaUser?.id;
    if (!userId) throw unauthorized('Credenciales inválidas');
    await db.transaction(async (tx) => {
      await applyClaims(tx, { sub: userId, role: 'customer', email });
      const existing = await tx.query('select id from public.profiles where id = $1', [userId]);
      if (!existing.rows.length) {
        await tx.query(
          `insert into public.profiles (id, email, full_name, phone, role)
           values ($1,$2,$3,$4,'customer')`,
          [
            userId,
            supaUser.email ?? email,
            supaUser.user_metadata?.full_name ?? null,
            supaUser.user_metadata?.phone ?? null,
          ],
        );
      }
    });
    const user = await loadUserById(db, userId);
    if (!user) throw unauthorized('Credenciales inválidas');
    return issueSession(db, user);
  }

  const row = await db.transaction(async (tx) => {
    await applyClaims(tx, { sub: null, role: 'customer', email, service: 'auth' });
    return tx.query<{ id: string; password_hash: string }>(
      'select id, password_hash from public.local_users where lower(email) = lower($1)',
      [email],
    );
  });
  if (!row.rows.length) throw unauthorized('Credenciales inválidas');

  const ok = await verifyPassword(input.password, row.rows[0].password_hash);
  if (!ok) throw unauthorized('Credenciales inválidas');

  const user = await loadUserById(db, row.rows[0].id);
  if (!user) throw unauthorized('Credenciales inválidas');
  return issueSession(db, user);
}

export async function refreshSession(db: Database, refreshToken: string): Promise<AuthResult> {
  if (!refreshToken) throw unauthorized('Refresh token inválido');

  const row = await db.transaction(async (tx) => {
    await applyClaims(tx, { sub: null, role: 'customer', email: '', service: 'auth' });
    return tx.query<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
      `select id, user_id, expires_at, revoked_at from public.refresh_tokens where token_hash = $1`,
      [hashToken(refreshToken)],
    );
  });
  const token = row.rows[0];
  if (!token || token.revoked_at || new Date(token.expires_at).getTime() < Date.now()) {
    throw unauthorized('Sesión vencida, iniciá sesión de nuevo');
  }

  const user = await loadUserById(db, token.user_id);
  if (!user) throw unauthorized('Sesión vencida, iniciá sesión de nuevo');

  // Rotación del refresh token
  await db.transaction(async (tx) => {
    await applyClaims(tx, { sub: user.id, role: user.role, email: user.email });
    await tx.query('update public.refresh_tokens set revoked_at = now() where id = $1', [token.id]);
  });

  return issueSession(db, user);
}

export async function revokeSession(db: Database, refreshToken: string): Promise<void> {
  if (!refreshToken) return;
  await db.transaction(async (tx) => {
    await applyClaims(tx, { sub: null, role: 'customer', email: '', service: 'auth' });
    await tx.query(
      'update public.refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null',
      [hashToken(refreshToken)],
    );
  });
}
